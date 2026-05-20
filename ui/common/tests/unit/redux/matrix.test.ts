import {
    addRejectedMatrixRoom,
    addMatrixRoomInfo,
    handleMatrixRoomListStreamUpdates,
    handleMatrixRoomTimelineStreamUpdates,
    markMatrixRoomInviteSeen,
    selectMatrixHasNotifications,
    selectMatrixHasNotificationsIncludingInvites,
    selectMatrixRoomEvents,
    selectMatrixRoomInviteIsSeen,
    selectMatrixRoomRawEvents,
    selectMatrixRoomSelectableEventIds,
    setupStore,
} from '@fedi/common/redux'
import { MatrixRoom } from '@fedi/common/types'

import { MOCK_MATRIX_ROOM } from '../../mock-data/matrix'
import { createMockNonPaymentEvent } from '../../mock-data/matrix-event'

function addMatrixRoomToStore(
    store: ReturnType<typeof setupStore>,
    room: MatrixRoom,
) {
    store.dispatch(addMatrixRoomInfo(room))
    store.dispatch(
        handleMatrixRoomListStreamUpdates([
            {
                Append: {
                    values: [
                        {
                            status: 'ready' as const,
                            id: room.id,
                        },
                    ],
                },
            },
        ]),
    )
}

describe('matrix room timeline selectors', () => {
    it('preserves selected room event arrays when another room timeline updates', () => {
        const store = setupStore()
        const selectedRoomId = 'room-a' as MatrixRoom['id']
        const otherRoomId = 'room-b' as MatrixRoom['id']

        store.dispatch(
            handleMatrixRoomTimelineStreamUpdates({
                roomId: selectedRoomId,
                updates: [
                    {
                        Append: {
                            values: [
                                createMockNonPaymentEvent({
                                    roomId: selectedRoomId,
                                }),
                            ],
                        },
                    },
                ],
            }),
        )

        const events = selectMatrixRoomEvents(store.getState(), selectedRoomId)
        const rawEvents = selectMatrixRoomRawEvents(
            store.getState(),
            selectedRoomId,
        )
        const selectableEventIds = selectMatrixRoomSelectableEventIds(
            store.getState(),
            selectedRoomId,
        )

        store.dispatch(
            handleMatrixRoomTimelineStreamUpdates({
                roomId: otherRoomId,
                updates: [
                    {
                        Append: {
                            values: [
                                createMockNonPaymentEvent({
                                    roomId: otherRoomId,
                                }),
                            ],
                        },
                    },
                ],
            }),
        )

        expect(selectMatrixRoomEvents(store.getState(), selectedRoomId)).toBe(
            events,
        )
        expect(
            selectMatrixRoomRawEvents(store.getState(), selectedRoomId),
        ).toBe(rawEvents)
        expect(
            selectMatrixRoomSelectableEventIds(
                store.getState(),
                selectedRoomId,
            ),
        ).toBe(selectableEventIds)
    })
})

describe('selectMatrixHasNotifications', () => {
    it('should ignore unseen room invites', () => {
        const store = setupStore()
        const roomId = '!room:example.com'

        addMatrixRoomToStore(store, {
            ...MOCK_MATRIX_ROOM,
            id: roomId,
            roomState: 'invited',
            notificationCount: 0,
            isMarkedUnread: false,
        })

        expect(selectMatrixHasNotifications(store.getState())).toBe(false)
    })

    it('should keep Matrix unread state for joined rooms', () => {
        const store = setupStore()

        addMatrixRoomToStore(store, {
            ...MOCK_MATRIX_ROOM,
            id: '!room:example.com',
            roomState: 'joined',
            notificationCount: 1,
            isMarkedUnread: false,
        })

        expect(selectMatrixHasNotifications(store.getState())).toBe(true)
    })
})

describe('selectMatrixHasNotificationsIncludingInvites', () => {
    it('should show notifications for unseen room invites', () => {
        const store = setupStore()
        const roomId = '!room:example.com'

        addMatrixRoomToStore(store, {
            ...MOCK_MATRIX_ROOM,
            id: roomId,
            roomState: 'invited',
            notificationCount: 0,
            isMarkedUnread: false,
        })

        expect(
            selectMatrixHasNotificationsIncludingInvites(store.getState()),
        ).toBe(true)
    })

    it('should hide notifications for seen room invites', () => {
        const store = setupStore()
        const roomId = '!room:example.com'

        addMatrixRoomToStore(store, {
            ...MOCK_MATRIX_ROOM,
            id: roomId,
            roomState: 'invited',
            notificationCount: 0,
            isMarkedUnread: false,
        })
        store.dispatch(markMatrixRoomInviteSeen(roomId))

        expect(selectMatrixRoomInviteIsSeen(store.getState(), roomId)).toBe(
            true,
        )
        expect(
            selectMatrixHasNotificationsIncludingInvites(store.getState()),
        ).toBe(false)
    })

    it('should keep Matrix unread state for joined rooms', () => {
        const store = setupStore()

        addMatrixRoomToStore(store, {
            ...MOCK_MATRIX_ROOM,
            id: '!room:example.com',
            roomState: 'joined',
            notificationCount: 1,
            isMarkedUnread: false,
        })

        expect(
            selectMatrixHasNotificationsIncludingInvites(store.getState()),
        ).toBe(true)
    })

    it('should clear seen invite state when an invite becomes joined', () => {
        const store = setupStore()
        const roomId = '!room:example.com'

        addMatrixRoomToStore(store, {
            ...MOCK_MATRIX_ROOM,
            id: roomId,
            roomState: 'invited',
            notificationCount: 0,
            isMarkedUnread: false,
        })
        store.dispatch(markMatrixRoomInviteSeen(roomId))

        expect(
            selectMatrixHasNotificationsIncludingInvites(store.getState()),
        ).toBe(false)

        store.dispatch(
            addMatrixRoomInfo({
                ...MOCK_MATRIX_ROOM,
                id: roomId,
                roomState: 'joined',
                notificationCount: 0,
                isMarkedUnread: false,
            }),
        )

        expect(selectMatrixRoomInviteIsSeen(store.getState(), roomId)).toBe(
            false,
        )
        expect(
            selectMatrixHasNotificationsIncludingInvites(store.getState()),
        ).toBe(false)
    })

    it('should clear seen invite state when an invite is rejected', () => {
        const store = setupStore()
        const roomId = '!room:example.com'

        addMatrixRoomToStore(store, {
            ...MOCK_MATRIX_ROOM,
            id: roomId,
            roomState: 'invited',
            notificationCount: 0,
            isMarkedUnread: false,
        })
        store.dispatch(markMatrixRoomInviteSeen(roomId))
        store.dispatch(addRejectedMatrixRoom(roomId))

        expect(selectMatrixRoomInviteIsSeen(store.getState(), roomId)).toBe(
            false,
        )
        expect(
            selectMatrixHasNotificationsIncludingInvites(store.getState()),
        ).toBe(false)
    })
})
