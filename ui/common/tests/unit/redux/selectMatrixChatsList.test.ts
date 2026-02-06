import {
    setupStore,
    selectMatrixChatsList,
    addMatrixRoomInfo,
    handleMatrixRoomListStreamUpdates,
} from '@fedi/common/redux'
import { MatrixGroupPreview, MatrixRoom } from '@fedi/common/types'

import { MOCK_MATRIX_ROOM } from '../../mock-data/matrix'

/**
 * Helper to create a MatrixRoom with a given id, roomState, and optional recencyStamp.
 */
function makeRoom(
    id: string,
    recencyStamp: number | null,
    roomState: MatrixRoom['roomState'] = 'joined',
): MatrixRoom {
    return {
        ...MOCK_MATRIX_ROOM,
        id,
        roomState,
        recencyStamp,
    }
}

/**
 * Helper to add rooms to the store using dispatch.
 */
function addRoomsToStore(
    store: ReturnType<typeof setupStore>,
    rooms: MatrixRoom[],
) {
    // Add room info for each room
    for (const room of rooms) {
        store.dispatch(addMatrixRoomInfo(room))
    }

    // Update room list with all rooms using the correct VectorDiff format
    store.dispatch(
        handleMatrixRoomListStreamUpdates([
            {
                Append: {
                    values: rooms.map(r => ({
                        status: 'ready' as const,
                        id: r.id,
                    })),
                },
            },
        ]),
    )
}

/**
 * Helper to create a default group preview for testing.
 * Requires a non-empty timeline to be included in the chat list.
 */
function makeDefaultGroupPreview(
    id: string,
    recencyStamp: number | null,
): MatrixGroupPreview {
    return {
        info: {
            ...MOCK_MATRIX_ROOM,
            id,
            recencyStamp,
            roomState: 'joined',
        },
        timeline: [
            {
                id: `event-${id}`,
                roomId: id,
                senderId: '@user:example.com',
                timestamp: recencyStamp ?? 0,
                localEcho: false,
                sender: null,
                sendState: null,
                inReply: null,
                mentions: null,
                content: {
                    msgtype: 'm.text',
                    body: 'Hello',
                },
            } as unknown as MatrixGroupPreview['timeline'][0],
        ],
        isDefaultGroup: true,
    }
}

describe('selectMatrixChatsList', () => {
    it('places rooms with null recencyStamp at the top', () => {
        const store = setupStore()

        addRoomsToStore(store, [
            makeRoom('room-a', 100),
            makeRoom('room-new-1', null),
            makeRoom('room-b', 200),
            makeRoom('room-new-2', null),
        ])

        const result = selectMatrixChatsList(store.getState())

        // Both null-stamp rooms should come before the stamped rooms
        const nullRoomIds = result
            .slice(0, 2)
            .map(r => r.id)
            .sort()
        expect(nullRoomIds).toEqual(['room-new-1', 'room-new-2'])
        // Stamped rooms follow in descending order
        expect(result.slice(2).map(r => r.id)).toEqual(['room-b', 'room-a'])
    })

    it('excludes rooms that are not joined', () => {
        const store = setupStore()

        addRoomsToStore(store, [
            makeRoom('room-joined', 100, 'joined'),
            makeRoom('room-invited', 200, 'invited'),
            makeRoom('room-left', 300, 'left'),
        ])

        const result = selectMatrixChatsList(store.getState())

        expect(result.map(r => r.id)).toEqual(['room-joined'])
    })

    it('merges default groups with joined rooms sorted by recencyStamp', () => {
        // For groupPreviews we need to preload partial state since there's no simple action
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = setupStore({
            matrix: {
                roomList: [],
                roomPowerLevels: {},
                groupPreviews: {
                    'default-group': makeDefaultGroupPreview(
                        'default-group',
                        200,
                    ),
                },
            },
        } as any)

        addRoomsToStore(store, [
            makeRoom('user-room-old', 100),
            makeRoom('user-room-new', 300),
        ])

        const result = selectMatrixChatsList(store.getState())

        // Should be sorted: user-room-new (300), default-group (200), user-room-old (100)
        expect(result.map(r => r.id)).toEqual([
            'user-room-new',
            'default-group',
            'user-room-old',
        ])
    })
})
