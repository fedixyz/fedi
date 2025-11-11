import type { ResourceKey, TFunction } from 'i18next'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
    DEFAULT_PAGINATION_SIZE,
    ROOM_MENTION,
    SEARCH_PAGINATION_SIZE,
} from '../constants/matrix'
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
    sendMatrixFormResponse,
    createMatrixRoom,
    selectMatrixChatsList,
    setChatsListSearchQuery,
    selectRoomTextEvents,
    selectMatrixRoomMembers,
    setChatTimelineSearchQuery,
    selectChatDrafts,
    selectCurrency,
} from '../redux'
import {
    MatrixFormEvent,
    MatrixPaymentEvent,
    MatrixRoom,
    MatrixRoomMember,
    MatrixUser,
    MentionSelect,
    MSats,
    SendableMatrixEvent,
} from '../types'
import {
    RpcFederationId,
    RpcFormOption,
    RpcOperationId,
    RpcTransaction,
} from '../types/bindings'
import amountUtils from '../utils/AmountUtils'
import { formatErrorMessage } from '../utils/format'
import { makeLog } from '../utils/log'
import {
    decodeFediMatrixUserUri,
    getReplyData,
    isValidMatrixUserId,
    makeMatrixPaymentText,
    matrixIdToUsername,
    MatrixUrlMetadata,
    matrixUrlMetadataSchema,
    getLocalizedTextWithFallback,
    stripReplyFromBody,
    isTextEvent,
    shouldShowUnreadIndicator,
    getRoomPreviewText,
} from '../utils/matrix'
import { useAmountFormatter } from './amount'
import { useFedimint } from './fedimint'
import { useCommonDispatch, useCommonSelector } from './redux'
import { useToast } from './toast'
import { useDebouncedEffect, useUpdatingRef } from './util'

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

export function useChatsListSearch(initialQuery?: string) {
    const dispatch = useCommonDispatch()
    const chatsListSearchQuery = useCommonSelector(
        s => s.matrix.chatsListSearchQuery,
    )
    const chatsList = useCommonSelector(s => selectMatrixChatsList(s))

    const filteredChatsList = useMemo(() => {
        if (!chatsListSearchQuery) return chatsList
        return chatsList.filter(c =>
            c.name?.toLowerCase().includes(chatsListSearchQuery.toLowerCase()),
        )
    }, [chatsList, chatsListSearchQuery])

    // if query is provided by the hook consumer, auto-set it to redux state
    useEffect(() => {
        if (initialQuery) {
            dispatch(setChatsListSearchQuery(initialQuery))
        }
    }, [initialQuery, dispatch])

    return {
        query: chatsListSearchQuery,
        setQuery: (q: string) => dispatch(setChatsListSearchQuery(q)),
        clearSearch: () => dispatch(setChatsListSearchQuery('')),
        filteredChatsList,
    }
}

export function useChatTimelineSearchQuery() {
    const dispatch = useCommonDispatch()
    const chatTimelineSearchQuery = useCommonSelector(
        s => s.matrix.chatTimelineSearchQuery,
    )

    return {
        query: chatTimelineSearchQuery,
        setQuery: (q: string) => dispatch(setChatTimelineSearchQuery(q)),
        clearSearch: () => dispatch(setChatTimelineSearchQuery('')),
    }
}

export function useChatTimelineSearch(roomId: MatrixRoom['id']) {
    const dispatch = useCommonDispatch()
    const { query, setQuery, clearSearch } = useChatTimelineSearchQuery()
    const hasTriggeredInitialPagination = useRef(false)
    const {
        paginationStatus,
        isPaginating,
        canPaginateFurther,
        handlePaginate,
    } = useObserveMatrixRoom(roomId)
    const textEvents = useCommonSelector(s => selectRoomTextEvents(s, roomId))
    const roomMembers = useCommonSelector(s =>
        selectMatrixRoomMembers(s, roomId),
    )

    // Create member lookup for efficient sender name searching
    const memberLookup = useMemo(() => {
        return roomMembers.reduce(
            (acc, member) => {
                acc[member.id] =
                    member.displayName || matrixIdToUsername(member.id)
                return acc
            },
            {} as Record<string, string>,
        )
    }, [roomMembers])

    const searchResults = useMemo(() => {
        if (query.trim() === '') return []

        const queryLower = query.toLowerCase()

        return textEvents.filter(event => {
            let bodyMatch = false
            if (isTextEvent(event)) {
                bodyMatch = (event.content as { body: string }).body
                    .toLowerCase()
                    .includes(queryLower)
            }

            // matches search query to sender display names
            const senderName =
                memberLookup[event.sender] || matrixIdToUsername(event.sender)
            const senderMatch = senderName.toLowerCase().includes(queryLower)

            return bodyMatch || senderMatch
        })
    }, [textEvents, query, memberLookup])

    const isSearching = isPaginating && query.trim() !== ''

    // do an initial pagination on mount to get a big batch of results to search through
    // after this the user can click Load More to get more results
    useDebouncedEffect(
        () => {
            if (hasTriggeredInitialPagination.current) return
            hasTriggeredInitialPagination.current = true
            handlePaginate(SEARCH_PAGINATION_SIZE)
        },
        [dispatch, handlePaginate, hasTriggeredInitialPagination],
        200,
    )

    return {
        query,
        setQuery,
        clearSearch,
        searchResults,
        handlePaginate,
        paginationStatus,
        isPaginating,
        canPaginateFurther,
        isSearching,
        memberLookup,
    }
}

export function useMatrixUserSearch() {
    const fedimint = useFedimint()
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
            dispatch(searchMatrixUsers({ fedimint, query }))
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
    }, [dispatch, query, contactsList, fedimint])

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
    const fedimint = useFedimint()
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
    const canPaginateFurther = useMemo(() => {
        return paginationStatus !== 'timelineStartReached'
    }, [paginationStatus])

    // observeMatrixRoom establishes all of the relevant observables
    // when unmounting we unobserve the room, but only for group chats
    useEffect(() => {
        if (!matrixStarted) return
        dispatch(observeMatrixRoom({ fedimint, roomId }))
        return () => {
            // Don't unobserve DMs so ecash gets claimed in the
            // background
            //
            // TODO: remove when background ecash redemption
            // is moved to the bridge
            if (room?.directUserId) return
            dispatch(unobserveMatrixRoom({ fedimint, roomId }))
        }
    }, [matrixStarted, roomId, dispatch, room?.directUserId, fedimint])

    useEffect(() => {
        if (!matrixStarted || !latestEventId) return
        dispatch(
            sendMatrixReadReceipt({ fedimint, roomId, eventId: latestEventId }),
        )
    }, [matrixStarted, roomId, latestEventId, dispatch, fedimint])

    const handlePaginate = useCallback(
        async (limit: number = DEFAULT_PAGINATION_SIZE) => {
            // don't paginate if we don't know the pagination status yet
            if (!paginationStatus) return
            // don't paginate if we're already paginating
            if (isPaginating) return
            // don't paginate if there is nothing else to paginate
            if (paginationStatus === 'timelineStartReached') return
            await dispatch(
                paginateMatrixRoomTimeline({ fedimint, roomId, limit }),
            ).unwrap()
        },
        [paginationStatus, isPaginating, dispatch, roomId, fedimint],
    )

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
        canPaginateFurther,
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
    const fedimint = useFedimint()
    const dispatch = useCommonDispatch()
    useEffect(() => {
        dispatch(observeMultispendAccountInfo({ fedimint, roomId }))
        return () => {
            dispatch(unobserveMultispendAccountInfo({ fedimint, roomId }))
        }
    }, [dispatch, roomId, fedimint])
}

/**
 * Given a MatrixPaymentEvent, returns all the information necessary for
 * rendering the payment.
 */
export function useMatrixPaymentEvent({
    event,
    t,
    onError,
    onPayWithForeignEcash,
    onViewBolt11,
    onCopyBolt11,
}: {
    event: MatrixPaymentEvent
    t: TFunction
    onError: (err: unknown) => void
    onPayWithForeignEcash?: () => void
    onViewBolt11?: (bolt11: string) => void
    onCopyBolt11?: (bolt11: string) => void
}) {
    const fedimint = useFedimint()
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
        selectMatrixRoomMember(s, event.roomId, event.sender || ''),
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
    const federationId = event.content.federationId
    const selectedCurrency = useCommonSelector(s =>
        selectCurrency(s, federationId),
    )
    const { makeFormattedAmountsFromMSats, makeFormattedAmountsFromTxn } =
        useAmountFormatter({ currency: selectedCurrency, federationId })

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
                rejectMatrixPaymentRequest({ fedimint, event }),
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
            rejectMatrixPaymentRequest({ fedimint, event }),
            setIsRejecting,
        )
    }, [event, fedimint, handleDispatchPaymentUpdate])

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

    if (paymentStatus === 'received') {
        statusIcon = 'check'
        statusText = isBolt11
            ? t('words.complete')
            : isRecipient
              ? t('words.received')
              : t('words.paid')
    } else if (paymentStatus === 'rejected') {
        statusIcon = 'reject'
        statusText = t('words.rejected')
    } else if (paymentStatus === 'canceled') {
        statusIcon = 'x'
        statusText = t('words.canceled')
    } else if (paymentStatus === 'pushed' || paymentStatus === 'accepted') {
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
            if (paymentStatus === 'accepted') {
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
                    matrixIdToUsername(event.sender),
            })
        }
    } else if (paymentStatus === 'requested') {
        if (isBolt11) {
            if (event.sender === matrixAuth?.userId) {
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
    const fedimint = useFedimint()
    const dispatch = useCommonDispatch()
    const matrixAuth = useCommonSelector(selectMatrixAuth)
    const isSentByMe = event.sender === matrixAuth?.userId

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

    const onSelectOption = async (option: RpcFormOption) => {
        try {
            await dispatch(
                sendMatrixFormResponse({
                    fedimint,
                    roomId: event.roomId,
                    formResponse: {
                        responseType: type,
                        responseValue: option.value,
                        responseBody: option.label || option.value || '',
                        responseI18nKey: option.i18nKeyLabel || '',
                        respondingToEventId: event.id,
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
                    fedimint,
                    roomId: event.roomId,
                    formResponse: {
                        responseType: type,
                        responseValue: value || '',
                        responseBody: body,
                        responseI18nKey: i18nKeyLabel,
                        respondingToEventId: event.id,
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
    const fedimint = useFedimint()
    const dispatch = useCommonDispatch()
    const toast = useToast()

    const joinPublicGroup = async (
        roomId: MatrixRoom['id'],
    ): Promise<boolean> => {
        try {
            // For now, only public rooms can be joined by scanning
            // TODO: Implement knocking to support non-public rooms
            await dispatch(
                joinMatrixRoom({ fedimint, roomId, isPublic: true }),
            ).unwrap()
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
    const fedimint = useFedimint()

    useEffect(() => {
        dispatch(observeMultispendEvent({ roomId, eventId, fedimint }))

        return () => {
            dispatch(unobserveMultispendEvent({ roomId, eventId, fedimint }))
        }
    }, [dispatch, roomId, eventId, fedimint])
}

export function useMatrixUrlPreview({ url }: { url: string }) {
    const [urlPreview, setUrlPreview] = useState<MatrixUrlMetadata | null>(null)
    const fedimint = useFedimint()

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
 * @returns Transaction state including loading, error, and transaction data
 */
export function useMatrixPaymentTransaction({
    event,
}: {
    event: MatrixPaymentEvent
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
    const fedimint = useFedimint()

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
 * Hook for detecting and extracting reply data from timeline events
 * Also handles stripping reply formatting from the current message body
 */
export function useMatrixRepliedMessage(event: SendableMatrixEvent) {
    const replyData = useMemo(() => {
        if (!event.inReply) return null
        return getReplyData(event)
    }, [event])

    // handle stripping reply formatting from the current event's body
    const strippedEventBody = useMemo(() => {
        const formattedBody =
            'formatted' in event.content
                ? event.content.formatted?.formattedBody
                : null

        return stripReplyFromBody(event.content.body, formattedBody)
    }, [event.content])

    return {
        isReplied: !!event.inReply,
        repliedData: replyData,
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
    const fedimint = useFedimint()
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
                    fedimint,
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

/**
 * Hook for managing mention input with autocomplete suggestions
 */
export function useMentionInput(
    roomMembers: MatrixRoomMember[],
    cursorPosition: number,
    excludeUserId?: string,
): {
    mentionSuggestions: MatrixRoomMember[]
    activeMentionQuery: string | null
    shouldShowSuggestions: boolean
    detectMentionTrigger: (text: string, position: number) => void
    insertMention: (
        member: MentionSelect,
        currentText: string,
    ) => { newText: string; newCursorPosition: number }
    clearMentions: () => void
} {
    const [mentionSuggestions, setMentionSuggestions] = useState<
        MatrixRoomMember[]
    >([])
    const [activeMentionQuery, setActiveMentionQuery] = useState<string | null>(
        null,
    )
    const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1)

    const detectMentionTrigger = useCallback(
        (text: string, position: number) => {
            // find @ symbol before cursor
            const before = text.slice(0, position)
            const match = before.match(/@([a-z0-9._-]*)$/i)

            if (!match) {
                setActiveMentionQuery(null)
                setMentionStartIndex(-1)
                setMentionSuggestions([])
                return
            }

            const q = (match[1] || '').toLowerCase()
            const start = before.length - match[0].length

            setActiveMentionQuery(q)
            setMentionStartIndex(start)

            // filter room members by query (display name or handle)
            const filtered = (roomMembers || [])
                .filter(m => {
                    if (excludeUserId && m.id === excludeUserId) return false // <-- hide self
                    const name = (m.displayName || '').toLowerCase()
                    const handle = matrixIdToUsername(m.id).toLowerCase()
                    return name.includes(q) || handle.includes(q)
                })
                .slice(0, 7)
            setMentionSuggestions(filtered)
        },
        [roomMembers, excludeUserId],
    )

    const insertMention = useCallback(
        (member: MentionSelect, currentText: string) => {
            if (mentionStartIndex === -1) {
                return {
                    newText: currentText,
                    newCursorPosition: cursorPosition,
                }
            }

            const beforeMention = currentText.substring(0, mentionStartIndex)
            const afterCursor = currentText.substring(cursorPosition)

            // use display name when available; special case for @room
            const displayName =
                member.id === '@room'
                    ? ROOM_MENTION
                    : (member as MatrixRoomMember).displayName ||
                      (member as MatrixRoomMember).id

            const newText = `${beforeMention}@${displayName} ${afterCursor}`
            const newCursorPosition =
                beforeMention.length + displayName.length + 2 // +2 for "@ "

            setActiveMentionQuery(null)
            setMentionStartIndex(-1)
            setMentionSuggestions([])

            return { newText, newCursorPosition }
        },
        [mentionStartIndex, cursorPosition],
    )

    const clearMentions = useCallback(() => {
        setActiveMentionQuery(null)
        setMentionStartIndex(-1)
        setMentionSuggestions([])
    }, [])

    // show if a mention is active and there are suggestions
    // or if the query could yield @room in the component
    const shouldShowSuggestions = useMemo(() => {
        return (
            activeMentionQuery !== null &&
            (mentionSuggestions.length > 0 ||
                (!!activeMentionQuery &&
                    ROOM_MENTION.startsWith(activeMentionQuery.toLowerCase())))
        )
    }, [activeMentionQuery, mentionSuggestions])

    return {
        mentionSuggestions,
        activeMentionQuery,
        shouldShowSuggestions,
        detectMentionTrigger,
        insertMention,
        clearMentions,
    }
}

export function useMatrixRoomPreview({
    roomId,
    t,
}: {
    roomId: string
    t: TFunction
}) {
    const room = useCommonSelector(s => selectMatrixRoom(s, roomId))
    const roomDraft = useCommonSelector(selectChatDrafts)[room?.id || '']
    const myId = useCommonSelector(selectMatrixAuth)?.userId

    const isPublicBroadcast = room?.isPublic && room.broadcastOnly
    const isUnread = shouldShowUnreadIndicator(
        room?.notificationCount,
        room?.isMarkedUnread,
    )
    const isBlocked = Boolean(room?.isBlocked)

    // Whether to display the room preview as a 'notice'
    // This is usually used to add an italic style to the text
    const isNotice =
        room?.preview?.content.msgtype === 'redacted' ||
        !room?.preview ||
        isPublicBroadcast ||
        isUnread ||
        roomDraft ||
        isBlocked

    const text = useMemo(() => {
        if (!room?.preview) return t('feature.chat.no-messages')

        if (roomDraft)
            return t('feature.chat.draft-text', { text: roomDraft.trim() })

        if (room.preview.content.msgtype === 'xyz.fedi.payment') {
            const { amount, senderId, recipientId } = room.preview.content

            let messageKey = 'feature.receive.they-requested-amount-unit'

            if (senderId === myId)
                messageKey = 'feature.send.you-sent-amount-unit'
            else if (senderId && recipientId === myId)
                messageKey = 'feature.send.they-sent-amount-unit'
            else if (recipientId === myId)
                messageKey = 'feature.receive.you-requested-amount-unit'

            return t(messageKey as ResourceKey, {
                amount: amountUtils.formatSats(
                    amountUtils.msatToSat(amount as MSats),
                ),
                unit: t('words.sats').toUpperCase(),
            })
        }

        return getRoomPreviewText(room, t)
    }, [room, t, roomDraft, myId])

    return {
        text,
        isUnread,
        isNotice,
    }
}
