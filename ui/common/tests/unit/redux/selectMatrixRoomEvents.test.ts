import {
    handleMatrixRoomTimelineStreamUpdates,
    selectMatrixRoomEvents,
    selectMatrixRoomRawEvents,
    selectMatrixRoomSelectableEventIds,
    setupStore,
} from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'

import { RpcTimelineEventItemId } from '../../../types/bindings'
import { createMockNonPaymentEvent } from '../../mock-data/matrix-event'

function appendEvent(
    store: ReturnType<typeof setupStore>,
    roomId: string,
    event: MatrixEvent,
) {
    store.dispatch(
        handleMatrixRoomTimelineStreamUpdates({
            roomId,
            updates: [
                {
                    Append: {
                        values: [event],
                    },
                },
            ],
        }),
    )
}

describe('selectMatrixRoomEvents', () => {
    it('should preserve selected room event identities when another room timeline updates', () => {
        const store = setupStore()
        const roomId = '!room:example.com'
        const otherRoomId = '!other-room:example.com'

        appendEvent(
            store,
            roomId,
            createMockNonPaymentEvent({
                id: '$event-1' as RpcTimelineEventItemId,
                roomId,
            }),
        )

        const events = selectMatrixRoomEvents(store.getState(), roomId)
        const rawEvents = selectMatrixRoomRawEvents(store.getState(), roomId)
        const selectableEventIds = selectMatrixRoomSelectableEventIds(
            store.getState(),
            roomId,
        )

        appendEvent(
            store,
            otherRoomId,
            createMockNonPaymentEvent({
                id: '$other-event-1' as RpcTimelineEventItemId,
                roomId: otherRoomId,
            }),
        )

        expect(selectMatrixRoomEvents(store.getState(), roomId)).toBe(events)
        expect(selectMatrixRoomRawEvents(store.getState(), roomId)).toBe(
            rawEvents,
        )
        expect(
            selectMatrixRoomSelectableEventIds(store.getState(), roomId),
        ).toBe(selectableEventIds)
    })

    it('should update selected room event identities when that room timeline updates', () => {
        const store = setupStore()
        const roomId = '!room:example.com'

        appendEvent(
            store,
            roomId,
            createMockNonPaymentEvent({
                id: '$event-1' as RpcTimelineEventItemId,
                roomId,
            }),
        )

        const events = selectMatrixRoomEvents(store.getState(), roomId)
        const rawEvents = selectMatrixRoomRawEvents(store.getState(), roomId)
        const selectableEventIds = selectMatrixRoomSelectableEventIds(
            store.getState(),
            roomId,
        )

        appendEvent(
            store,
            roomId,
            createMockNonPaymentEvent({
                id: '$event-2' as RpcTimelineEventItemId,
                roomId,
            }),
        )

        expect(selectMatrixRoomEvents(store.getState(), roomId)).not.toBe(
            events,
        )
        expect(selectMatrixRoomRawEvents(store.getState(), roomId)).not.toBe(
            rawEvents,
        )
        expect(
            selectMatrixRoomSelectableEventIds(store.getState(), roomId),
        ).not.toBe(selectableEventIds)
    })
})
