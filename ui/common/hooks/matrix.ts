import type { TFunction } from 'i18next'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
    acceptMatrixPaymentRequest,
    cancelMatrixPayment,
    observeMatrixRoom,
    rejectMatrixPaymentRequest,
    searchMatrixUsers,
    selectBtcExchangeRate,
    selectCurrency,
    selectLatestMatrixRoomEventId,
    selectMatrixAuth,
    selectMatrixRoom,
    selectMatrixRoomMember,
    selectMatrixStatus,
    selectMatrixUser,
    sendMatrixReadReceipt,
    unobserveMatrixRoom,
} from '../redux'
import {
    MatrixPaymentEvent,
    MatrixPaymentStatus,
    MatrixSyncStatus,
    MatrixUser,
} from '../types'
import { FedimintBridge } from '../utils/fedimint'
import {
    decodeFediMatrixUserUri,
    isValidMatrixUserId,
    makeMatrixPaymentText,
    matrixIdToUsername,
} from '../utils/matrix'
import { useCommonDispatch, useCommonSelector } from './redux'
import { useUpdatingRef } from './util'

export function useIsMatrixSynced() {
    const status = useCommonSelector(selectMatrixStatus)
    return status === MatrixSyncStatus.synced
}

export function useMatrixUserSearch() {
    const dispatch = useCommonDispatch()
    const [query, setQuery] = useState('')
    const [searchedUsers, setSearchedUsers] = useState<MatrixUser[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [searchError, setSearchError] = useState<unknown>()
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

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
                .then(res => setSearchedUsers(res.results))
                .catch(err => setSearchError(err))
                .finally(() => setIsSearching(false))
        }, 500)
        return () => clearTimeout(timeoutRef.current)
    }, [dispatch, query])

    return {
        query,
        setQuery,
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
    const syncStatus = useCommonSelector(selectMatrixStatus)
    const latestEventId = useCommonSelector(s =>
        roomId ? selectLatestMatrixRoomEventId(s, roomId) : undefined,
    )

    const isReady =
        syncStatus === MatrixSyncStatus.syncing ||
        syncStatus === MatrixSyncStatus.synced

    useEffect(() => {
        if (!isReady || !roomId || paused) return
        dispatch(observeMatrixRoom({ roomId }))
        return () => {
            dispatch(unobserveMatrixRoom({ roomId }))
        }
    }, [isReady, roomId, paused, dispatch])

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
}: {
    event: MatrixPaymentEvent
    fedimint: FedimintBridge
    t: TFunction
    onError: (err: unknown) => void
}) {
    const dispatch = useCommonDispatch()
    const matrixAuth = useCommonSelector(selectMatrixAuth)
    const eventSender = useCommonSelector(s =>
        selectMatrixRoomMember(s, event.roomId, event.senderId || ''),
    )
    const paymentSender = useCommonSelector(s =>
        selectMatrixRoomMember(s, event.roomId, event.content.senderId || ''),
    )
    const paymentRecipient = useCommonSelector(s =>
        selectMatrixRoomMember(s, event.roomId, event.content.recipientId),
    )
    const isDm = useCommonSelector(
        s => !!selectMatrixRoom(s, event.roomId)?.directUserId,
    )
    const currency = useCommonSelector(selectCurrency)
    const btcExchangeRate = useCommonSelector(selectBtcExchangeRate)
    const [isCanceling, setIsCanceling] = useState(false)
    const [isAccepting, setIsAccepting] = useState(false)
    const [isRejecting, setIsRejecting] = useState(false)
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
        handleDispatchPaymentUpdate(
            acceptMatrixPaymentRequest({ fedimint, event }),
            setIsAccepting,
        )
    }, [fedimint, event, handleDispatchPaymentUpdate])

    const handleRejectRequest = useCallback(async () => {
        handleDispatchPaymentUpdate(
            rejectMatrixPaymentRequest({ event }),
            setIsRejecting,
        )
    }, [event, handleDispatchPaymentUpdate])

    const messageText = makeMatrixPaymentText({
        t,
        event,
        myId: matrixAuth?.userId || '',
        eventSender,
        paymentSender,
        paymentRecipient,
        currency,
        btcExchangeRate,
    })
    const paymentStatus = event.content.status
    const isSentByMe = event.content.senderId === matrixAuth?.userId
    const isRecipient = event.content.recipientId === matrixAuth?.userId

    let statusIcon: 'x' | 'check' | 'error' | 'loading' | undefined
    let statusText: string | undefined
    let buttons: {
        label: string
        handler: () => void
        loading?: boolean
        disabled?: boolean
    }[] = []
    if (paymentStatus === MatrixPaymentStatus.received) {
        statusIcon = 'check'
        statusText = t('words.received')
    } else if (paymentStatus === MatrixPaymentStatus.rejected) {
        statusIcon = 'x'
        statusText = t('words.rejected')
    } else if (paymentStatus === MatrixPaymentStatus.canceled) {
        statusIcon = 'x'
        statusText = t('words.canceled')
    } else if (
        paymentStatus === MatrixPaymentStatus.pushed ||
        paymentStatus === MatrixPaymentStatus.accepted
    ) {
        if (isRecipient) {
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
    }
}
