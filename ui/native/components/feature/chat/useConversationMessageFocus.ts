import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, ViewToken } from 'react-native'

import { DEFAULT_PAGINATION_SIZE } from '@fedi/common/constants/matrix'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import { MatrixEvent } from '@fedi/common/types'
import { RpcBackPaginationStatus } from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'
import { isPaymentEvent } from '@fedi/common/utils/matrix'

import {
    ChatConversationListHandle,
    ChatConversationRow,
    scrollToChatConversationEvent,
} from '../../../utils/chatConversationRows'

const log = makeLog('useConversationMessageFocus')
const HIGHLIGHT_DURATION = 3000
const MAX_SCROLL_TO_MESSAGE_PAGINATION_ATTEMPTS = 20
const MAX_LOADED_SCROLL_ATTEMPTS = 2
const MAX_PAGINATION_OBSERVATION_WAIT_ATTEMPTS = 20
const MAX_LIST_HANDLE_WAIT_ATTEMPTS = 20
const MESSAGE_VISIBILITY_TIMEOUT_MS = 500

const waitForNextMacrotask = () =>
    new Promise<void>(resolve => {
        setTimeout(resolve, 0)
    })

export type ConversationListRefOverride =
    React.RefObject<ChatConversationListHandle | null> & {
        __onViewableItemsChangedRef?: React.MutableRefObject<
            ((info: { viewableItems: ViewToken[] }) => void) | null
        >
        __onScrollToIndexFailedRef?: React.MutableRefObject<
            | ((info: {
                  index: number
                  highestMeasuredFrameIndex: number
                  averageItemLength: number
              }) => void)
            | null
        >
        __getKeyForIndexRef?: React.MutableRefObject<
            ((index: number) => string | null) | null
        >
    }

export type ScrollToMessageRequest = {
    eventId: string
    nonce: number
}

type ScrollToLoadedMessageResult =
    | 'focused'
    | 'loadedButNotVisible'
    | 'notLoaded'

type ExactScrollRequestState = {
    lastHandledKey: string | null
    pendingKey: string | null
}

type UseConversationMessageFocusArgs = {
    roomId: string
    chatRows: ChatConversationRow[]
    events: MatrixEvent[]
    rawEvents: MatrixEvent[]
    shouldRenderConversationList: boolean
    routeScrollToMessageId?: string | null
    scrollToMessageRequest?: ScrollToMessageRequest | null
    onScrollToMessageComplete?: (eventId: string) => void
    listRefOverride?: ConversationListRefOverride
    paginationStatus?: RpcBackPaginationStatus | null
    isPaginating: boolean
    handlePaginate: (limit?: number) => unknown
}

export const useConversationMessageFocus = ({
    roomId,
    chatRows,
    events,
    rawEvents,
    shouldRenderConversationList,
    routeScrollToMessageId = null,
    scrollToMessageRequest = null,
    onScrollToMessageComplete,
    listRefOverride,
    paginationStatus = null,
    isPaginating,
    handlePaginate,
}: UseConversationMessageFocusArgs) => {
    const [highlightedMessageId, setHighlightedMessageId] = useState<
        string | null
    >(null)
    const [visibleItemIds, setVisibleItemIds] = useState<Set<string>>(
        () => new Set(),
    )
    const visibleItemIdsRef = useRef<Set<string>>(new Set())
    const internalListRef = useRef<FlatList<ChatConversationRow>>(null)
    const [hasMountedInternalList, setHasMountedInternalList] = useState(false)
    const listRef = useMemo(
        () =>
            listRefOverride ??
            (internalListRef as React.RefObject<ChatConversationListHandle | null>),
        [listRefOverride],
    )
    const hasConversationListHandle = listRefOverride
        ? Boolean(listRefOverride.current)
        : hasMountedInternalList && Boolean(internalListRef.current)
    const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    )
    const focusPaginationRequestRef = useRef<Promise<void> | null>(null)
    const routeRequestStateRef = useRef<ExactScrollRequestState>({
        lastHandledKey: null,
        pendingKey: null,
    })
    const pinnedRequestStateRef = useRef<ExactScrollRequestState>({
        lastHandledKey: null,
        pendingKey: null,
    })
    const messageVisibilityWaitersRef = useRef<
        Map<string, Set<(didBecomeVisible: boolean) => void>>
    >(new Map())

    const eventIndexById = useMemo(
        () =>
            new Map(
                chatRows.map((row, index) => [row.event.id as string, index]),
            ),
        [chatRows],
    )
    const rawEventsById = useMemo(
        () => new Map(rawEvents.map(event => [event.id as string, event])),
        [rawEvents],
    )
    const rawInitialPaymentEventIdByPaymentId = useMemo(
        () =>
            new Map(
                rawEvents.flatMap(event =>
                    isPaymentEvent(event) &&
                    ['pushed', 'requested'].includes(event.content.status)
                        ? [
                              [
                                  event.content.paymentId,
                                  event.id as string,
                              ] as const,
                          ]
                        : [],
                ),
            ),
        [rawEvents],
    )
    const visiblePaymentEventIdByPaymentId = useMemo(
        () =>
            new Map(
                events.flatMap(event =>
                    isPaymentEvent(event)
                        ? [
                              [
                                  event.content.paymentId,
                                  event.id as string,
                              ] as const,
                          ]
                        : [],
                ),
            ),
        [events],
    )
    const eventIndexByIdRef = useUpdatingRef(eventIndexById)
    const rawEventsByIdRef = useUpdatingRef(rawEventsById)
    const rawInitialPaymentEventIdByPaymentIdRef = useUpdatingRef(
        rawInitialPaymentEventIdByPaymentId,
    )
    const visiblePaymentEventIdByPaymentIdRef = useUpdatingRef(
        visiblePaymentEventIdByPaymentId,
    )
    const paginationStatusRef = useUpdatingRef(paginationStatus)
    const isPaginatingRef = useUpdatingRef(isPaginating)
    const handlePaginateRef = useUpdatingRef(handlePaginate)
    const rawEventCountRef = useUpdatingRef(rawEvents.length)

    const resolveMessageVisibilityWaiters = useCallback(
        (eventIds: Iterable<string>, didBecomeVisible: boolean) => {
            Array.from(new Set(eventIds)).forEach(eventId => {
                const waiters = messageVisibilityWaitersRef.current.get(eventId)

                if (!waiters) return

                messageVisibilityWaitersRef.current.delete(eventId)
                Array.from(waiters).forEach(waiter => waiter(didBecomeVisible))
            })
        },
        [],
    )

    const clearMessageVisibilityWaiters = useCallback(() => {
        resolveMessageVisibilityWaiters(
            messageVisibilityWaitersRef.current.keys(),
            false,
        )
    }, [resolveMessageVisibilityWaiters])

    const clearHighlightTimeout = useCallback(() => {
        if (highlightTimeoutRef.current) {
            clearTimeout(highlightTimeoutRef.current)
            highlightTimeoutRef.current = null
        }
    }, [])

    const waitForMessageVisibility = useCallback((eventId: string) => {
        if (visibleItemIdsRef.current.has(eventId)) {
            return Promise.resolve(true)
        }

        return new Promise<boolean>(resolve => {
            const waitersForEvent =
                messageVisibilityWaitersRef.current.get(eventId) ??
                new Set<(didBecomeVisible: boolean) => void>()
            let timeout: ReturnType<typeof setTimeout> | null = null
            let didSettle = false

            const settle = (didBecomeVisible: boolean) => {
                if (didSettle) return

                didSettle = true

                if (timeout) {
                    clearTimeout(timeout)
                    timeout = null
                }

                const currentWaiters =
                    messageVisibilityWaitersRef.current.get(eventId)
                currentWaiters?.delete(settle)

                if (currentWaiters?.size === 0) {
                    messageVisibilityWaitersRef.current.delete(eventId)
                }

                resolve(didBecomeVisible)
            }

            waitersForEvent.add(settle)
            messageVisibilityWaitersRef.current.set(eventId, waitersForEvent)

            timeout = setTimeout(() => {
                settle(false)
            }, MESSAGE_VISIBILITY_TIMEOUT_MS)

            if (visibleItemIdsRef.current.has(eventId)) {
                settle(true)
            }
        })
    }, [])

    useEffect(() => {
        if (listRefOverride) {
            return
        }

        const nextHasMountedInternalList =
            shouldRenderConversationList && Boolean(internalListRef.current)

        setHasMountedInternalList(prev =>
            prev === nextHasMountedInternalList
                ? prev
                : nextHasMountedInternalList,
        )
    }, [chatRows.length, listRefOverride, shouldRenderConversationList])

    useEffect(() => {
        setHighlightedMessageId(null)
        setVisibleItemIds(new Set())
        visibleItemIdsRef.current = new Set()
        routeRequestStateRef.current = {
            lastHandledKey: null,
            pendingKey: null,
        }
        pinnedRequestStateRef.current = {
            lastHandledKey: null,
            pendingKey: null,
        }
        focusPaginationRequestRef.current = null
        clearMessageVisibilityWaiters()
        clearHighlightTimeout()
    }, [clearHighlightTimeout, clearMessageVisibilityWaiters, roomId])

    useEffect(
        () => () => {
            clearMessageVisibilityWaiters()
            clearHighlightTimeout()
        },
        [clearHighlightTimeout, clearMessageVisibilityWaiters],
    )

    const waitForConversationListHandle = useCallback(async () => {
        if (listRefOverride) {
            return Boolean(listRefOverride.current)
        }

        if (internalListRef.current) {
            return true
        }

        for (
            let attempt = 0;
            attempt < MAX_LIST_HANDLE_WAIT_ATTEMPTS;
            attempt += 1
        ) {
            await waitForNextMacrotask()

            if (internalListRef.current) {
                setHasMountedInternalList(true)
                return true
            }
        }

        return false
    }, [listRefOverride])

    const scrollToLoadedMessage = useCallback(
        async (eventId: string): Promise<ScrollToLoadedMessageResult> => {
            for (
                let attempt = 0;
                attempt < MAX_LOADED_SCROLL_ATTEMPTS;
                attempt += 1
            ) {
                try {
                    clearHighlightTimeout()

                    const scrollResult = scrollToChatConversationEvent({
                        eventId,
                        eventIndexById: eventIndexByIdRef.current,
                        listRef,
                        setHighlightedMessageId,
                        highlightDuration: HIGHLIGHT_DURATION,
                    })

                    if (!scrollResult) {
                        return 'notLoaded'
                    }

                    highlightTimeoutRef.current = scrollResult.timeout

                    if (await waitForMessageVisibility(eventId)) {
                        return 'focused'
                    }
                } catch (error) {
                    log.error('Error in scrollToMessage', error)
                    return 'loadedButNotVisible'
                }
            }

            return 'loadedButNotVisible'
        },
        [
            clearHighlightTimeout,
            eventIndexByIdRef,
            listRef,
            waitForMessageVisibility,
        ],
    )

    const resolveScrollTargetEventId = useCallback(
        (eventId: string) => {
            if (eventIndexByIdRef.current.has(eventId)) {
                return eventId
            }

            const rawEvent = rawEventsByIdRef.current.get(eventId)
            if (!rawEvent || !isPaymentEvent(rawEvent)) {
                return eventId
            }

            return (
                visiblePaymentEventIdByPaymentIdRef.current.get(
                    rawEvent.content.paymentId,
                ) ??
                rawInitialPaymentEventIdByPaymentIdRef.current.get(
                    rawEvent.content.paymentId,
                ) ??
                eventId
            )
        },
        [
            eventIndexByIdRef,
            rawEventsByIdRef,
            rawInitialPaymentEventIdByPaymentIdRef,
            visiblePaymentEventIdByPaymentIdRef,
        ],
    )

    const waitForPaginationObservationChange = useCallback(
        async (
            previousRawEventCount: number,
            previousPaginationStatus: RpcBackPaginationStatus | null,
        ) => {
            for (
                let attempt = 0;
                attempt < MAX_PAGINATION_OBSERVATION_WAIT_ATTEMPTS;
                attempt += 1
            ) {
                const currentPaginationStatus =
                    paginationStatusRef.current ?? null

                if (
                    rawEventCountRef.current !== previousRawEventCount ||
                    currentPaginationStatus !== previousPaginationStatus ||
                    currentPaginationStatus === 'timelineStartReached'
                ) {
                    return
                }

                await waitForNextMacrotask()
            }
        },
        [paginationStatusRef, rawEventCountRef],
    )

    const requestFocusPagination = useCallback(async () => {
        const previousRawEventCount = rawEventCountRef.current
        const previousPaginationStatus = paginationStatusRef.current ?? null

        if (focusPaginationRequestRef.current) {
            return focusPaginationRequestRef.current
        }

        const request = (async () => {
            try {
                await handlePaginateRef.current(DEFAULT_PAGINATION_SIZE)
                await waitForPaginationObservationChange(
                    previousRawEventCount,
                    previousPaginationStatus,
                )
            } finally {
                focusPaginationRequestRef.current = null
            }
        })()

        focusPaginationRequestRef.current = request
        return request
    }, [
        handlePaginateRef,
        paginationStatusRef,
        rawEventCountRef,
        waitForPaginationObservationChange,
    ])

    const focusMessage = useCallback(
        async (eventId: string) => {
            const initialScrollResult = await scrollToLoadedMessage(
                resolveScrollTargetEventId(eventId),
            )
            if (initialScrollResult === 'focused') {
                return true
            }
            if (initialScrollResult === 'loadedButNotVisible') {
                return false
            }

            for (
                let attempt = 0;
                attempt < MAX_SCROLL_TO_MESSAGE_PAGINATION_ATTEMPTS;
                attempt += 1
            ) {
                const nextPaginationStatus = paginationStatusRef.current ?? null
                if (!nextPaginationStatus) {
                    return false
                }
                if (nextPaginationStatus === 'timelineStartReached') {
                    return false
                }

                if (isPaginatingRef.current) {
                    await waitForNextMacrotask()
                } else {
                    await requestFocusPagination()
                }

                const paginatedScrollResult = await scrollToLoadedMessage(
                    resolveScrollTargetEventId(eventId),
                )
                if (paginatedScrollResult === 'focused') {
                    return true
                }
                if (paginatedScrollResult === 'loadedButNotVisible') {
                    return false
                }
            }

            return false
        },
        [
            isPaginatingRef,
            paginationStatusRef,
            requestFocusPagination,
            resolveScrollTargetEventId,
            scrollToLoadedMessage,
        ],
    )

    const handleScrollToIndexFailed = useCallback(
        ({
            index,
            highestMeasuredFrameIndex: _highestMeasuredFrameIndex,
            averageItemLength,
        }: {
            index: number
            highestMeasuredFrameIndex: number
            averageItemLength: number
        }) => {
            listRef.current?.scrollToOffset({
                offset: averageItemLength * index,
                animated: false,
            })

            setTimeout(() => {
                listRef.current?.scrollToIndex({
                    index,
                    animated: false,
                    viewOffset: 100,
                    viewPosition: 0.5,
                })
            }, 50)
        },
        [listRef],
    )

    const handleViewableItemsChanged = useCallback(
        ({ viewableItems }: { viewableItems: ViewToken[] }) => {
            const nextVisibleItemIds = new Set(
                viewableItems.flatMap(item => (item.key ? [item.key] : [])),
            )

            visibleItemIdsRef.current = nextVisibleItemIds
            setVisibleItemIds(nextVisibleItemIds)
            resolveMessageVisibilityWaiters(nextVisibleItemIds, true)
        },
        [resolveMessageVisibilityWaiters],
    )

    useEffect(() => {
        if (!listRefOverride) {
            return
        }

        if (listRefOverride.__onViewableItemsChangedRef) {
            listRefOverride.__onViewableItemsChangedRef.current =
                handleViewableItemsChanged
        }
        if (listRefOverride.__onScrollToIndexFailedRef) {
            listRefOverride.__onScrollToIndexFailedRef.current =
                handleScrollToIndexFailed
        }
        if (listRefOverride.__getKeyForIndexRef) {
            listRefOverride.__getKeyForIndexRef.current = (index: number) =>
                (chatRows[index]?.event.id as string | undefined) ?? null
        }

        return () => {
            if (listRefOverride.__onViewableItemsChangedRef) {
                listRefOverride.__onViewableItemsChangedRef.current = null
            }
            if (listRefOverride.__onScrollToIndexFailedRef) {
                listRefOverride.__onScrollToIndexFailedRef.current = null
            }
            if (listRefOverride.__getKeyForIndexRef) {
                listRefOverride.__getKeyForIndexRef.current = null
            }
        }
    }, [
        chatRows,
        handleScrollToIndexFailed,
        handleViewableItemsChanged,
        listRefOverride,
    ])

    const consumeExactScrollRequest = useCallback(
        ({
            eventId,
            requestKey,
            requestStateRef,
            onComplete,
        }: {
            eventId: string | null
            requestKey: string | null
            requestStateRef: React.MutableRefObject<ExactScrollRequestState>
            onComplete?: (eventId: string) => void
        }) => {
            if (!shouldRenderConversationList || !eventId || !requestKey) {
                return
            }
            if (listRefOverride && !hasConversationListHandle) return

            const requestState = requestStateRef.current

            if (requestKey === requestState.lastHandledKey) return
            if (requestKey === requestState.pendingKey) return

            requestState.pendingKey = requestKey
            ;(async () => {
                const hasListHandle =
                    hasConversationListHandle ||
                    (await waitForConversationListHandle())
                if (!hasListHandle) {
                    requestState.pendingKey = null
                    return
                }

                const didScroll = await focusMessage(eventId)
                requestState.pendingKey = null

                if (!didScroll) return

                requestState.lastHandledKey = requestKey
                onComplete?.(eventId)
            })()
        },
        [
            focusMessage,
            hasConversationListHandle,
            listRefOverride,
            shouldRenderConversationList,
            waitForConversationListHandle,
        ],
    )

    useEffect(() => {
        consumeExactScrollRequest({
            eventId: routeScrollToMessageId,
            requestKey: routeScrollToMessageId,
            requestStateRef: routeRequestStateRef,
        })
    }, [
        chatRows.length,
        consumeExactScrollRequest,
        paginationStatus,
        routeScrollToMessageId,
    ])

    useEffect(() => {
        consumeExactScrollRequest({
            eventId: scrollToMessageRequest?.eventId ?? null,
            requestKey: scrollToMessageRequest
                ? String(scrollToMessageRequest.nonce)
                : null,
            requestStateRef: pinnedRequestStateRef,
            onComplete: onScrollToMessageComplete,
        })
    }, [
        chatRows.length,
        consumeExactScrollRequest,
        onScrollToMessageComplete,
        paginationStatus,
        scrollToMessageRequest,
    ])

    return {
        listRef,
        highlightedMessageId,
        visibleItemIds,
        handleViewableItemsChanged,
        handleScrollToIndexFailed,
        focusMessage,
    }
}
