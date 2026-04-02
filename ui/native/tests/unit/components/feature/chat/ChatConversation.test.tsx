import { useRoute } from '@react-navigation/native'
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import React from 'react'

import { DEFAULT_PAGINATION_SIZE } from '@fedi/common/constants/matrix'
import { useObserveMatrixRoom } from '@fedi/common/hooks/matrix'
import {
    handleMatrixRoomTimelineStreamUpdates,
    setMatrixRoomMembers,
    setupStore,
} from '@fedi/common/redux'
import {
    createMockNonPaymentEvent,
    createMockPaymentEvent,
    mockRoomMembers,
} from '@fedi/common/tests/mock-data/matrix-event'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { ChatType, MatrixEvent } from '@fedi/common/types'
import { RpcTimelineEventItemId } from '@fedi/common/types/bindings'
import i18n from '@fedi/native/localization/i18n'

import ChatConversation from '../../../../../components/feature/chat/ChatConversation'
import {
    CHAT_CONVERSATION_SCROLL_OPTIONS,
    getChatConversationRowIndex,
    makeChatConversationRows,
    scrollToChatConversationEvent,
} from '../../../../../utils/chatConversationRows'
import { renderWithProviders } from '../../../../utils/render'

const mockScrollToIndex = jest.fn()
const mockScrollToOffset = jest.fn()
const mockHandlePaginate = jest.fn()
let usingFakeTimers = false
const MOCK_AVERAGE_ITEM_LENGTH = 48
let mockScrollToIndexFailureCount = 0
let mockSuppressScrollToIndexViewability = false
const scheduledTimeouts = new Set<ReturnType<typeof setTimeout>>()

function mockScheduleTestTimeout(callback: () => void, delay = 0) {
    const timeout = setTimeout(() => {
        scheduledTimeouts.delete(timeout)
        callback()
    }, delay)

    scheduledTimeouts.add(timeout)
    return timeout
}

function clearScheduledTimeouts() {
    Array.from(scheduledTimeouts).forEach(timeout => clearTimeout(timeout))
    scheduledTimeouts.clear()
}

async function waitForMacrotask() {
    await new Promise<void>(resolve => {
        mockScheduleTestTimeout(resolve)
    })
}

// These mocks keep the tests focused on ChatConversation's exact-scroll wiring:
// FlatList is stubbed so scroll calls are deterministic without RN layout,
// and a few child components are reduced to simple stand-ins to avoid unrelated UI noise.
jest.mock('react-native', () => {
    const ReactModule = jest.requireActual<typeof import('react')>('react')
    const actual =
        jest.requireActual<typeof import('react-native')>('react-native')

    const renderListComponent = (component: unknown) => {
        if (!component) {
            return null
        }

        return ReactModule.isValidElement(component)
            ? component
            : ReactModule.createElement(component as any)
    }

    class FlatList extends ReactModule.Component<any> {
        scrollToIndex = (params: {
            index: number
            animated: boolean
            viewOffset: number
            viewPosition: number
        }) => {
            mockScrollToIndex(params)

            if (mockScrollToIndexFailureCount > 0) {
                mockScrollToIndexFailureCount -= 1
                mockScheduleTestTimeout(() => {
                    this.props.onScrollToIndexFailed?.({
                        index: params.index,
                        highestMeasuredFrameIndex: Math.max(
                            0,
                            params.index - 1,
                        ),
                        averageItemLength: MOCK_AVERAGE_ITEM_LENGTH,
                    })
                })
                return
            }

            mockScheduleTestTimeout(() => {
                if (mockSuppressScrollToIndexViewability) return

                const {
                    data = [],
                    keyExtractor,
                    onViewableItemsChanged,
                } = this.props
                const item = data[params.index]
                const key = item
                    ? keyExtractor
                        ? keyExtractor(item, params.index)
                        : String(params.index)
                    : String(params.index)

                onViewableItemsChanged?.({
                    viewableItems: [{ key }],
                })
            })
        }

        scrollToOffset = (params: { offset: number; animated: boolean }) => {
            mockScrollToOffset(params)
        }

        render() {
            const {
                data = [],
                renderItem,
                keyExtractor,
                ListEmptyComponent,
                ListHeaderComponent,
            } = this.props

            return (
                <actual.View>
                    {renderListComponent(ListHeaderComponent)}
                    {data.length === 0
                        ? renderListComponent(ListEmptyComponent)
                        : data.map((item: any, index: number) => {
                              const key = keyExtractor
                                  ? keyExtractor(item, index)
                                  : String(index)

                              return (
                                  <actual.View key={key}>
                                      {renderItem({ item, index })}
                                  </actual.View>
                              )
                          })}
                </actual.View>
            )
        }
    }

    return {
        ...actual,
        FlatList,
        unstable_batchedUpdates: (callback: () => void) => callback(),
    }
})

jest.mock('../../../../../components/feature/chat/ChatRepliedMessage', () => {
    const { Pressable, Text } =
        jest.requireActual<typeof import('react-native')>('react-native')

    return {
        __esModule: true,
        default: ({
            repliedData,
            onReplyTap,
        }: {
            repliedData: { id: string }
            onReplyTap?: (eventId: string) => void
        }) => (
            <Pressable onPress={() => onReplyTap?.(repliedData.id)}>
                <Text>{`reply:${repliedData.id}`}</Text>
            </Pressable>
        ),
    }
})

jest.mock(
    '../../../../../components/feature/chat/ChatUserActionsOverlay',
    () => {
        return {
            __esModule: true,
            ChatUserActionsOverlay: () => null,
        }
    },
)

jest.mock('@fedi/common/hooks/matrix', () => {
    const actual = jest.requireActual('@fedi/common/hooks/matrix')

    return {
        ...actual,
        useObserveMatrixRoom: jest.fn(() => ({
            isPaginating: false,
            paginationStatus: 'idle',
            handlePaginate: mockHandlePaginate,
        })),
    }
})

jest.mock('../../../../../components/ui/SvgImage', () => {
    const { Text: RNText } = jest.requireActual('react-native')
    return {
        __esModule: true,
        default: ({ name }: { name: string }) => <RNText>{name}</RNText>,
        SvgImageSize: {
            xxs: 'xxs',
            xs: 'xs',
            sm: 'sm',
            md: 'md',
            lg: 'lg',
            xl: 'xl',
        },
        getIconSizeMultiplier: () => 1,
    }
})

const ROOM_ID = '!test-room:example.com'

function storeWithEventsLoaded() {
    const store = setupStore()
    store.dispatch(
        handleMatrixRoomTimelineStreamUpdates({
            roomId: ROOM_ID,
            updates: [{ Clear: {} }],
        }),
    )
    return store
}

function storeWithLoadedConversation(events: MatrixEvent[]) {
    const store = storeWithEventsLoaded()
    store.dispatch(
        handleMatrixRoomTimelineStreamUpdates({
            roomId: ROOM_ID,
            updates: [{ Append: { values: events } }],
        }),
    )
    store.dispatch(
        setMatrixRoomMembers({
            roomId: ROOM_ID,
            members: mockRoomMembers
                .slice(0, 2)
                .map(member => ({ ...member, roomId: ROOM_ID })),
        }),
    )
    return store
}

function renderChat(
    store: ReturnType<typeof setupStore>,
    props: Partial<React.ComponentProps<typeof ChatConversation>> = {},
    fedimint = createMockFedimintBridge(),
) {
    const hasExplicitListRefOverride = Object.prototype.hasOwnProperty.call(
        props,
        'listRefOverride',
    )
    const resolvedProps = hasExplicitListRefOverride
        ? props
        : {
              ...props,
              listRefOverride: makeListRef() as any,
          }

    return renderWithProviders(
        <ChatConversation
            type={ChatType.group}
            id={ROOM_ID}
            newMessageBottomOffset={90}
            {...resolvedProps}
        />,
        { store, fedimint },
    )
}

function setRouteParams(params: Record<string, unknown> = {}) {
    jest.mocked(useRoute).mockReturnValue({
        key: 'ChatRoomConversation',
        name: 'ChatRoomConversation' as any,
        params: { roomId: ROOM_ID, ...params },
    })
}

function makeBurstEvents(count = 12) {
    return Array.from({ length: count }, (_, index) =>
        createMockNonPaymentEvent({
            id: `$burst-${index}` as any,
            roomId: ROOM_ID,
            sender: '@alice:example.com',
            timestamp: 1_750_083_034_389 - index * 1000,
            content: {
                body: `Burst ${index}`,
                formatted: null,
            },
        }),
    )
}

function makeListRef() {
    const onViewableItemsChangedRef = {
        current: null as
            | ((info: { viewableItems: Array<{ key: string }> }) => void)
            | null,
    }
    const onScrollToIndexFailedRef = {
        current: null as
            | ((info: {
                  index: number
                  highestMeasuredFrameIndex: number
                  averageItemLength: number
              }) => void)
            | null,
    }
    const getKeyForIndexRef = {
        current: null as ((index: number) => string | null) | null,
    }

    return {
        current: {
            scrollToIndex: (params: {
                index: number
                animated: boolean
                viewOffset: number
                viewPosition: number
            }) => {
                mockScrollToIndex(params)

                if (mockScrollToIndexFailureCount > 0) {
                    mockScrollToIndexFailureCount -= 1
                    mockScheduleTestTimeout(() => {
                        onScrollToIndexFailedRef.current?.({
                            index: params.index,
                            highestMeasuredFrameIndex: Math.max(
                                0,
                                params.index - 1,
                            ),
                            averageItemLength: MOCK_AVERAGE_ITEM_LENGTH,
                        })
                    })
                    return
                }

                mockScheduleTestTimeout(() => {
                    if (mockSuppressScrollToIndexViewability) return

                    const key = getKeyForIndexRef.current?.(params.index)
                    if (!key) return

                    onViewableItemsChangedRef.current?.({
                        viewableItems: [{ key }],
                    })
                })
            },
            scrollToOffset: (params: { offset: number; animated: boolean }) => {
                mockScrollToOffset(params)
            },
        },
        __onViewableItemsChangedRef: onViewableItemsChangedRef,
        __onScrollToIndexFailedRef: onScrollToIndexFailedRef,
        __getKeyForIndexRef: getKeyForIndexRef,
    }
}

type ExactScrollMode = 'route' | 'pinned'

function buildExactScrollProps({
    mode,
    eventId,
    onScrollToMessageComplete,
    nonce = 1,
}: {
    mode: ExactScrollMode
    eventId: string
    onScrollToMessageComplete: jest.Mock
    nonce?: number
}): Partial<React.ComponentProps<typeof ChatConversation>> {
    if (mode === 'route') {
        setRouteParams({ scrollToMessageId: eventId })
        return {}
    }

    return {
        scrollToMessageRequest: {
            eventId,
            nonce,
        },
        onScrollToMessageComplete,
    }
}

function renderExactScrollChat({
    mode,
    store,
    eventId,
    type = ChatType.group,
    nonce = 1,
}: {
    mode: ExactScrollMode
    store: ReturnType<typeof setupStore>
    eventId: string
    type?: ChatType
    nonce?: number
}) {
    const onScrollToMessageComplete = jest.fn()
    const view = renderChat(store, {
        type,
        ...buildExactScrollProps({
            mode,
            eventId,
            onScrollToMessageComplete,
            nonce,
        }),
    })

    return { view, onScrollToMessageComplete }
}

function rerenderExactScrollChat({
    view,
    mode,
    eventId,
    onScrollToMessageComplete,
    type = ChatType.group,
    nonce = 1,
}: {
    view: ReturnType<typeof renderChat>
    mode: ExactScrollMode
    eventId: string
    onScrollToMessageComplete: jest.Mock
    type?: ChatType
    nonce?: number
}) {
    const props = buildExactScrollProps({
        mode,
        eventId,
        onScrollToMessageComplete,
        nonce,
    })

    view.rerender(
        <ChatConversation
            type={type}
            id={ROOM_ID}
            newMessageBottomOffset={90}
            listRefOverride={makeListRef() as any}
            {...props}
        />,
    )
}

function expectExactScrollCompletion({
    mode,
    onScrollToMessageComplete,
    eventId,
}: {
    mode: ExactScrollMode
    onScrollToMessageComplete: jest.Mock
    eventId: string
}) {
    if (mode === 'pinned') {
        expect(onScrollToMessageComplete).toHaveBeenCalledWith(eventId)
        return
    }

    expect(onScrollToMessageComplete).not.toHaveBeenCalled()
}

function expectScrollToIndex(index: number) {
    expect(mockScrollToIndex).toHaveBeenCalledWith({
        index,
        ...CHAT_CONVERSATION_SCROLL_OPTIONS,
    })
}

async function flushPendingScrollConfirmation() {
    await Promise.resolve()
    await waitForMacrotask()
    await Promise.resolve()
}

async function flushPendingScrollWork(cycles = 1) {
    for (let cycle = 0; cycle < cycles; cycle += 1) {
        await flushPendingScrollConfirmation()
    }
}

describe('ChatConversation', () => {
    beforeEach(() => {
        setRouteParams()
        jest.clearAllMocks()
        jest.mocked(useObserveMatrixRoom).mockReturnValue({
            isPaginating: false,
            paginationStatus: 'idle',
            handlePaginate: mockHandlePaginate,
            canPaginateFurther: true,
            showLoading: false,
        })
        mockScrollToIndex.mockReset()
        mockScrollToOffset.mockReset()
        mockHandlePaginate.mockReset()
        usingFakeTimers = false
        mockScrollToIndexFailureCount = 0
        mockSuppressScrollToIndexViewability = false
    })

    afterEach(() => {
        cleanup()
        clearScheduledTimeouts()
        mockScrollToIndexFailureCount = 0
        mockSuppressScrollToIndexViewability = false
        if (usingFakeTimers) {
            jest.clearAllTimers()
            jest.useRealTimers()
        }
    })

    it('shows loading indicator when events have not loaded', () => {
        const store = setupStore()

        renderChat(store)

        expect(
            screen.queryByText(i18n.t('feature.chat.no-one-is-in-this-group')),
        ).not.toBeOnTheScreen()
        expect(
            screen.queryByText(i18n.t('feature.chat.no-messages'), {
                exact: false,
            }),
        ).not.toBeOnTheScreen()
    })

    it('shows loading state when events loaded but members not yet loaded', () => {
        const store = storeWithEventsLoaded()

        renderChat(store)

        expect(
            screen.queryByText(i18n.t('feature.chat.no-messages'), {
                exact: false,
            }),
        ).not.toBeOnTheScreen()
        expect(
            screen.queryByText(i18n.t('feature.chat.no-one-is-in-this-group'), {
                exact: false,
            }),
        ).not.toBeOnTheScreen()
    })

    it('shows NoMembersNotice when events loaded and member count is 1 (alone)', () => {
        const store = storeWithEventsLoaded()
        store.dispatch(
            setMatrixRoomMembers({
                roomId: ROOM_ID,
                members: [{ ...mockRoomMembers[0], roomId: ROOM_ID }],
            }),
        )

        renderChat(store)

        expect(
            screen.getByText(i18n.t('feature.chat.no-one-is-in-this-group'), {
                exact: false,
            }),
        ).toBeOnTheScreen()
    })

    it('resolves a focused event to its exact row index inside a same-sender burst', () => {
        const events = makeBurstEvents()
        const rows = makeChatConversationRows(events, ChatType.group)

        expect(rows).toHaveLength(events.length)
        expect(getChatConversationRowIndex(rows, '$burst-7')).toBe(7)
    })

    it('does not report a successful scroll when the list ref is missing', () => {
        const setHighlightedMessageId = jest.fn()

        expect(
            scrollToChatConversationEvent({
                eventId: '$burst-7',
                eventIndexById: new Map([['$burst-7', 7]]),
                listRef: { current: null },
                setHighlightedMessageId,
                highlightDuration: 3000,
            }),
        ).toBeNull()
        expect(setHighlightedMessageId).not.toHaveBeenCalled()
    })

    it('scrolls to the route-provided message id after mount', async () => {
        setRouteParams({ scrollToMessageId: '$burst-7' })
        const store = storeWithLoadedConversation(makeBurstEvents())

        renderChat(store)

        await act(async () => {
            await Promise.resolve()
        })

        expectScrollToIndex(7)
    })

    it('waits for members before consuming a route-based exact-scroll request', async () => {
        setRouteParams({ scrollToMessageId: '$burst-7' })
        const store = storeWithEventsLoaded()
        store.dispatch(
            handleMatrixRoomTimelineStreamUpdates({
                roomId: ROOM_ID,
                updates: [{ Append: { values: makeBurstEvents() } }],
            }),
        )

        const view = renderChat(store)

        await act(async () => {
            await Promise.resolve()
        })

        expect(mockScrollToIndex).not.toHaveBeenCalled()

        act(() => {
            store.dispatch(
                setMatrixRoomMembers({
                    roomId: ROOM_ID,
                    members: mockRoomMembers.slice(0, 2).map(member => ({
                        ...member,
                        roomId: ROOM_ID,
                    })),
                }),
            )
        })

        await act(async () => {
            await Promise.resolve()
        })

        view.rerender(
            <ChatConversation
                type={ChatType.group}
                id={ROOM_ID}
                newMessageBottomOffset={90}
                listRefOverride={makeListRef() as any}
            />,
        )

        await act(async () => {
            await flushPendingScrollConfirmation()
        })

        expectScrollToIndex(7)
    })

    it('scrolls to the replied event when the reply preview is pressed', () => {
        const targetEvent = createMockNonPaymentEvent({
            id: '$target-event' as any,
            roomId: ROOM_ID,
            sender: '@alice:example.com',
            timestamp: 1_750_083_034_389,
            content: {
                body: 'Original target',
                formatted: null,
            },
        })
        const fillerEvent = createMockNonPaymentEvent({
            id: '$filler-event' as any,
            roomId: ROOM_ID,
            sender: '@alice:example.com',
            timestamp: 1_750_083_034_388,
            content: {
                body: 'Filler',
                formatted: null,
            },
        })
        const replyEvent = createMockNonPaymentEvent({
            id: '$reply-event' as any,
            roomId: ROOM_ID,
            sender: '@bob:example.com',
            timestamp: 1_750_083_034_387,
            content: {
                body: 'Reply body',
                formatted: null,
            },
            inReply: {
                kind: 'ready',
                id: '$target-event',
                sender: '@alice:example.com',
                content: {
                    msgtype: 'm.text',
                    body: 'Original target',
                    formatted: null,
                },
            } as any,
        })
        const conversationEvents = [targetEvent, fillerEvent, replyEvent]
        const store = storeWithLoadedConversation(conversationEvents)

        renderChat(store)

        fireEvent.press(screen.getByText('reply:$target-event'))

        expectScrollToIndex(0)
    })

    describe.each([
        {
            label: 'route exact-scroll',
            mode: 'route' as ExactScrollMode,
        },
        {
            label: 'pinned-message exact-scroll',
            mode: 'pinned' as ExactScrollMode,
        },
    ])('$label pagination', ({ mode }) => {
        it('paginates until the requested event is loaded into the timeline', async () => {
            const store = storeWithEventsLoaded()
            store.dispatch(
                setMatrixRoomMembers({
                    roomId: ROOM_ID,
                    members: mockRoomMembers.slice(0, 2).map(member => ({
                        ...member,
                        roomId: ROOM_ID,
                    })),
                }),
            )

            const targetEvent = createMockNonPaymentEvent({
                id: '$context-event' as RpcTimelineEventItemId,
                roomId: ROOM_ID,
                content: { body: 'Fetched context message' },
            })

            let hasAppendedTargetEvent = false
            mockHandlePaginate.mockImplementation(async () => {
                if (hasAppendedTargetEvent) return
                hasAppendedTargetEvent = true
                store.dispatch(
                    handleMatrixRoomTimelineStreamUpdates({
                        roomId: ROOM_ID,
                        updates: [{ Append: { values: [targetEvent] } }],
                    }),
                )
            })

            const { onScrollToMessageComplete } = renderExactScrollChat({
                mode,
                store,
                eventId: '$context-event',
                type: ChatType.direct,
            })

            await act(async () => {
                await flushPendingScrollWork(2)
            })

            expect(mockHandlePaginate).toHaveBeenCalledWith(
                DEFAULT_PAGINATION_SIZE,
            )
            expectScrollToIndex(0)
            expectExactScrollCompletion({
                mode,
                onScrollToMessageComplete,
                eventId: '$context-event',
            })
        })

        it('does not issue duplicate pagination requests while waiting for the first page to become observable', async () => {
            const store = storeWithEventsLoaded()
            store.dispatch(
                setMatrixRoomMembers({
                    roomId: ROOM_ID,
                    members: mockRoomMembers.slice(0, 2).map(member => ({
                        ...member,
                        roomId: ROOM_ID,
                    })),
                }),
            )

            const targetEvent = createMockNonPaymentEvent({
                id: '$context-event' as RpcTimelineEventItemId,
                roomId: ROOM_ID,
                content: { body: 'Fetched context message' },
            })

            let releasePaginationObservation: (() => void) | undefined
            const paginationObservationReleased = new Promise<void>(resolve => {
                releasePaginationObservation = resolve
            })

            mockHandlePaginate.mockImplementation(async () => {
                paginationObservationReleased.then(() => {
                    store.dispatch(
                        handleMatrixRoomTimelineStreamUpdates({
                            roomId: ROOM_ID,
                            updates: [{ Append: { values: [targetEvent] } }],
                        }),
                    )
                })
            })

            const { onScrollToMessageComplete } = renderExactScrollChat({
                mode,
                store,
                eventId: '$context-event',
                type: ChatType.direct,
            })

            await act(async () => {
                await Promise.resolve()
            })

            expect(mockHandlePaginate).toHaveBeenCalledTimes(1)
            expect(mockScrollToIndex).not.toHaveBeenCalled()
            expect(onScrollToMessageComplete).not.toHaveBeenCalled()

            await act(async () => {
                releasePaginationObservation?.()
                await flushPendingScrollWork(2)
            })

            expect(mockHandlePaginate).toHaveBeenCalledTimes(1)
            expectScrollToIndex(0)
            expectExactScrollCompletion({
                mode,
                onScrollToMessageComplete,
                eventId: '$context-event',
            })
        })

        it('retries after pagination status becomes available', async () => {
            jest.mocked(useObserveMatrixRoom).mockReturnValue({
                isPaginating: false,
                paginationStatus: null as any,
                handlePaginate: mockHandlePaginate,
                canPaginateFurther: true,
                showLoading: false,
            })

            const store = storeWithEventsLoaded()
            store.dispatch(
                setMatrixRoomMembers({
                    roomId: ROOM_ID,
                    members: mockRoomMembers.slice(0, 2).map(member => ({
                        ...member,
                        roomId: ROOM_ID,
                    })),
                }),
            )

            const targetEvent = createMockNonPaymentEvent({
                id: '$context-event' as RpcTimelineEventItemId,
                roomId: ROOM_ID,
                content: { body: 'Fetched context message' },
            })

            let hasAppendedTargetEvent = false
            mockHandlePaginate.mockImplementation(async () => {
                if (hasAppendedTargetEvent) return
                hasAppendedTargetEvent = true
                store.dispatch(
                    handleMatrixRoomTimelineStreamUpdates({
                        roomId: ROOM_ID,
                        updates: [{ Append: { values: [targetEvent] } }],
                    }),
                )
            })

            const { view, onScrollToMessageComplete } = renderExactScrollChat({
                mode,
                store,
                eventId: '$context-event',
                type: ChatType.direct,
            })

            await act(async () => {
                await Promise.resolve()
            })

            expect(mockHandlePaginate).not.toHaveBeenCalled()
            expect(mockScrollToIndex).not.toHaveBeenCalled()
            expect(onScrollToMessageComplete).not.toHaveBeenCalled()

            jest.mocked(useObserveMatrixRoom).mockReturnValue({
                isPaginating: false,
                paginationStatus: 'idle',
                handlePaginate: mockHandlePaginate,
                canPaginateFurther: true,
                showLoading: false,
            })

            rerenderExactScrollChat({
                view,
                mode,
                eventId: '$context-event',
                onScrollToMessageComplete,
                type: ChatType.direct,
            })

            await act(async () => {
                await flushPendingScrollWork(2)
            })

            expect(mockHandlePaginate).toHaveBeenCalledWith(
                DEFAULT_PAGINATION_SIZE,
            )
            expectScrollToIndex(0)
            expectExactScrollCompletion({
                mode,
                onScrollToMessageComplete,
                eventId: '$context-event',
            })
        })
    })

    it('paginates one page at a time when route exact-scroll needs more than one backfill', async () => {
        setRouteParams({ scrollToMessageId: '$context-event' })
        const store = storeWithEventsLoaded()
        store.dispatch(
            setMatrixRoomMembers({
                roomId: ROOM_ID,
                members: mockRoomMembers.slice(0, 2).map(member => ({
                    ...member,
                    roomId: ROOM_ID,
                })),
            }),
        )

        const firstPageEvent = createMockNonPaymentEvent({
            id: '$page-one-event' as RpcTimelineEventItemId,
            roomId: ROOM_ID,
            content: { body: 'First page event' },
        })
        const targetEvent = createMockNonPaymentEvent({
            id: '$context-event' as RpcTimelineEventItemId,
            roomId: ROOM_ID,
            content: { body: 'Fetched context message' },
        })

        let paginateCallCount = 0
        mockHandlePaginate.mockImplementation(async () => {
            paginateCallCount += 1
            store.dispatch(
                handleMatrixRoomTimelineStreamUpdates({
                    roomId: ROOM_ID,
                    updates: [
                        {
                            Append: {
                                values:
                                    paginateCallCount === 1
                                        ? [firstPageEvent]
                                        : [targetEvent],
                            },
                        },
                    ],
                }),
            )
        })

        renderChat(store, {
            type: ChatType.direct,
        })

        await act(async () => {
            await flushPendingScrollWork(2)
        })

        expect(mockHandlePaginate).toHaveBeenCalledTimes(2)
        expect(mockHandlePaginate).toHaveBeenNthCalledWith(
            1,
            DEFAULT_PAGINATION_SIZE,
        )
        expect(mockHandlePaginate).toHaveBeenNthCalledWith(
            2,
            DEFAULT_PAGINATION_SIZE,
        )
        expectScrollToIndex(1)
    })

    it('scrolls to a pinned-message request and reports completion', async () => {
        const store = storeWithLoadedConversation(makeBurstEvents())
        const onScrollToMessageComplete = jest.fn()

        renderChat(store, {
            scrollToMessageRequest: {
                eventId: '$burst-7',
                nonce: 1,
            },
            onScrollToMessageComplete,
        })

        await act(async () => {
            await flushPendingScrollConfirmation()
        })

        expectScrollToIndex(7)
        expect(onScrollToMessageComplete).toHaveBeenCalledWith('$burst-7')
    })

    it('resolves pinned payment update requests onto the visible payment row', async () => {
        const initialPaymentEvent = createMockPaymentEvent({
            id: '$payment-pushed' as RpcTimelineEventItemId,
            roomId: ROOM_ID,
            timestamp: 1_750_083_034_389,
            content: {
                paymentId: 'payment-123',
                status: 'pushed',
                body: 'Requested payment',
            },
        })
        const acceptedPaymentEvent = createMockPaymentEvent({
            id: '$payment-accepted' as RpcTimelineEventItemId,
            roomId: ROOM_ID,
            timestamp: 1_750_083_034_390,
            content: {
                paymentId: 'payment-123',
                status: 'accepted',
                body: 'Accepted payment',
            },
        })
        const store = storeWithLoadedConversation([
            initialPaymentEvent,
            acceptedPaymentEvent,
        ])
        const onScrollToMessageComplete = jest.fn()

        renderChat(store, {
            scrollToMessageRequest: {
                eventId: acceptedPaymentEvent.id,
                nonce: 1,
            },
            onScrollToMessageComplete,
        })

        await act(async () => {
            await flushPendingScrollConfirmation()
        })

        expectScrollToIndex(0)
        expect(onScrollToMessageComplete).toHaveBeenCalledWith(
            acceptedPaymentEvent.id,
        )
    })

    it('does not retrigger a pinned-message request with the same nonce', async () => {
        const store = storeWithLoadedConversation(makeBurstEvents())
        const onScrollToMessageComplete = jest.fn()
        const view = renderChat(store, {
            scrollToMessageRequest: {
                eventId: '$burst-7',
                nonce: 1,
            },
            onScrollToMessageComplete,
        })

        await act(async () => {
            await Promise.resolve()
        })

        mockScrollToIndex.mockClear()
        onScrollToMessageComplete.mockClear()

        view.rerender(
            <ChatConversation
                type={ChatType.group}
                id={ROOM_ID}
                newMessageBottomOffset={90}
                listRefOverride={makeListRef() as any}
                scrollToMessageRequest={{
                    eventId: '$burst-7',
                    nonce: 1,
                }}
                onScrollToMessageComplete={onScrollToMessageComplete}
            />,
        )

        await act(async () => {
            await Promise.resolve()
        })

        expect(mockScrollToIndex).not.toHaveBeenCalled()
        expect(onScrollToMessageComplete).not.toHaveBeenCalled()
    })

    it('waits for members before consuming a pinned-message scroll request', async () => {
        const store = storeWithEventsLoaded()
        const onScrollToMessageComplete = jest.fn()
        store.dispatch(
            handleMatrixRoomTimelineStreamUpdates({
                roomId: ROOM_ID,
                updates: [{ Append: { values: makeBurstEvents() } }],
            }),
        )

        const view = renderChat(store, {
            scrollToMessageRequest: {
                eventId: '$burst-7',
                nonce: 1,
            },
            onScrollToMessageComplete,
        })

        await act(async () => {
            await flushPendingScrollConfirmation()
        })

        expect(mockScrollToIndex).not.toHaveBeenCalled()
        expect(onScrollToMessageComplete).not.toHaveBeenCalled()

        act(() => {
            store.dispatch(
                setMatrixRoomMembers({
                    roomId: ROOM_ID,
                    members: mockRoomMembers.slice(0, 2).map(member => ({
                        ...member,
                        roomId: ROOM_ID,
                    })),
                }),
            )
        })

        await act(async () => {
            await Promise.resolve()
        })

        view.rerender(
            <ChatConversation
                type={ChatType.group}
                id={ROOM_ID}
                newMessageBottomOffset={90}
                listRefOverride={makeListRef() as any}
                scrollToMessageRequest={{
                    eventId: '$burst-7',
                    nonce: 1,
                }}
                onScrollToMessageComplete={onScrollToMessageComplete}
            />,
        )

        await act(async () => {
            await Promise.resolve()
        })

        expectScrollToIndex(7)
        expect(onScrollToMessageComplete).toHaveBeenCalledWith('$burst-7')
    })

    it('only reports pinned-message completion after the fallback scroll makes the row visible', async () => {
        const store = storeWithLoadedConversation(makeBurstEvents())
        const onScrollToMessageComplete = jest.fn()
        usingFakeTimers = true
        jest.useFakeTimers()
        mockScrollToIndexFailureCount = 1

        renderChat(store, {
            scrollToMessageRequest: {
                eventId: '$burst-7',
                nonce: 1,
            },
            onScrollToMessageComplete,
        })

        await act(async () => {
            await Promise.resolve()
        })

        expect(mockScrollToIndex).toHaveBeenCalledTimes(1)
        expect(onScrollToMessageComplete).not.toHaveBeenCalled()

        await act(async () => {
            jest.advanceTimersByTime(49)
            await Promise.resolve()
        })

        expect(onScrollToMessageComplete).not.toHaveBeenCalled()

        await act(async () => {
            jest.advanceTimersByTime(2)
            await Promise.resolve()
            await Promise.resolve()
        })

        expect(mockScrollToOffset).toHaveBeenCalledWith({
            offset: MOCK_AVERAGE_ITEM_LENGTH * 7,
            animated: false,
        })
        expect(mockScrollToIndex).toHaveBeenCalledTimes(2)
        expectScrollToIndex(7)
        expect(onScrollToMessageComplete).toHaveBeenCalledWith('$burst-7')
    })

    it('does not report pinned-message completion when a loaded row never becomes visible', async () => {
        const store = storeWithLoadedConversation(makeBurstEvents())
        const onScrollToMessageComplete = jest.fn()
        usingFakeTimers = true
        jest.useFakeTimers()
        mockSuppressScrollToIndexViewability = true

        renderChat(store, {
            scrollToMessageRequest: {
                eventId: '$burst-7',
                nonce: 1,
            },
            onScrollToMessageComplete,
        })

        await act(async () => {
            await Promise.resolve()
        })

        expect(mockScrollToIndex).toHaveBeenCalledTimes(1)
        expect(onScrollToMessageComplete).not.toHaveBeenCalled()

        await act(async () => {
            jest.advanceTimersByTime(1000)
            await Promise.resolve()
            await Promise.resolve()
        })

        expect(mockScrollToIndex).toHaveBeenCalledTimes(2)
        expect(onScrollToMessageComplete).not.toHaveBeenCalled()
    })
})
