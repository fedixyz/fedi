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
    overrides: Partial<MatrixRoom> = {},
): MatrixRoom {
    return {
        ...MOCK_MATRIX_ROOM,
        id,
        roomState,
        recencyStamp,
        ...overrides,
    }
}

function makePreviewEvent(
    roomId: string,
    timestamp: number,
): NonNullable<MatrixRoom['preview']> {
    return {
        id: `event-${roomId}-${timestamp}`,
        roomId,
        senderId: '@user:example.com',
        timestamp,
        localEcho: false,
        sender: null,
        sendState: null,
        inReply: null,
        mentions: null,
        content: {
            msgtype: 'm.text',
            body: 'Hello',
        },
    } as unknown as NonNullable<MatrixRoom['preview']>
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
    previewTimestamp: number = recencyStamp ?? 0,
    timeline: MatrixGroupPreview['timeline'] = [
        makePreviewEvent(id, previewTimestamp),
    ],
): MatrixGroupPreview {
    return {
        info: {
            ...MOCK_MATRIX_ROOM,
            id,
            recencyStamp,
            roomState: 'invited',
        },
        timeline,
        isDefaultGroup: true,
    }
}

describe('selectMatrixChatsList', () => {
    it('preserves sdk room order when there are no default previews', () => {
        const store = setupStore()

        addRoomsToStore(store, [
            makeRoom('room-a', 100),
            makeRoom('room-new-1', null),
            makeRoom('room-b', 200),
            makeRoom('room-new-2', null),
        ])

        const result = selectMatrixChatsList(store.getState())

        expect(result.map(r => r.id)).toEqual([
            'room-a',
            'room-new-1',
            'room-b',
            'room-new-2',
        ])
    })

    it('includes invited rooms but excludes rooms that were left', () => {
        const store = setupStore()

        addRoomsToStore(store, [
            makeRoom('room-joined', 100, 'joined'),
            makeRoom('room-invited', 200, 'invited'),
            makeRoom('room-left', 300, 'left'),
        ])

        const result = selectMatrixChatsList(store.getState())

        expect(result.map(r => r.id)).toEqual(['room-joined', 'room-invited'])
    })

    it('merges default group previews into read rooms using preview timestamps', () => {
        // For groupPreviews we need to preload partial state since there's no simple action
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = setupStore({
            matrix: {
                roomList: [],
                roomPowerLevels: {},
                rejectedRoomInvites: [],
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

        expect(result.map(r => r.id)).toEqual([
            'default-group',
            'user-room-old',
            'user-room-new',
        ])
    })

    it('orders default group previews by preview timestamp when recencyStamp is unavailable', () => {
        // In production, public room previews come from RpcPublicRoomInfo,
        // which does not include recencyStamp.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = setupStore({
            matrix: {
                roomList: [],
                roomPowerLevels: {},
                rejectedRoomInvites: [],
                groupPreviews: {
                    'default-group': makeDefaultGroupPreview(
                        'default-group',
                        null,
                        200,
                    ),
                    'older-default-group': makeDefaultGroupPreview(
                        'older-default-group',
                        null,
                        150,
                    ),
                },
            },
        } as any)

        addRoomsToStore(store, [
            makeRoom('user-room-old', 100),
            makeRoom('user-room-new', 300),
        ])

        const result = selectMatrixChatsList(store.getState())

        expect(result.map(r => r.id)).toEqual([
            'default-group',
            'older-default-group',
            'user-room-old',
            'user-room-new',
        ])
    })

    it('inserts preview rooms before the first sdk read room without a newer preview timestamp', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = setupStore({
            matrix: {
                roomList: [],
                roomPowerLevels: {},
                rejectedRoomInvites: [],
                groupPreviews: {
                    'default-group-newer': makeDefaultGroupPreview(
                        'default-group-newer',
                        null,
                        200,
                    ),
                    'default-group-older': makeDefaultGroupPreview(
                        'default-group-older',
                        null,
                        150,
                    ),
                },
            },
        } as any)

        addRoomsToStore(store, [
            makeRoom('sdk-room-top', 500, 'joined', {
                preview: makePreviewEvent('sdk-room-top', 500),
            }),
            makeRoom('sdk-room-no-preview', 400, 'joined', {
                preview: null,
            }),
            makeRoom('sdk-room-later', 1000, 'joined', {
                preview: makePreviewEvent('sdk-room-later', 1000),
            }),
        ])

        const result = selectMatrixChatsList(store.getState())

        expect(result.map(r => r.id)).toEqual([
            'sdk-room-top',
            'default-group-newer',
            'default-group-older',
            'sdk-room-no-preview',
            'sdk-room-later',
        ])
    })

    it('preserves sdk order even when unread rooms are present', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = setupStore({
            matrix: {
                roomList: [],
                roomPowerLevels: {},
                rejectedRoomInvites: [],
                groupPreviews: {
                    'default-group': makeDefaultGroupPreview(
                        'default-group',
                        null,
                        200,
                    ),
                },
            },
        } as any)

        addRoomsToStore(store, [
            makeRoom('unread-room-first', 100, 'joined', {
                notificationCount: 1,
            }),
            makeRoom('unread-room', 100, 'joined', {
                notificationCount: 1,
            }),
            makeRoom('marked-unread-room', 50, 'joined', {
                isMarkedUnread: true,
            }),
            makeRoom('read-room-new', 300),
        ])

        const result = selectMatrixChatsList(store.getState())

        expect(result.map(r => r.id)).toEqual([
            'default-group',
            'unread-room-first',
            'unread-room',
            'marked-unread-room',
            'read-room-new',
        ])
    })

    it('keeps unread invited rooms in sdk order when merging previews', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = setupStore({
            matrix: {
                roomList: [],
                roomPowerLevels: {},
                rejectedRoomInvites: [],
                groupPreviews: {
                    'default-group': makeDefaultGroupPreview(
                        'default-group',
                        null,
                        200,
                    ),
                },
            },
        } as any)

        addRoomsToStore(store, [
            makeRoom('invited-unread-room', 500, 'invited', {
                notificationCount: 1,
            }),
            makeRoom('read-room', 300),
        ])

        const result = selectMatrixChatsList(store.getState())

        expect(result.map(r => r.id)).toEqual([
            'default-group',
            'invited-unread-room',
            'read-room',
        ])
    })

    it('excludes default previews for rooms that are already joined', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = setupStore({
            matrix: {
                roomList: [],
                roomPowerLevels: {},
                rejectedRoomInvites: [],
                groupPreviews: {
                    'joined-default-group': makeDefaultGroupPreview(
                        'joined-default-group',
                        null,
                        500,
                    ),
                },
            },
        } as any)

        addRoomsToStore(store, [
            makeRoom('joined-default-group', 100, 'joined', {
                preview: makePreviewEvent('joined-default-group', 100),
            }),
            makeRoom('other-room', 50, 'joined', {
                preview: makePreviewEvent('other-room', 50),
            }),
        ])

        const result = selectMatrixChatsList(store.getState())

        expect(result.map(r => r.id)).toEqual([
            'joined-default-group',
            'other-room',
        ])
    })

    it('excludes default previews with empty timelines', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = setupStore({
            matrix: {
                roomList: [],
                roomPowerLevels: {},
                rejectedRoomInvites: [],
                groupPreviews: {
                    'empty-default-group': makeDefaultGroupPreview(
                        'empty-default-group',
                        null,
                        0,
                        [],
                    ),
                },
            },
        } as any)

        addRoomsToStore(store, [makeRoom('sdk-room', 100)])

        const result = selectMatrixChatsList(store.getState())

        expect(result.map(r => r.id)).toEqual(['sdk-room'])
    })

    it('places all default previews at the top when they are newer than every sdk room preview', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = setupStore({
            matrix: {
                roomList: [],
                roomPowerLevels: {},
                rejectedRoomInvites: [],
                groupPreviews: {
                    'preview-top-1': makeDefaultGroupPreview(
                        'preview-top-1',
                        null,
                        900,
                    ),
                    'preview-top-2': makeDefaultGroupPreview(
                        'preview-top-2',
                        null,
                        800,
                    ),
                },
            },
        } as any)

        addRoomsToStore(store, [
            makeRoom('sdk-room-1', 100, 'joined', {
                preview: makePreviewEvent('sdk-room-1', 100),
            }),
            makeRoom('sdk-room-2', 50, 'joined', {
                preview: makePreviewEvent('sdk-room-2', 50),
            }),
        ])

        const result = selectMatrixChatsList(store.getState())

        expect(result.map(r => r.id)).toEqual([
            'preview-top-1',
            'preview-top-2',
            'sdk-room-1',
            'sdk-room-2',
        ])
    })

    it('places all default previews at the bottom when they are older than every sdk room preview', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = setupStore({
            matrix: {
                roomList: [],
                roomPowerLevels: {},
                rejectedRoomInvites: [],
                groupPreviews: {
                    'preview-bottom-1': makeDefaultGroupPreview(
                        'preview-bottom-1',
                        null,
                        20,
                    ),
                    'preview-bottom-2': makeDefaultGroupPreview(
                        'preview-bottom-2',
                        null,
                        10,
                    ),
                },
            },
        } as any)

        addRoomsToStore(store, [
            makeRoom('sdk-room-1', 300, 'joined', {
                preview: makePreviewEvent('sdk-room-1', 300),
            }),
            makeRoom('sdk-room-2', 200, 'joined', {
                preview: makePreviewEvent('sdk-room-2', 200),
            }),
        ])

        const result = selectMatrixChatsList(store.getState())

        expect(result.map(r => r.id)).toEqual([
            'sdk-room-1',
            'sdk-room-2',
            'preview-bottom-1',
            'preview-bottom-2',
        ])
    })

    it('keeps joined and invited rooms in sdk order while excluding left rooms in mixed lists', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = setupStore({
            matrix: {
                roomList: [],
                roomPowerLevels: {},
                rejectedRoomInvites: [],
                groupPreviews: {
                    'default-group': makeDefaultGroupPreview(
                        'default-group',
                        null,
                        250,
                    ),
                },
            },
        } as any)

        addRoomsToStore(store, [
            makeRoom('joined-room', 300, 'joined', {
                preview: makePreviewEvent('joined-room', 300),
            }),
            makeRoom('invited-room', 200, 'invited', {
                preview: makePreviewEvent('invited-room', 200),
            }),
            makeRoom('left-room', 100, 'left', {
                preview: makePreviewEvent('left-room', 100),
            }),
            makeRoom('joined-room-2', 50, 'joined', {
                preview: makePreviewEvent('joined-room-2', 50),
            }),
        ])

        const result = selectMatrixChatsList(store.getState())

        expect(result.map(r => r.id)).toEqual([
            'joined-room',
            'default-group',
            'invited-room',
            'joined-room-2',
        ])
    })

    it('preserves sdk order when sdk rooms have identical preview timestamps', () => {
        const store = setupStore()

        addRoomsToStore(store, [
            makeRoom('sdk-room-a', 200, 'joined', {
                preview: makePreviewEvent('sdk-room-a', 100),
            }),
            makeRoom('sdk-room-b', 100, 'joined', {
                preview: makePreviewEvent('sdk-room-b', 100),
            }),
        ])

        const result = selectMatrixChatsList(store.getState())

        expect(result.map(r => r.id)).toEqual(['sdk-room-a', 'sdk-room-b'])
    })

    it('keeps default previews stable when they have identical preview timestamps', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = setupStore({
            matrix: {
                roomList: [],
                roomPowerLevels: {},
                rejectedRoomInvites: [],
                groupPreviews: {
                    'default-group-a': makeDefaultGroupPreview(
                        'default-group-a',
                        null,
                        200,
                    ),
                    'default-group-b': makeDefaultGroupPreview(
                        'default-group-b',
                        null,
                        200,
                    ),
                },
            },
        } as any)

        addRoomsToStore(store, [makeRoom('sdk-room', 100)])

        const result = selectMatrixChatsList(store.getState())

        expect(result.map(r => r.id)).toEqual([
            'default-group-a',
            'default-group-b',
            'sdk-room',
        ])
    })

    it('treats rooms without previews as insertion points for older default previews', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = setupStore({
            matrix: {
                roomList: [],
                roomPowerLevels: {},
                rejectedRoomInvites: [],
                groupPreviews: {
                    'default-group-a': makeDefaultGroupPreview(
                        'default-group-a',
                        null,
                        150,
                    ),
                    'default-group-b': makeDefaultGroupPreview(
                        'default-group-b',
                        null,
                        120,
                    ),
                },
            },
        } as any)

        addRoomsToStore(store, [
            makeRoom('sdk-room-with-preview', 300, 'joined', {
                preview: makePreviewEvent('sdk-room-with-preview', 300),
            }),
            makeRoom('sdk-room-without-preview', 200, 'joined', {
                preview: null,
            }),
            makeRoom('sdk-room-later', 100, 'joined', {
                preview: makePreviewEvent('sdk-room-later', 400),
            }),
        ])

        const result = selectMatrixChatsList(store.getState())

        expect(result.map(r => r.id)).toEqual([
            'sdk-room-with-preview',
            'default-group-a',
            'default-group-b',
            'sdk-room-without-preview',
            'sdk-room-later',
        ])
    })

    it('keeps a long mixed list consistent with sdk order and preview insertion rules', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = setupStore({
            matrix: {
                roomList: [],
                roomPowerLevels: {},
                rejectedRoomInvites: [],
                groupPreviews: {
                    'announcement-room-1': makeDefaultGroupPreview(
                        'announcement-room-1',
                        null,
                        350,
                    ),
                    'announcement-room-2': makeDefaultGroupPreview(
                        'announcement-room-2',
                        null,
                        175,
                    ),
                },
            },
        } as any)

        addRoomsToStore(store, [
            makeRoom('recent-dm', 500, 'joined', {
                preview: makePreviewEvent('recent-dm', 500),
                notificationCount: 1,
            }),
            makeRoom('invited-group', 400, 'invited', {
                preview: makePreviewEvent('invited-group', 300),
            }),
            makeRoom('read-group-no-preview', 300, 'joined', {
                preview: null,
            }),
            makeRoom('older-dm', 200, 'joined', {
                preview: makePreviewEvent('older-dm', 100),
            }),
            makeRoom('joined-public-room', 100, 'joined', {
                preview: makePreviewEvent('joined-public-room', 50),
            }),
        ])

        const result = selectMatrixChatsList(store.getState())

        expect(result.map(r => r.id)).toEqual([
            'recent-dm',
            'announcement-room-1',
            'invited-group',
            'announcement-room-2',
            'read-group-no-preview',
            'older-dm',
            'joined-public-room',
        ])
    })
})
