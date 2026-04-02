import {
    cleanup,
    fireEvent,
    screen,
    waitFor,
} from '@testing-library/react-native'
import React from 'react'

import {
    addMatrixRoomInfo,
    handleMatrixRoomPinnedTimelineStreamUpdates,
    handleMatrixRoomListStreamUpdates,
    handleMatrixRoomTimelineStreamUpdates,
    selectGroupPreview,
    selectMatrixRoom,
    setMatrixRoomMembers,
    setupStore,
} from '@fedi/common/redux'
import {
    createMockGroupPreview,
    MOCK_MATRIX_ROOM,
} from '@fedi/common/tests/mock-data/matrix'
import {
    createMockNonPaymentEvent,
    mockRoomMembers,
} from '@fedi/common/tests/mock-data/matrix-event'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { MatrixRoom } from '@fedi/common/types'

import ChatRoomConversation from '../../../screens/ChatRoomConversation'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const mockScrollToIndex = jest.fn()
const mockScrollToOffset = jest.fn()
let latestPinnedScrollRequest: { eventId: string; nonce: number } | null = null

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

jest.mock('@fedi/common/hooks/matrix', () => {
    const actual = jest.requireActual('@fedi/common/hooks/matrix')

    return {
        ...actual,
        useObserveMatrixRoom: jest.fn(() => ({
            isPaginating: false,
            paginationStatus: 'idle',
            handlePaginate: jest.fn(),
            canPaginateFurther: true,
            showLoading: false,
        })),
    }
})

jest.mock('../../../components/feature/chat/MessageInput', () => () => null)
jest.mock('../../../components/feature/chat/ChatConversation', () => {
    const { Text: RNText } = jest.requireActual('react-native')

    return {
        __esModule: true,
        default: (props: {
            scrollToMessageRequest?: { eventId: string; nonce: number } | null
        }) => {
            latestPinnedScrollRequest = props.scrollToMessageRequest ?? null
            return <RNText testID="chat-conversation-probe">chat</RNText>
        },
    }
})
jest.mock('../../../components/feature/chat/PinnedMessageBanner', () => {
    const { Pressable, Text } =
        jest.requireActual<typeof import('react-native')>('react-native')

    return {
        __esModule: true,
        default: ({
            onPressPinnedMessage,
        }: {
            onPressPinnedMessage?: (eventId: string) => void
        }) => (
            <Pressable
                testID="pinned-message-banner"
                onPress={() => onPressPinnedMessage?.('$event-2')}>
                <Text>pinned-banner</Text>
            </Pressable>
        ),
    }
})
jest.mock(
    '../../../components/feature/chat/SelectedMessageOverlay',
    () => () => null,
)
jest.mock(
    '../../../components/feature/multispend/MultispendChatBanner',
    () => () => null,
)
jest.mock('../../../components/ui/SvgImage', () => {
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

const TEST_ROOM_ID = '!default-room:test.server'

const defaultGroupPreview = createMockGroupPreview({
    id: TEST_ROOM_ID,
    name: 'Default Community Chat',
})

function createStoreWithGroupPreview() {
    const store = setupStore()
    // Dispatch the fulfilled action directly to populate groupPreviews
    // via the same reducer path that previewFederationDefaultChats uses
    store.dispatch({
        type: 'matrix/previewFederationDefaultChats/fulfilled',
        payload: [defaultGroupPreview],
    })
    return store
}

function createStoreWithJoinedConversation() {
    const store = setupStore()
    const joinedRoom: MatrixRoom = {
        ...MOCK_MATRIX_ROOM,
        id: TEST_ROOM_ID,
        name: 'Default Community Chat',
        roomState: 'joined',
    }

    store.dispatch(addMatrixRoomInfo(joinedRoom))
    store.dispatch(
        handleMatrixRoomListStreamUpdates([
            {
                Append: {
                    values: [{ status: 'ready' as const, id: TEST_ROOM_ID }],
                },
            },
        ]),
    )
    store.dispatch(
        setMatrixRoomMembers({
            roomId: TEST_ROOM_ID,
            members: mockRoomMembers
                .slice(0, 2)
                .map(member => ({ ...member, roomId: TEST_ROOM_ID })),
        }),
    )

    const events = [
        createMockNonPaymentEvent({
            id: '$event-1' as any,
            roomId: TEST_ROOM_ID,
            timestamp: 1_750_083_034_391,
            content: { body: 'Newest message', formatted: null },
        }),
        createMockNonPaymentEvent({
            id: '$event-2' as any,
            roomId: TEST_ROOM_ID,
            timestamp: 1_750_083_034_390,
            content: { body: 'Pinned target', formatted: null },
        }),
        createMockNonPaymentEvent({
            id: '$event-3' as any,
            roomId: TEST_ROOM_ID,
            timestamp: 1_750_083_034_389,
            content: { body: 'Oldest message', formatted: null },
        }),
    ]

    store.dispatch(
        handleMatrixRoomTimelineStreamUpdates({
            roomId: TEST_ROOM_ID,
            updates: [{ Clear: {} }, { Append: { values: events } }],
        }),
    )
    store.dispatch(
        handleMatrixRoomPinnedTimelineStreamUpdates({
            roomId: TEST_ROOM_ID,
            updates: [
                {
                    Reset: {
                        values: [
                            {
                                kind: 'event',
                                value: {
                                    id: '$event-2' as any,
                                    content: {
                                        msgtype: 'm.text',
                                        body: 'Pinned target',
                                        formatted: null,
                                    },
                                    localEcho: false,
                                    timestamp: 1_750_083_034_390,
                                    sender: mockRoomMembers[0].id,
                                    sendState: null,
                                    inReply: null,
                                    mentions: null,
                                },
                            },
                        ],
                    },
                },
            ],
        }),
    )

    return store
}

const chatRoomRoute = {
    ...mockRoute,
    key: 'ChatRoomConversation',
    name: 'ChatRoomConversation',
    params: { roomId: TEST_ROOM_ID, scrollToMessageId: undefined },
} as any

describe('ChatRoomConversation - default group join', () => {
    beforeEach(() => {
        jest.useFakeTimers()
        jest.clearAllMocks()
        jest.clearAllTimers()
        mockScrollToIndex.mockReset()
        mockScrollToOffset.mockReset()
        latestPinnedScrollRequest = null
        // Set params on the global mockRoute so child components using
        // useRoute() also see them (e.g. ChatConversation reads scrollToMessageId)
        ;(mockRoute as any).params = {
            roomId: TEST_ROOM_ID,
            scrollToMessageId: undefined,
        }
    })

    afterEach(() => {
        jest.clearAllTimers()
        jest.useRealTimers()
        cleanup()
    })

    it('renders join button when groupPreview exists but room is not joined', () => {
        const store = createStoreWithGroupPreview()

        // Verify preconditions via selectors
        const state = store.getState()
        expect(selectMatrixRoom(state, TEST_ROOM_ID)).toBeUndefined()
        expect(selectGroupPreview(state, TEST_ROOM_ID)).toBeDefined()
        expect(selectGroupPreview(state, TEST_ROOM_ID)?.isDefaultGroup).toBe(
            true,
        )

        renderWithProviders(
            <ChatRoomConversation
                navigation={mockNavigation as any}
                route={chatRoomRoute}
            />,
            { store, fedimint: createMockFedimintBridge() },
        )

        const joinButton = screen.getByText('Join group')
        expect(joinButton).toBeOnTheScreen()

        fireEvent.press(joinButton)

        expect(mockNavigation.navigate).toHaveBeenCalledWith(
            'ConfirmJoinPublicGroup',
            { groupId: TEST_ROOM_ID },
        )
    })

    it('does not render join button when the room is already joined', () => {
        const store = createStoreWithGroupPreview()

        // Add the room as joined
        const joinedRoom: MatrixRoom = {
            ...MOCK_MATRIX_ROOM,
            id: TEST_ROOM_ID,
            name: 'Default Community Chat',
            roomState: 'joined',
        }
        store.dispatch(addMatrixRoomInfo(joinedRoom))
        store.dispatch(
            handleMatrixRoomListStreamUpdates([
                {
                    Append: {
                        values: [
                            { status: 'ready' as const, id: TEST_ROOM_ID },
                        ],
                    },
                },
            ]),
        )

        expect(selectMatrixRoom(store.getState(), TEST_ROOM_ID)).toBeDefined()

        renderWithProviders(
            <ChatRoomConversation
                navigation={mockNavigation as any}
                route={chatRoomRoute}
            />,
            { store, fedimint: createMockFedimintBridge() },
        )

        expect(screen.queryByText('Join group')).not.toBeOnTheScreen()
    })

    it('forwards pinned-banner taps into conversation exact-scroll requests', async () => {
        const store = createStoreWithJoinedConversation()

        renderWithProviders(
            <ChatRoomConversation
                navigation={mockNavigation as any}
                route={chatRoomRoute}
            />,
            { store, fedimint: createMockFedimintBridge() },
        )

        fireEvent.press(screen.getByTestId('pinned-message-banner'))

        await waitFor(() => {
            expect(latestPinnedScrollRequest).toEqual({
                eventId: '$event-2',
                nonce: 1,
            })
        })
    })
})
