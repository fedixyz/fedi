import { MAX_CHAT_REACTION_EMOJIS } from '@fedi/common/constants/matrix'
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
    toggleMatrixReaction,
} from '@fedi/common/redux'
import { MatrixRoom } from '@fedi/common/types'
import { canAddMatrixReaction } from '@fedi/common/utils/matrix'

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

describe('toggleMatrixReaction', () => {
    it('passes reaction toggles to the Matrix client', async () => {
        const store = setupStore()
        const roomId = 'room-a' as MatrixRoom['id']
        const event = createMockNonPaymentEvent({ roomId })
        const toggleReaction = jest.fn().mockResolvedValue(true)
        const fedimint = {
            getMatrixClient: () => ({ toggleReaction }),
        } as any

        store.dispatch(
            handleMatrixRoomTimelineStreamUpdates({
                roomId,
                updates: [{ Append: { values: [event] } }],
            }),
        )

        await store
            .dispatch(
                toggleMatrixReaction({
                    fedimint,
                    roomId,
                    eventId: event.id,
                    reactionKey: '👍',
                }),
            )
            .unwrap()

        expect(toggleReaction).toHaveBeenCalledWith(roomId, event.id, '👍')
    })

    it('rejects new reaction keys once the distinct emoji limit is reached', async () => {
        const store = setupStore()
        const roomId = 'room-a' as MatrixRoom['id']
        const event = createMockNonPaymentEvent({
            roomId,
            reactions: ['👍', '😄', '🎉', '😐', '❤️', '🚀', '👀'].map(key => ({
                key,
                count: 1,
                userIds: ['@user:example.com'],
            })),
        })
        const toggleReaction = jest.fn().mockResolvedValue(true)
        const fedimint = {
            getMatrixClient: () => ({ toggleReaction }),
        } as any

        store.dispatch(
            handleMatrixRoomTimelineStreamUpdates({
                roomId,
                updates: [{ Append: { values: [event] } }],
            }),
        )
        const rawEvent = selectMatrixRoomRawEvents(store.getState(), roomId)[0]
        expect(rawEvent.reactions).toHaveLength(MAX_CHAT_REACTION_EMOJIS)
        expect(rawEvent.canReact).toBe(true)
        expect(canAddMatrixReaction(rawEvent, 'new-reaction')).toBe(false)

        const result = await store.dispatch(
            toggleMatrixReaction({
                fedimint,
                roomId,
                eventId: event.id,
                reactionKey: 'new-reaction',
            }),
        )

        expect(toggleMatrixReaction.rejected.match(result)).toBe(true)
        if (!toggleMatrixReaction.rejected.match(result)) {
            throw new Error('expected rejected toggleMatrixReaction action')
        }
        expect(result.error.message).toBe('errors.chat-reaction-limit-exceeded')
        expect(toggleReaction).not.toHaveBeenCalled()
    })

    it('lets the bridge handle non-reactable events', async () => {
        const store = setupStore()
        const roomId = 'room-a' as MatrixRoom['id']
        const event = createMockNonPaymentEvent({ roomId, canReact: false })
        const toggleReaction = jest.fn().mockResolvedValue(true)
        const fedimint = {
            getMatrixClient: () => ({ toggleReaction }),
        } as any

        store.dispatch(
            handleMatrixRoomTimelineStreamUpdates({
                roomId,
                updates: [{ Append: { values: [event] } }],
            }),
        )

        await store
            .dispatch(
                toggleMatrixReaction({
                    fedimint,
                    roomId,
                    eventId: event.id,
                    reactionKey: '👍',
                }),
            )
            .unwrap()

        expect(toggleReaction).toHaveBeenCalledWith(roomId, event.id, '👍')
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
