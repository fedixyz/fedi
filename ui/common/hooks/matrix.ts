import type { TFunction } from 'i18next'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
    acceptMatrixPaymentRequest,
    cancelMatrixPayment,
    joinMatrixRoom,
    observeMatrixRoom,
    observeMatrixSyncStatus,
    paginateMatrixRoomTimeline,
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
    selectMatrixRoomPaginationStatus,
    selectMatrixUser,
    sendMatrixReadReceipt,
    unobserveMatrixRoom,
    unsubscribeMatrixSyncStatus,
    selectMatrixContactsList,
    observeMultispendEvent,
    unobserveMultispendEvent,
    observeMultispendAccountInfo,
    unobserveMultispendAccountInfo,
    checkBolt11PaymentResult,
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
    MatrixUrlMetadata,
    matrixUrlMetadataSchema,
} from '../utils/matrix'
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

/*
 * This hook activates several effects for observing chat activity
 * 1) establishes 4 observers (pagination status, timeline, members list, power levels)
 * 2) sends a read receipt for the latest event
 * 3) fetches the most recent events & paginates to fetch earlier events
 * 4) handles paginating when the user scrolls up to the earliest message
 *
 * the control flow is such that we don't call paginateTimeline until the pagination
 * status has been observed and is defined
 *
 */
export function useObserveMatrixRoom(roomId: MatrixRoom['id'], paused = false) {
    const [hasPaginated, setHasPaginated] = useState(false)
    const dispatch = useCommonDispatch()
    // latestEventId is used for sending read receipts
    const latestEventId = useCommonSelector(s =>
        roomId ? selectLatestMatrixRoomEventId(s, roomId) : undefined,
    )
    const paginationStatus = useCommonSelector(s =>
        roomId ? selectMatrixRoomPaginationStatus(s, roomId) : undefined,
    )
    const room = useCommonSelector(s =>
        roomId ? selectMatrixRoom(s, roomId) : undefined,
    )
    const isReady = useCommonSelector(s => selectIsMatrixReady(s))

    const isPaginating = useMemo(() => {
        return paginationStatus === 'paginating'
    }, [paginationStatus])

    // observeMatrixRoom establishes all of the relevant observables
    // when unmounting we unobserve the room, but only for groupchats
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

    const handlePaginate = useCallback(async () => {
        // don't paginate if we don't know the pagination status yet
        if (!paginationStatus) return
        // don't paginate if we're already paginating
        if (isPaginating) return
        // don't paginate if there is nothing else to paginate
        if (paginationStatus === 'timelineStartReached') return
        await dispatch(
            paginateMatrixRoomTimeline({ roomId, limit: 15 }),
        ).unwrap()
    }, [paginationStatus, isPaginating, dispatch, roomId])

    // this is the initial pagination fetch for most recent events which
    // waits until the pagination status is observed and defined
    // a hasPaginated flag is used to make sure this only runs once
    // subsequent fetches trigger via handlePaginate by whatever component is using this hook
    useEffect(() => {
        if (!isReady || paused || hasPaginated || !paginationStatus) return
        setHasPaginated(true)
        handlePaginate()
    }, [isReady, paused, handlePaginate, hasPaginated, paginationStatus])

    return {
        paginationStatus,
        isPaginating,
        handlePaginate,
        showLoading: isPaginating,
    }
}

type PaymentThunkAction = ReturnType<
    | typeof cancelMatrixPayment
    | typeof acceptMatrixPaymentRequest
    | typeof rejectMatrixPaymentRequest
>

// MUST be in the federation to use
export function useObserveMultispendAccountInfo(roomId: MatrixRoom['id']) {
    const dispatch = useCommonDispatch()
    useEffect(() => {
        dispatch(observeMultispendAccountInfo({ roomId }))
        return () => {
            dispatch(unobserveMultispendAccountInfo({ roomId }))
        }
    }, [dispatch, roomId])
}

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
    onViewBolt11,
    onCopyBolt11,
}: {
    event: MatrixPaymentEvent
    fedimint: FedimintBridge
    t: TFunction
    onError: (err: unknown) => void
    onPayWithForeignEcash?: () => void
    onViewBolt11?: (bolt11: string) => void
    onCopyBolt11?: (bolt11: string) => void
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

    const handleViewBolt11 = useCallback(() => {
        if (onViewBolt11 && event.content.bolt11) {
            onViewBolt11(event.content.bolt11)
        }
    }, [event, onViewBolt11])

    const handleCopyBolt11 = useCallback(() => {
        if (onCopyBolt11 && event.content.bolt11) {
            onCopyBolt11(event.content.bolt11)
        }
    }, [event, onCopyBolt11])

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
    const isBolt11 = !!event.content.bolt11

    let statusIcon: 'x' | 'reject' | 'check' | 'error' | 'loading' | undefined
    let statusText: string | undefined
    let buttons: {
        label: string
        handler: () => void
        loading?: boolean
        disabled?: boolean
    }[] = []
    if (isBolt11) {
        if (onViewBolt11) {
            buttons.push({
                label: t('words.view'),
                handler: handleViewBolt11,
            })
        }
        if (onCopyBolt11) {
            buttons.push({
                label: t('words.copy'),
                handler: handleCopyBolt11,
            })
        }
    }
    if (paymentStatus === MatrixPaymentStatus.received) {
        statusIcon = 'check'
        statusText = isBolt11
            ? t('words.complete')
            : isRecipient
              ? t('words.received')
              : t('words.paid')
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
        if (isBolt11) {
            if (event.senderId === matrixAuth?.userId) {
                buttons.push({
                    label: t('words.cancel'),
                    handler: handleCancel,
                    loading: isCanceling,
                    disabled: isOffline,
                })
            } else {
                buttons.push({
                    label: t('words.reject'),
                    handler: handleRejectRequest,
                    loading: isRejecting,
                    disabled: isAccepting,
                })
            }
        } else {
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
    }

    useEffect(() => {
        if (isBolt11) {
            dispatch(
                checkBolt11PaymentResult({
                    fedimint,
                    event,
                }),
            )
        }
    }, [dispatch, event, fedimint, isBolt11])

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

export function useObserveMultispendEvent(
    roomId: MatrixRoom['id'],
    eventId: string,
) {
    const dispatch = useCommonDispatch()

    useEffect(() => {
        dispatch(observeMultispendEvent({ roomId, eventId }))

        return () => {
            dispatch(unobserveMultispendEvent({ roomId, eventId }))
        }
    }, [dispatch, roomId, eventId])
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
