import type { TFunction } from 'i18next'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
    acceptMatrixPaymentRequest,
    cancelMatrixPayment,
    joinMatrixRoom,
    observeMatrixRoom,
    observeMatrixSyncStatus,
    rejectMatrixPaymentRequest,
    searchMatrixUsers,
    selectCanClaimPayment,
    selectCanPayFromOtherFeds,
    selectCanSendPayment,
    selectIsInternetUnreachable,
    selectIsMatrixReady,
    selectLatestMatrixRoomEventId,
    selectMatrixAuth,
    selectMatrixPushNotificationToken,
    selectMatrixRoom,
    selectMatrixRoomMember,
    selectMatrixUser,
    sendMatrixReadReceipt,
    unobserveMatrixRoom,
    unsubscribeMatrixSyncStatus,
    selectMatrixContactsList,
} from '../redux'
import {
    MatrixPaymentEvent,
    MatrixPaymentStatus,
    MatrixRoom,
    MatrixUser,
} from '../types'
import { FedimintBridge } from '../utils/fedimint'
import { formatErrorMessage } from '../utils/format'
import {
    decodeFediMatrixUserUri,
    isValidMatrixUserId,
    makeMatrixPaymentText,
    matrixIdToUsername,
} from '../utils/matrix'
import { MatrixUrlMetadata, matrixUrlMetadataSchema } from '../utils/media'
import { useAmountFormatter } from './amount'
import { useCommonDispatch, useCommonSelector } from './redux'
import { useToast } from './toast'
import { useUpdatingRef } from './util'

/**
 * Hook to retrieve the push notification token from the Redux store.
 * @returns The latest push notification token, or null if not set.
 */
export function usePushNotificationToken() {
    const pushNotificationToken = useCommonSelector(
        selectMatrixPushNotificationToken,
    )
    return pushNotificationToken
}

export function useMatrixUserSearch() {
    const dispatch = useCommonDispatch()
    const [searchQuery, setSearchQuery] = useState('')
    const [searchedUsers, setSearchedUsers] = useState<MatrixUser[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [searchError, setSearchError] = useState<unknown>()
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

    // Grab your recent room members from state (limit 10 for example).
    const contactsList = useCommonSelector(s => selectMatrixContactsList(s))

    const query = searchQuery.trim()

    // If the user types in a valid matrix user ID, or a valid fedi matrix user URI,
    // then use that as the exact match user.
    let queryUserId: string | undefined
    if (isValidMatrixUserId(query)) {
        queryUserId = query
    } else {
        try {
            queryUserId = decodeFediMatrixUserUri(query)
        } catch {
            // no-op
        }
    }
    const exactMatchUsers = useCommonSelector(s => {
        if (!queryUserId) return undefined
        const user = selectMatrixUser(s, queryUserId)
        if (user) return [user]
        return [
            {
                id: queryUserId,
                displayName: matrixIdToUsername(queryUserId),
                avatarUrl: undefined,
            },
        ]
    })

    // Search for users, debounced by 500ms
    useEffect(() => {
        setSearchError(undefined)
        if (!query) {
            setIsSearching(false)
            setSearchedUsers([])
            return
        }
        setIsSearching(true)
        timeoutRef.current = setTimeout(() => {
            dispatch(searchMatrixUsers(query))
                .unwrap()
                .then(res => {
                    // Filter by checking which users from DMs are in the search results
                    const partialMatchedMemberIds = contactsList
                        .filter(m =>
                            m.displayName
                                ?.toLowerCase()
                                .includes(query.toLowerCase()),
                        )
                        .map(m => m.id)

                    const filteredUsers = res.results.filter(r =>
                        partialMatchedMemberIds.includes(r.id),
                    )
                    setSearchedUsers(filteredUsers)
                })
                .catch(err => setSearchError(err))
                .finally(() => setIsSearching(false))
        }, 500)
        return () => clearTimeout(timeoutRef.current)
    }, [dispatch, query, contactsList])

    return {
        query: searchQuery,
        setQuery: setSearchQuery,
        isSearching: exactMatchUsers ? false : isSearching,
        searchedUsers: exactMatchUsers || searchedUsers,
        searchError,
    }
}

export function useObserveMatrixRoom(
    roomId: string | null | undefined,
    paused = false,
) {
    const dispatch = useCommonDispatch()
    const latestEventId = useCommonSelector(s =>
        roomId ? selectLatestMatrixRoomEventId(s, roomId) : undefined,
    )
    const room = useCommonSelector(s =>
        roomId ? selectMatrixRoom(s, roomId) : undefined,
    )
    const isReady = useCommonSelector(s => selectIsMatrixReady(s))

    useEffect(() => {
        if (!isReady || !roomId || paused) return
        dispatch(observeMatrixRoom({ roomId }))
        return () => {
            // Don't unobserve DMs so ecash gets claimed in the
            // background
            //
            // TODO: remove when background ecash redemption
            // is moved to the bridge
            if (room?.directUserId) return
            dispatch(unobserveMatrixRoom({ roomId }))
        }
    }, [isReady, roomId, paused, dispatch, room?.directUserId])

    useEffect(() => {
        if (!isReady || !roomId || paused || !latestEventId) return
        dispatch(sendMatrixReadReceipt({ roomId, eventId: latestEventId }))
    }, [isReady, roomId, paused, latestEventId, dispatch])
}

type PaymentThunkAction = ReturnType<
    | typeof cancelMatrixPayment
    | typeof acceptMatrixPaymentRequest
    | typeof rejectMatrixPaymentRequest
>

/**
 * Given a MatrixPaymentEvent, returns all the information necessary for
 * rendering the payment.
 */
export function useMatrixPaymentEvent({
    event,
    fedimint,
    t,
    onError,
    onPayWithForeignEcash,
}: {
    event: MatrixPaymentEvent
    fedimint: FedimintBridge
    t: TFunction
    onError: (err: unknown) => void
    onPayWithForeignEcash?: () => void
}) {
    const dispatch = useCommonDispatch()
    const isOffline = useCommonSelector(selectIsInternetUnreachable)
    const canClaimPayment = useCommonSelector(s =>
        selectCanClaimPayment(s, event),
    )
    const canSendPayment = useCommonSelector(s =>
        selectCanSendPayment(s, event),
    )
    const canPayFromOtherFeds = useCommonSelector(s =>
        selectCanPayFromOtherFeds(s, event),
    )
    const matrixAuth = useCommonSelector(selectMatrixAuth)
    const eventSender = useCommonSelector(s =>
        selectMatrixRoomMember(s, event.roomId, event.senderId || ''),
    )
    const paymentSender = useCommonSelector(s =>
        selectMatrixRoomMember(s, event.roomId, event.content.senderId || ''),
    )
    const paymentRecipient = useCommonSelector(s =>
        selectMatrixRoomMember(
            s,
            event.roomId,
            event.content.recipientId || '',
        ),
    )
    const federationInviteCode = event.content.inviteCode
    const isDm = useCommonSelector(
        s => !!selectMatrixRoom(s, event.roomId)?.directUserId,
    )
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()
    const [isCanceling, setIsCanceling] = useState(false)
    const [isAccepting, setIsAccepting] = useState(false)
    const [isRejecting, setIsRejecting] = useState(false)
    const [isHandlingForeignEcash, setIsHandlingForeignEcash] = useState(false)
    const onErrorRef = useUpdatingRef(onError)

    const handleDispatchPaymentUpdate = useCallback(
        async (
            action: PaymentThunkAction,
            setIsLoading: typeof setIsCanceling,
        ) => {
            setIsLoading(true)
            try {
                await dispatch(action).unwrap()
            } catch (err) {
                onErrorRef.current(err)
            }
            setIsLoading(false)
        },
        [dispatch, onErrorRef],
    )

    const handleCancel = useCallback(() => {
        handleDispatchPaymentUpdate(
            cancelMatrixPayment({ fedimint, event }),
            setIsCanceling,
        )
    }, [fedimint, event, handleDispatchPaymentUpdate])

    const handleAcceptRequest = useCallback(async () => {
        if (canSendPayment) {
            handleDispatchPaymentUpdate(
                acceptMatrixPaymentRequest({ fedimint, event }),
                setIsAccepting,
            )
        } else if (onPayWithForeignEcash && canPayFromOtherFeds) {
            onPayWithForeignEcash()
            handleDispatchPaymentUpdate(
                rejectMatrixPaymentRequest({ event }),
                setIsRejecting,
            )
        } else {
            onErrorRef.current('errors.please-join-a-federation')
        }
    }, [
        canPayFromOtherFeds,
        canSendPayment,
        event,
        fedimint,
        handleDispatchPaymentUpdate,
        onErrorRef,
        onPayWithForeignEcash,
    ])

    const handleRejectRequest = useCallback(async () => {
        handleDispatchPaymentUpdate(
            rejectMatrixPaymentRequest({ event }),
            setIsRejecting,
        )
    }, [event, handleDispatchPaymentUpdate])

    const handleAcceptForeignEcash = useCallback(async () => {
        setIsHandlingForeignEcash(true)
    }, [])

    const messageText = makeMatrixPaymentText({
        t,
        event,
        myId: matrixAuth?.userId || '',
        eventSender,
        paymentSender,
        paymentRecipient,
        makeFormattedAmountsFromMSats,
    })
    const paymentStatus = event.content.status
    const isSentByMe = event.content.senderId === matrixAuth?.userId
    const isRecipient = event.content.recipientId === matrixAuth?.userId

    let statusIcon: 'x' | 'reject' | 'check' | 'error' | 'loading' | undefined
    let statusText: string | undefined
    let buttons: {
        label: string
        handler: () => void
        loading?: boolean
        disabled?: boolean
    }[] = []
    if (paymentStatus === MatrixPaymentStatus.received) {
        statusIcon = 'check'
        statusText = isRecipient ? t('words.received') : t('words.paid')
    } else if (paymentStatus === MatrixPaymentStatus.rejected) {
        statusIcon = 'reject'
        statusText = t('words.rejected')
    } else if (paymentStatus === MatrixPaymentStatus.canceled) {
        statusIcon = 'x'
        statusText = t('words.canceled')
    } else if (
        paymentStatus === MatrixPaymentStatus.pushed ||
        paymentStatus === MatrixPaymentStatus.accepted
    ) {
        if (!canClaimPayment) {
            buttons = [
                {
                    label: t('words.reject'),
                    handler: handleRejectRequest,
                    loading: isRejecting,
                    disabled: isAccepting,
                },
                {
                    label: t('words.accept'),
                    handler: handleAcceptForeignEcash,
                    loading: isRejecting,
                    disabled: isAccepting,
                },
            ]
            buttons.push()
        } else if (isRecipient) {
            statusIcon = 'loading'
            statusText = `${t('words.receiving')}...`
        } else if (isSentByMe) {
            if (paymentStatus === MatrixPaymentStatus.accepted) {
                statusIcon = 'check'
                statusText = t('words.sent')
            }
            buttons = [
                {
                    label: t('words.cancel'),
                    handler: handleCancel,
                    disabled: isOffline,
                    loading: isCanceling,
                },
            ]
        } else {
            statusIcon = 'check'
            statusText = t('feature.chat.paid-by-name', {
                name:
                    paymentSender?.displayName ||
                    matrixIdToUsername(event.senderId),
            })
        }
    } else if (paymentStatus === MatrixPaymentStatus.requested) {
        if (isRecipient) {
            buttons = [
                {
                    label: t('words.cancel'),
                    handler: handleCancel,
                    loading: isCanceling,
                    disabled: isOffline,
                },
            ]
        } else {
            buttons = []
            if (isDm) {
                buttons.push({
                    label: t('words.reject'),
                    handler: handleRejectRequest,
                    loading: isRejecting,
                    disabled: isAccepting,
                })
            }
            buttons.push({
                label: t('words.pay'),
                handler: handleAcceptRequest,
                loading: isAccepting,
                disabled: isRejecting,
            })
        }
    }

    return {
        messageText,
        statusIcon,
        statusText,
        buttons,
        isHandlingForeignEcash,
        setIsHandlingForeignEcash,
        federationInviteCode,
        paymentSender,
        handleRejectRequest,
    }
}

export function useMatrixChatInvites(t: TFunction) {
    const dispatch = useCommonDispatch()
    const toast = useToast()

    const joinPublicGroup = async (
        roomId: MatrixRoom['id'],
    ): Promise<boolean> => {
        try {
            // For now, only public rooms can be joined by scanning
            // TODO: Implement knocking to support non-public rooms
            await dispatch(joinMatrixRoom({ roomId, isPublic: true })).unwrap()
            return true
        } catch (err) {
            const errorMessage = formatErrorMessage(
                t,
                err,
                'errors.bad-connection',
            )
            if (errorMessage.includes('Cannot join user who was banned')) {
                toast.error(t, 'errors.you-have-been-banned')
            } else {
                toast.error(t, err)
            }
            throw err
        }
    }

    return {
        joinPublicGroup,
    }
}

export function useObserveMatrixSyncStatus(isMatrixStarted: boolean) {
    const dispatch = useCommonDispatch()
    useEffect(() => {
        if (!isMatrixStarted) return
        dispatch(observeMatrixSyncStatus())

        return () => {
            dispatch(unsubscribeMatrixSyncStatus())
        }
    }, [isMatrixStarted, dispatch])
}

export function useMatrixUrlPreview({
    url,
    fedimint,
}: {
    url: string
    fedimint: FedimintBridge
}) {
    const [urlPreview, setUrlPreview] = useState<MatrixUrlMetadata | null>(null)

    useEffect(() => {
        fedimint.matrixGetMediaPreview({ url }).then(info => {
            const parsedPreview = matrixUrlMetadataSchema.safeParse(info.data)

            if (parsedPreview.success) {
                setUrlPreview(parsedPreview.data)
            }
        })
    }, [url, fedimint])

    return urlPreview
}
