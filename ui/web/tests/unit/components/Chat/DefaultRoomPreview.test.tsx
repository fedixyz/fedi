import '@testing-library/jest-dom'
import { fireEvent, screen, waitFor } from '@testing-library/react'

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
import { DefaultRoomPreview } from '@fedi/web/src/components/Chat/DefaultRoomPreview'
import i18n from '@fedi/web/src/localization/i18n'

import { renderWithProviders } from '../../../utils/render'

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

    it('should join a public chat in place from the Join button', async () => {
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

        await waitFor(() => {
            expect(mockJoinRoom).toHaveBeenCalledWith(TEST_ROOM_ID, true)
        })
        expect(mockKnockRoom).not.toHaveBeenCalled()
        expect(
            await screen.findByTestId('DefaultRoomPreview__chevron'),
        ).toBeInTheDocument()
    })

    it('should knock on a private knockable chat and show Pending', async () => {
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

        await waitFor(() => {
            expect(mockKnockRoom).toHaveBeenCalledWith(TEST_ROOM_ID, undefined)
        })
        expect(mockJoinRoom).not.toHaveBeenCalled()
        expect(
            await screen.findByRole('button', {
                name: i18n.t('words.pending'),
            }),
        ).toBeInTheDocument()
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
})
