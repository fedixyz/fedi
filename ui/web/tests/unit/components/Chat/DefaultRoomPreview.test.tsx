import '@testing-library/jest-dom'
import { fireEvent, screen } from '@testing-library/react'

import {
    addMatrixRoomInfo,
    handleMatrixRoomListStreamUpdates,
    setupStore,
} from '@fedi/common/redux'
import {
    createMockGroupPreview,
    MOCK_MATRIX_ROOM,
} from '@fedi/common/tests/mock-data/matrix'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { MatrixRoom } from '@fedi/common/types'
import { makeUnpreviewableDefaultChat } from '@fedi/common/utils/matrix'
import { DefaultRoomPreview } from '@fedi/web/src/components/Chat/DefaultRoomPreview'
import { chatConfirmJoinPublicRoomRoute } from '@fedi/web/src/constants/routes'
import i18n from '@fedi/web/src/localization/i18n'

import { renderWithProviders } from '../../../utils/render'

const mockPush = jest.fn()
jest.mock('next/router', () => ({
    useRouter: () => ({ push: mockPush }),
}))

const TEST_ROOM_ID = '!default-chat:test.server'
const TEST_COMMUNITY_ID = 'test-community'

const mockJoinRoom = jest.fn()
const mockKnockRoom = jest.fn()

function createFedimint() {
    const fedimint = createMockFedimintBridge()
    fedimint.getMatrixClient = jest.fn().mockReturnValue({
        joinRoom: mockJoinRoom,
        knockRoom: mockKnockRoom,
    })
    return fedimint
}

function createDefaultChatRoom(overrides: Partial<MatrixRoom> = {}) {
    return {
        ...MOCK_MATRIX_ROOM,
        id: TEST_ROOM_ID,
        name: 'Community Chat',
        ...overrides,
    }
}

// Seeds the store the way previewCommunityDefaultChats does, so
// selectDefaultMatrixRoom resolves the tile's room.
function createStoreWithDefaultChat(overrides: Partial<MatrixRoom> = {}) {
    const store = setupStore()
    store.dispatch({
        type: 'matrix/previewCommunityDefaultChats/fulfilled',
        payload: [
            createMockGroupPreview({
                id: TEST_ROOM_ID,
                name: 'Community Chat',
                ...overrides,
            }),
        ],
        meta: { arg: { communityId: TEST_COMMUNITY_ID } },
    })
    return store
}

function addMembership(
    store: ReturnType<typeof setupStore>,
    roomState: MatrixRoom['roomState'],
) {
    store.dispatch(
        addMatrixRoomInfo(
            createDefaultChatRoom({ roomState, isPreview: false }),
        ),
    )
    store.dispatch(
        handleMatrixRoomListStreamUpdates([
            {
                Append: {
                    values: [{ status: 'ready' as const, id: TEST_ROOM_ID }],
                },
            },
        ]),
    )
}

describe('/components/Chat/DefaultRoomPreview', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockJoinRoom.mockResolvedValue(undefined)
        mockKnockRoom.mockResolvedValue(undefined)
    })

    it('should open the room preview from the Join button for a public chat', () => {
        renderWithProviders(
            <DefaultRoomPreview room={createDefaultChatRoom()} />,
            {
                store: createStoreWithDefaultChat({ isPublic: true }),
                fedimint: createFedimint(),
            },
        )

        fireEvent.click(
            screen.getByRole('button', { name: i18n.t('words.join') }),
        )

        // Opens the confirm-join screen rather than joining in place.
        expect(mockPush).toHaveBeenCalledWith(
            chatConfirmJoinPublicRoomRoute(TEST_ROOM_ID),
        )
        expect(mockJoinRoom).not.toHaveBeenCalled()
        expect(mockKnockRoom).not.toHaveBeenCalled()
    })

    it('should open the room preview from the Join button for a knockable chat', () => {
        renderWithProviders(
            <DefaultRoomPreview room={createDefaultChatRoom()} />,
            {
                store: createStoreWithDefaultChat({
                    isPublic: false,
                    allowKnocking: true,
                }),
                fedimint: createFedimint(),
            },
        )

        fireEvent.click(
            screen.getByRole('button', { name: i18n.t('words.join') }),
        )

        // A knockable room opens the same confirm screen, where the knock is
        // confirmed; it must not knock straight from the tile.
        expect(mockPush).toHaveBeenCalledWith(
            chatConfirmJoinPublicRoomRoute(TEST_ROOM_ID),
        )
        expect(mockKnockRoom).not.toHaveBeenCalled()
        expect(mockJoinRoom).not.toHaveBeenCalled()
    })

    it('should show Pending for a chat the user already knocked on', () => {
        const store = createStoreWithDefaultChat({
            isPublic: false,
            allowKnocking: true,
        })
        addMembership(store, 'knocked')

        renderWithProviders(
            <DefaultRoomPreview room={createDefaultChatRoom()} />,
            { store, fedimint: createFedimint() },
        )

        expect(
            screen.getByRole('button', { name: i18n.t('words.pending') }),
        ).toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: i18n.t('words.join') }),
        ).not.toBeInTheDocument()
    })

    it('should show only the chevron once the user has joined', () => {
        const store = createStoreWithDefaultChat({ isPublic: true })
        addMembership(store, 'joined')

        renderWithProviders(
            <DefaultRoomPreview room={createDefaultChatRoom()} />,
            { store, fedimint: createFedimint() },
        )

        expect(
            screen.getByTestId('DefaultRoomPreview__chevron'),
        ).toBeInTheDocument()
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('labels an unpreviewable knockable chat as a private group', () => {
        const store = setupStore()
        store.dispatch({
            type: 'matrix/previewCommunityDefaultChats/fulfilled',
            payload: [makeUnpreviewableDefaultChat(TEST_ROOM_ID)],
            meta: { arg: { communityId: TEST_COMMUNITY_ID } },
        })

        renderWithProviders(
            <DefaultRoomPreview room={createDefaultChatRoom({ name: '' })} />,
            { store, fedimint: createFedimint() },
        )

        // Web tiles match the native label instead of a blank or "New group".
        expect(
            screen.getByText(i18n.t('feature.chat.private-group')),
        ).toBeInTheDocument()
    })

    it('shows the real room name once joined, not a placeholder label', () => {
        const store = setupStore()
        store.dispatch({
            type: 'matrix/previewCommunityDefaultChats/fulfilled',
            payload: [makeUnpreviewableDefaultChat(TEST_ROOM_ID)],
            meta: { arg: { communityId: TEST_COMMUNITY_ID } },
        })
        // Live membership knows the real name even though the cached preview
        // is the empty placeholder.
        addMembership(store, 'joined')

        renderWithProviders(
            <DefaultRoomPreview room={createDefaultChatRoom({ name: '' })} />,
            { store, fedimint: createFedimint() },
        )

        expect(screen.getByText('Community Chat')).toBeInTheDocument()
        expect(
            screen.queryByText(i18n.t('feature.chat.private-group')),
        ).not.toBeInTheDocument()
    })
})
