import { useRoute } from '@react-navigation/native'
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import React from 'react'

import {
    handleMatrixRoomTimelineStreamUpdates,
    setMatrixRoomMembers,
    setupStore,
} from '@fedi/common/redux'
import {
    createMockNonPaymentEvent,
    mockRoomMembers,
} from '@fedi/common/tests/mock-data/matrix-event'
import { ChatType, MatrixEvent } from '@fedi/common/types'
import i18n from '@fedi/native/localization/i18n'

import ChatConversation from '../../../../../components/feature/chat/ChatConversation'
import {
    CHAT_CONVERSATION_SCROLL_OPTIONS,
    getChatConversationRowIndex,
    makeChatConversationRows,
} from '../../../../../utils/chatConversationRows'
import { renderWithProviders } from '../../../../utils/render'

const mockScrollToIndex = jest.fn()
const mockScrollToOffset = jest.fn()
let usingFakeTimers = false

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
        scrollToIndex = mockScrollToIndex
        scrollToOffset = mockScrollToOffset

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

// Mock useObserveMatrixRoom which starts room observation
jest.mock('@fedi/common/hooks/matrix', () => {
    const actual = jest.requireActual('@fedi/common/hooks/matrix')

    return {
        ...actual,
        useObserveMatrixRoom: jest.fn(() => ({
            isPaginating: false,
            handlePaginate: jest.fn(),
        })),
    }
})

// Mock SvgImage used in NoMessagesNotice and Avatar
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

// Use a deterministic list stub so tests can assert exact scroll targets
// without depending on RN layout measurement.
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
    listRefOverride?: React.RefObject<any>,
) {
    return renderWithProviders(
        <ChatConversation
            type={ChatType.group}
            id={ROOM_ID}
            newMessageBottomOffset={90}
            listRefOverride={listRefOverride}
        />,
        { store },
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
    return {
        current: {
            scrollToIndex: mockScrollToIndex,
            scrollToOffset: mockScrollToOffset,
        },
    }
}

function expectScrollToIndex(index: number) {
    expect(mockScrollToIndex).toHaveBeenCalledWith({
        index,
        ...CHAT_CONVERSATION_SCROLL_OPTIONS,
    })
}

describe('ChatConversation', () => {
    beforeEach(() => {
        setRouteParams()
        jest.clearAllMocks()
        mockScrollToIndex.mockReset()
        mockScrollToOffset.mockReset()
        usingFakeTimers = false
    })

    afterEach(() => {
        cleanup()
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

    it('scrolls to the route-provided message id after mount', () => {
        jest.useFakeTimers()
        usingFakeTimers = true
        setRouteParams({ scrollToMessageId: '$burst-7' })
        const store = storeWithLoadedConversation(makeBurstEvents())

        renderChat(store, makeListRef())

        act(() => {
            jest.advanceTimersByTime(300)
        })

        expectScrollToIndex(7)
    })

    it('scrolls to the replied event when the reply preview is pressed', () => {
        jest.useFakeTimers()
        usingFakeTimers = true
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

        renderChat(store, makeListRef())

        fireEvent.press(screen.getByText('reply:$target-event'))

        expectScrollToIndex(0)
    })
})
