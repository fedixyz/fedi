import { fireEvent, screen, waitFor } from '@testing-library/react-native'

import {
    addMatrixRoomInfo,
    handleMatrixRoomListStreamUpdates,
    selectGroupPreview,
    selectMatrixRoom,
    setupStore,
} from '@fedi/common/redux'
import {
    createMockGroupPreview,
    MOCK_MATRIX_ROOM,
} from '@fedi/common/tests/mock-data/matrix'
import { MatrixRoom } from '@fedi/common/types'

import ChatRoomConversation from '../../../screens/ChatRoomConversation'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

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

const chatRoomRoute = {
    ...mockRoute,
    key: 'ChatRoomConversation',
    name: 'ChatRoomConversation',
    params: { roomId: TEST_ROOM_ID, scrollToMessageId: undefined },
} as any

describe('ChatRoomConversation - default group join', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        // Set params on the global mockRoute so child components using
        // useRoute() also see them (e.g. ChatConversation reads scrollToMessageId)
        ;(mockRoute as any).params = {
            roomId: TEST_ROOM_ID,
            scrollToMessageId: undefined,
        }
    })

    it('renders join button when groupPreview exists but room is not joined', async () => {
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
            { store },
        )

        const joinButton = await screen.findByText('Join group')
        expect(joinButton).toBeOnTheScreen()

        fireEvent.press(joinButton)

        expect(mockNavigation.navigate).toHaveBeenCalledWith(
            'ConfirmJoinPublicGroup',
            { groupId: TEST_ROOM_ID },
        )
    })

    it('does not render join button when the room is already joined', async () => {
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
            { store },
        )

        await waitFor(() => {
            expect(screen.queryByText('Join group')).not.toBeOnTheScreen()
        })
    })
})
