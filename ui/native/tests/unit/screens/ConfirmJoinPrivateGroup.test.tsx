import {
    cleanup,
    fireEvent,
    screen,
    waitFor,
} from '@testing-library/react-native'
import React from 'react'

import {
    addMatrixRoomInfo,
    handleMatrixRoomListStreamUpdates,
    setupStore,
} from '@fedi/common/redux'
import { MOCK_MATRIX_ROOM } from '@fedi/common/tests/mock-data/matrix'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { MatrixGroupPreview, MatrixRoom } from '@fedi/common/types'

import ConfirmJoinPrivateGroup from '../../../screens/ConfirmJoinPrivateGroup'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const TEST_ROOM_ID = '!test-knock-room:example.com'

const mockKnockGroup = jest.fn()
const mockJoinPublicGroup = jest.fn()

jest.mock('@fedi/common/hooks/matrix', () => {
    const actual = jest.requireActual('@fedi/common/hooks/matrix')
    return {
        ...actual,
        useMatrixChatInvites: () => ({
            joinPublicGroup: mockJoinPublicGroup,
            knockGroup: mockKnockGroup,
        }),
    }
})

const confirmJoinRoute = {
    ...mockRoute,
    key: 'ConfirmJoinPrivateGroup',
    name: 'ConfirmJoinPrivateGroup',
    params: { roomId: TEST_ROOM_ID },
} as any

const knockablePrivatePreview: MatrixGroupPreview = {
    info: {
        ...MOCK_MATRIX_ROOM,
        id: TEST_ROOM_ID,
        name: 'Private Room',
        isPublic: false,
        allowKnocking: true,
    },
    timeline: [],
}

const setupStoreWithPreview = (preview: MatrixGroupPreview) =>
    setupStore({
        matrix: {
            roomList: [],
            roomPowerLevels: {},
            rejectedRoomInvites: [],
            seenRoomInvites: [],
            groupPreviews: { [TEST_ROOM_ID]: preview },
            roomMembers: {},
        },
    } as any)

describe('ConfirmJoinPrivateGroup', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockKnockGroup.mockResolvedValue(true)
        mockJoinPublicGroup.mockResolvedValue(true)
    })

    afterEach(() => {
        cleanup()
    })

    it('shows "Request to join" for private rooms that allow knocking', async () => {
        const store = setupStoreWithPreview(knockablePrivatePreview)

        renderWithProviders(
            <ConfirmJoinPrivateGroup
                navigation={mockNavigation as any}
                route={confirmJoinRoute}
            />,
            { store, fedimint: createMockFedimintBridge() },
        )

        await waitFor(() => {
            expect(screen.getByText('Request to join')).toBeOnTheScreen()
        })
        expect(
            screen.getByText(
                'This is a private group. You must request to join and wait for an admin to approve.',
            ),
        ).toBeOnTheScreen()
    })

    it('shows "Request to join" when preview is unavailable (private room via QR/deeplink)', async () => {
        // Even with MSC3266 room previews, some homeservers won't expose
        // metadata for a given room (older servers, federation gaps). The
        // UI should still let the user attempt to knock.
        const store = setupStore()
        const mockBridge = createMockFedimintBridge({
            matrixGetRoomPreview: () =>
                Promise.reject(new Error('preview unavailable')),
            matrixPublicRoomInfo: () =>
                Promise.reject(new Error('not in directory')),
        })

        renderWithProviders(
            <ConfirmJoinPrivateGroup
                navigation={mockNavigation as any}
                route={confirmJoinRoute}
            />,
            { store, fedimint: mockBridge },
        )

        await waitFor(() => {
            expect(screen.getByText('Request to join')).toBeOnTheScreen()
        })
    })

    it('shows invite-only message for private rooms that disallow knocking', async () => {
        const store = setupStoreWithPreview({
            ...knockablePrivatePreview,
            info: { ...knockablePrivatePreview.info, allowKnocking: false },
        })

        renderWithProviders(
            <ConfirmJoinPrivateGroup
                navigation={mockNavigation as any}
                route={confirmJoinRoute}
            />,
            { store, fedimint: createMockFedimintBridge() },
        )

        await waitFor(() => {
            expect(
                screen.getByText(
                    'This group is invite-only. Ask an admin to add you.',
                ),
            ).toBeOnTheScreen()
        })
        expect(screen.queryByText('Request to join')).not.toBeOnTheScreen()
    })

    it('shows pending state when room is already knocked', () => {
        const store = setupStore()

        const knockedRoom: MatrixRoom = {
            ...MOCK_MATRIX_ROOM,
            id: TEST_ROOM_ID,
            name: 'Test Room',
            roomState: 'knocked',
        }
        store.dispatch(addMatrixRoomInfo(knockedRoom))
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

        renderWithProviders(
            <ConfirmJoinPrivateGroup
                navigation={mockNavigation as any}
                route={confirmJoinRoute}
            />,
            { store, fedimint: createMockFedimintBridge() },
        )

        expect(screen.getByText('Request pending')).toBeOnTheScreen()
        expect(
            screen.getByText(
                'Your request to join this group is pending. An admin will review your request.',
            ),
        ).toBeOnTheScreen()
        expect(screen.getByText('Test Room')).toBeOnTheScreen()
    })

    it('transitions to pending after knock succeeds and room state updates', async () => {
        const store = setupStoreWithPreview(knockablePrivatePreview)

        renderWithProviders(
            <ConfirmJoinPrivateGroup
                navigation={mockNavigation as any}
                route={confirmJoinRoute}
            />,
            { store, fedimint: createMockFedimintBridge() },
        )

        await waitFor(() => {
            expect(screen.getByText('Request to join')).toBeOnTheScreen()
        })

        fireEvent.press(screen.getByText('Request to join'))

        // Wait for the mock knock to resolve
        await waitFor(() => {
            expect(mockKnockGroup).toHaveBeenCalledWith(TEST_ROOM_ID)
        })

        // Simulate the room appearing in Redux via sync with knocked state
        const knockedRoom: MatrixRoom = {
            ...MOCK_MATRIX_ROOM,
            id: TEST_ROOM_ID,
            name: 'Private Room',
            roomState: 'knocked',
        }
        store.dispatch(addMatrixRoomInfo(knockedRoom))
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

        await waitFor(() => {
            expect(screen.getByText('Request pending')).toBeOnTheScreen()
        })
        expect(screen.getByText('Private Room')).toBeOnTheScreen()
    })
})
