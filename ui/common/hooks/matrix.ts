import type { TFunction } from 'i18next'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
    acceptMatrixPaymentRequest,
    cancelMatrixPayment,
    joinMatrixRoom,
    observeMatrixRoom,
    paginateMatrixRoomTimeline,
    rejectMatrixPaymentRequest,
    searchMatrixUsers,
    selectCanClaimPayment,
    selectCanPayFromOtherFeds,
    selectCanSendPayment,
    selectIsInternetUnreachable,
    selectLatestMatrixRoomEventId,
    selectMatrixAuth,
    selectMatrixPushNotificationToken,
    selectMatrixRoom,
    selectMatrixRoomMember,
    selectMatrixRoomPaginationStatus,
    selectMatrixStarted,
    selectMatrixUser,
    sendMatrixReadReceipt,
    unobserveMatrixRoom,
    selectMatrixContactsList,
    observeMultispendEvent,
    unobserveMultispendEvent,
    observeMultispendAccountInfo,
    unobserveMultispendAccountInfo,
    checkBolt11PaymentResult,
    clearChatReplyingToMessage,
    setChatReplyingToMessage,
    selectReplyingToMessageEventForRoom,
    sendMatrixFormResponse,
    createMatrixRoom,
} from '../redux'
import {
    MatrixEvent,
    MatrixFormEvent,
    MatrixPaymentEvent,
    MatrixPaymentStatus,
    MatrixRoom,
    MatrixUser,
} from '../types'
import {
    RpcFederationId,
    RpcOperationId,
    RpcTransaction,
} from '../types/bindings'
import { FedimintBridge } from '../utils/fedimint'
import { formatErrorMessage } from '../utils/format'
import { makeLog } from '../utils/log'
import {
    decodeFediMatrixUserUri,
    getReplyMessageData,
    isReply,
    isValidMatrixUserId,
    makeMatrixPaymentText,
    MatrixFormOption,
    matrixIdToUsername,
    MatrixUrlMetadata,
    matrixUrlMetadataSchema,
    getLocalizedTextWithFallback,
    stripReplyFromBody,
} from '../utils/matrix'
import { useAmountFormatter } from './amount'
import { useCommonDispatch, useCommonSelector } from './redux'
import { useToast } from './toast'
import { useUpdatingRef } from './util'

const log = makeLog('common/hooks/matrix')
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
export function useObserveMatrixRoom(roomId: MatrixRoom['id']) {
    const [hasPaginated, setHasPaginated] = useState(false)
    const dispatch = useCommonDispatch()
    // latestEventId is used for sending read receipts
    const latestEventId = useCommonSelector(s =>
        selectLatestMatrixRoomEventId(s, roomId),
    )
    const paginationStatus = useCommonSelector(s =>
        selectMatrixRoomPaginationStatus(s, roomId),
    )
    const room = useCommonSelector(s => selectMatrixRoom(s, roomId))
    const matrixStarted = useCommonSelector(s => selectMatrixStarted(s))

    const isPaginating = useMemo(() => {
        return paginationStatus === 'paginating'
    }, [paginationStatus])

    // observeMatrixRoom establishes all of the relevant observables
    // when unmounting we unobserve the room, but only for groupchats
    useEffect(() => {
        if (!matrixStarted) return
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
    }, [matrixStarted, roomId, dispatch, room?.directUserId])

    useEffect(() => {
        if (!matrixStarted || !latestEventId) return
        dispatch(sendMatrixReadReceipt({ roomId, eventId: latestEventId }))
    }, [matrixStarted, roomId, latestEventId, dispatch])

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
        if (!matrixStarted || hasPaginated || !paginationStatus) return
        setHasPaginated(true)
        handlePaginate()
    }, [matrixStarted, handlePaginate, hasPaginated, paginationStatus])

    return {
        paginationStatus,
        isPaginating,
        handlePaginate,
        showLoading: isPaginating,
    }
}

export type ChatEventAction = {
    label: string
    handler: () => void
    loading?: boolean
    disabled?: boolean
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
    const toast = useToast()

    const matrixAuth = useCommonSelector(s => s.matrix.auth)

    // determine which operation ID to use based on user role
    const isSentByMe = event.content.senderId === matrixAuth?.userId
    const isRecipient = event.content.recipientId === matrixAuth?.userId

    // drive all our selectors off of the consolidated object
    const canClaimPayment = useCommonSelector(s =>
        selectCanClaimPayment(s, event),
    )
    const canSendPayment = useCommonSelector(s =>
        selectCanSendPayment(s, event),
    )
    const canPayFromOtherFeds = useCommonSelector(s =>
        selectCanPayFromOtherFeds(s, event),
    )
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
    const { makeFormattedAmountsFromMSats, makeFormattedAmountsFromTxn } =
        useAmountFormatter()

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
                acceptMatrixPaymentRequest({
                    fedimint,
                    event,
                }),
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

    const handleAcceptForeignEcash = useCallback(() => {
        if (isOffline) {
            toast.error(t, null, t('errors.internet-offline-foreign-ecash'))
            return
        }

        setIsHandlingForeignEcash(true)
    }, [isOffline, toast, t])

    // add transaction fetching with the appropriate operation ID
    const { transaction, isLoading: isLoadingTransaction } =
        useMatrixPaymentTransaction({
            event,
            fedimint,
        })

    const messageText = makeMatrixPaymentText({
        t,
        event,
        myId: matrixAuth?.userId || '',
        eventSender,
        paymentSender,
        paymentRecipient,
        // if the txn is fetched, check it for amount + historical rate,
        // otherwise falls back to the amount in the event body content
        transaction,
        makeFormattedAmountsFromMSats,
        makeFormattedAmountsFromTxn,
    })

    const paymentStatus = event.content.status
    const isBolt11 = !!event.content.bolt11

    let statusIcon: 'x' | 'reject' | 'check' | 'error' | 'loading' | undefined
    let statusText: string | undefined
    let buttons: ChatEventAction[] = []

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
        isLoadingTransaction,
        transaction,
        isSentByMe,
    }
}

export function useMatrixFormEvent(
    event: MatrixFormEvent,
    t: TFunction,
): {
    isSentByMe: boolean
    messageText: string
    actionButton: ChatEventAction | undefined
    options: ChatEventAction[]
} {
    const dispatch = useCommonDispatch()
    const matrixAuth = useCommonSelector(selectMatrixAuth)
    const isSentByMe = event.senderId === matrixAuth?.userId

    let actionButton: ChatEventAction | undefined = undefined
    const options: ChatEventAction[] = []
    const {
        options: formOptions,
        i18nKeyLabel,
        body,
        value,
        type,
        formResponse,
    } = event.content

    // if we have the string for the i18n key, use it, otherwise use the body
    let messageText = getLocalizedTextWithFallback(t, i18nKeyLabel, body)

    const onSelectOption = async (option: MatrixFormOption) => {
        try {
            await dispatch(
                sendMatrixFormResponse({
                    roomId: event.roomId,
                    formResponse: {
                        responseType: type,
                        responseValue: option.value,
                        responseBody: option.label || option.value || '',
                        responseI18nKey: option.i18nKeyLabel || '',
                        respondingToEventId: event.eventId,
                    },
                }),
            ).unwrap()
        } catch (error) {
            log.error('Failed to send form response', error)
        }
    }
    const onButtonPressed = async () => {
        try {
            await dispatch(
                sendMatrixFormResponse({
                    roomId: event.roomId,
                    formResponse: {
                        responseType: type,
                        responseValue: value || '',
                        responseBody: body,
                        responseI18nKey: i18nKeyLabel,
                        respondingToEventId: event.eventId,
                    },
                }),
            ).unwrap()
        } catch (error) {
            log.error('Failed to send form response', error)
        }
    }

    // if we're the sender, just show a message that we responded, no special action UI
    // otherwise, render buttons / options for the user to interact with the form
    if (isSentByMe) {
        // if this is a response we sent, use the formResponse to get the text to display
        if (formResponse) {
            // if we have the i18n key, use it, otherwise use the body
            const { responseBody, responseI18nKey } = formResponse
            const responseText = getLocalizedTextWithFallback(
                t,
                responseI18nKey,
                responseBody,
            )
            messageText = t('feature.communities.you-responded', {
                response: responseText,
            })
        } else {
            messageText = t('feature.communities.you-responded', {
                response: messageText,
            })
        }
    } else {
        // show options with localized strings if we have them
        if (type === 'radio' && formOptions && formOptions.length > 0) {
            formOptions.forEach(option => {
                if (option.value) {
                    const label = getLocalizedTextWithFallback(
                        t,
                        option.i18nKeyLabel,
                        option.label,
                    )
                    options.push({
                        label,
                        handler: () => onSelectOption(option),
                    })
                }
            })
        } else if (type === 'button') {
            // show a single button to return the body as the value, no additional text
            messageText = ''
            const label = getLocalizedTextWithFallback(t, i18nKeyLabel, body)
            actionButton = {
                label,
                handler: () => onButtonPressed(),
            }
        } else if (type === 'text') {
            // no-op, for now we just let the user respond with text via the normal chat input
        }
    }

    // TODO: FederationSetupComplete text, invite code with copy button, join button, guardian UI link + password

    return {
        isSentByMe,
        messageText,
        actionButton,
        options,
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

/**
 * Hook for managing Matrix payment transactions with historical exchange rates
 * @param event - The payment event to fetch transaction data for
 * @param fedimint - The Fedimint bridge instance
 * @returns Transaction state including loading, error, and transaction data
 */
export function useMatrixPaymentTransaction({
    event,
    fedimint,
}: {
    event: MatrixPaymentEvent
    fedimint: FedimintBridge
}) {
    // undefined = not yet tried (or loading), null = tried & got nothing, object = got a transaction
    const [transaction, setTransaction] = useState<
        RpcTransaction | null | undefined
    >(undefined)
    const [hasTriedFetch, setHasTriedFetch] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<unknown>(null)

    const matrixAuth = useCommonSelector(selectMatrixAuth)
    const currentUserId = matrixAuth?.userId

    useEffect(() => {
        // skip if we've already tried
        if (hasTriedFetch) return

        const { senderOperationId, receiverOperationId, federationId } =
            event.content

        const isSentByMe = event.content.senderId === currentUserId

        // for legacy payments without senderOperationId (from old clients),
        // we can't fetch transaction history, so just mark as tried and return null
        if (isSentByMe && !senderOperationId) {
            log.debug(
                'Legacy payment detected (no senderOperationId), skipping transaction fetch',
            )
            setHasTriedFetch(true)
            setTransaction(null)
            setIsLoading(false)
            return
        }

        const operationId = isSentByMe ? senderOperationId : receiverOperationId

        if (!operationId || !federationId) {
            log.debug(
                'Waiting for operationId & federationId to fetch transaction',
            )
            // for receiver of legacy payment, mark as tried if there's no receiverOperationId
            if (!isSentByMe && !receiverOperationId && federationId) {
                log.debug(
                    'Receiver of legacy payment (no receiverOperationId yet), marking as tried',
                )
                setHasTriedFetch(true)
                setTransaction(null)
                setIsLoading(false)
            }
            return
        }

        const fetchTransaction = async () => {
            let chosenOp: string | undefined
            if (isSentByMe && senderOperationId) {
                chosenOp = senderOperationId
            } else if (!isSentByMe && receiverOperationId) {
                chosenOp = receiverOperationId
            } else {
                log.warn(
                    `Missing ${
                        isSentByMe ? 'sender' : 'receiver'
                    }OperationId for payment ${event.content.paymentId}`,
                )
                setHasTriedFetch(true)
                setTransaction(null)
                return
            }

            setHasTriedFetch(true)
            setIsLoading(true)
            setError(null)

            log.debug(
                `Fetching transaction for ${
                    isSentByMe ? 'sender' : 'receiver'
                } operation: ${chosenOp}`,
            )

            try {
                const result = await fedimint.getTransaction(
                    federationId as RpcFederationId,
                    chosenOp as RpcOperationId,
                )
                setTransaction(result ?? null)

                if (result) {
                    log.debug(
                        `Successfully fetched transaction for operation ${chosenOp}`,
                    )
                } else {
                    log.debug(`No transaction found for operation ${chosenOp}`)
                }
            } catch (err) {
                log.error(
                    `Failed to fetch transaction for operation ${chosenOp}:`,
                    err,
                )
                setError(err)
                setTransaction(null)
            } finally {
                setIsLoading(false)
            }
        }

        fetchTransaction()
    }, [event.content, fedimint, currentUserId, hasTriedFetch])

    return { transaction, hasTriedFetch, isLoading, error }
}

/**
 * Hook for managing replies in a specific room
 */
export function useMatrixReply(roomId: MatrixRoom['id']) {
    const dispatch = useCommonDispatch()

    // Get the currently replied event for this room
    const replyEvent = useCommonSelector(s =>
        selectReplyingToMessageEventForRoom(s, roomId),
    )

    // Get the sender's display name for the replied event
    const replyEventSender = useCommonSelector(s =>
        replyEvent?.senderId
            ? selectMatrixUser(s, replyEvent.senderId)
            : undefined,
    )

    const startReply = useCallback(
        (event: MatrixEvent) => {
            dispatch(
                setChatReplyingToMessage({
                    roomId,
                    event,
                }),
            )
        },
        [dispatch, roomId],
    )

    const clearReply = useCallback(() => {
        dispatch(clearChatReplyingToMessage())
    }, [dispatch])

    const replyForInput = useMemo(() => {
        if (!replyEvent) return null

        const senderName =
            replyEventSender?.displayName || replyEvent.senderId || 'Unknown'

        return {
            eventId: replyEvent?.eventId || replyEvent?.id,
            senderName,
            body: replyEvent.content.body || 'Message',
            timestamp: replyEvent.timestamp,
        }
    }, [replyEvent, replyEventSender])

    const isReplying = useMemo(() => !!replyEvent, [replyEvent])

    return {
        replyEvent,
        replyEventSender,
        replyForInput,
        isReplying,
        startReply,
        clearReply,
    }
}

/**
 * Hook for detecting and extracting reply data from timeline events
 * Also handles stripping reply formatting from the current message body
 */
export function useMatrixRepliedMessage(event: MatrixEvent) {
    const isReplied = useMemo(() => isReply(event), [event])

    const replyData = useMemo(() => {
        if (!isReplied) return null
        return getReplyMessageData(event)
    }, [event, isReplied])

    // get the original replied-to event from the room timeline
    const repliedToEvent = useCommonSelector(s => {
        if (!replyData?.eventId || !event.roomId) return null

        // get the timeline for this room
        const timeline = s.matrix.roomTimelines[event.roomId]
        if (!timeline) return null

        // find the original event by ID
        return (
            timeline.find(
                item =>
                    item !== null &&
                    (item.eventId === replyData.eventId ||
                        item.id === replyData.eventId),
            ) || null
        )
    })

    // get the sender's display name for the original message
    const replySender = useCommonSelector(s =>
        repliedToEvent?.senderId
            ? selectMatrixUser(s, repliedToEvent.senderId)
            : undefined,
    )

    const repliedDisplayData = useMemo(() => {
        if (!replyData) return null

        // if we found the original event, use its data
        if (repliedToEvent) {
            const content = repliedToEvent.content
            const body =
                'body' in content && typeof content.body === 'string'
                    ? content.body
                    : 'Message'
            const formattedBody =
                'formatted_body' in content &&
                typeof content.formatted_body === 'string'
                    ? content.formatted_body
                    : undefined

            const strippedOriginalBody = stripReplyFromBody(body, formattedBody)

            return {
                eventId: replyData.eventId,
                senderId: repliedToEvent.senderId || '',
                senderDisplayName:
                    replySender?.displayName ||
                    repliedToEvent.senderId?.split(':')[0]?.replace('@', '') ||
                    'Unknown',
                body: strippedOriginalBody,
                timestamp: repliedToEvent.timestamp,
            }
        }

        return {
            eventId: replyData.eventId,
            senderId: '',
            senderDisplayName: 'Unknown',
            body: 'Message',
            timestamp: undefined,
        }
    }, [replyData, repliedToEvent, replySender])

    // handle stripping reply formatting from the current event's body
    const strippedEventBody = useMemo(() => {
        if (!isReplied) return event.content.body

        // only strip if it's a text event with the required fields
        const content = event.content
        if (!('body' in content)) return event.content.body

        const originalBody = content.body
        const formattedBody =
            'formatted_body' in content ? content.formatted_body : undefined

        return stripReplyFromBody(originalBody, formattedBody)
    }, [event.content, isReplied])

    return {
        isReplied: isReplied,
        repliedData: repliedDisplayData,
        strippedBody: strippedEventBody,
    }
}

/**
 * All functions and state needed for creating a new Matrix room / groupchat
 * Validates group name, exposes error messages / loading, & executes optional success callback
 */
export function useCreateMatrixRoom(
    t: TFunction,
    onGroupCreated?: (roomId: MatrixRoom['id']) => void,
) {
    const [groupName, setGroupName] = useState(t('feature.chat.new-group'))
    const [broadcastOnly, setBroadcastOnly] = useState(false)
    const [isPublic, setIsPublic] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [createdRoomId, setCreatedRoomId] = useState<string | null>(null)
    const [isCreatingGroup, setIsCreatingGroup] = useState(false)
    const dispatch = useCommonDispatch()
    const loadedRoom = useCommonSelector(
        s => createdRoomId && selectMatrixRoom(s, createdRoomId),
    )
    const toast = useToast()

    useEffect(() => {
        if (groupName.trim().length >= 30) {
            setErrorMessage(t('errors.group-name-too-long'))
        } else {
            setErrorMessage(null)
        }
    }, [groupName, t])

    // After creating a room, we wait for the new room to show up
    // in the room list for group creation to complete
    useEffect(() => {
        const handleRoomLoaded = async () => {
            if (!loadedRoom) return
            try {
                log.info('Group created', loadedRoom)
                if (onGroupCreated) onGroupCreated(loadedRoom.id)
            } catch (error) {
                toast.error(t, error)
            } finally {
                setIsCreatingGroup(false)
            }
        }
        if (loadedRoom) handleRoomLoaded()
    }, [loadedRoom, onGroupCreated, t, toast])

    const handleCreateGroup = async () => {
        if (errorMessage) return
        const newGroupName = groupName.trim()
        if (newGroupName.length === 0) {
            setErrorMessage(t('errors.group-name-required'))
            return
        }
        setIsCreatingGroup(true)
        try {
            const { roomId } = await dispatch(
                createMatrixRoom({
                    name: newGroupName,
                    broadcastOnly,
                    isPublic,
                }),
            ).unwrap()
            setCreatedRoomId(roomId)
        } catch (error) {
            setIsCreatingGroup(false)
            setErrorMessage(t('errors.failed-to-create-group'))
            log.error('group create failed', error)
            toast.error(t, error)
        }
    }

    return {
        handleCreateGroup,
        isCreatingGroup,
        groupName,
        setGroupName,
        broadcastOnly,
        setBroadcastOnly,
        isPublic,
        setIsPublic,
        errorMessage,
        createdRoomId,
    }
}
