import {
    handleMatrixRoomTimelineStreamUpdates,
    selectMatrixRoomEvents,
    selectMatrixRoomRawEvents,
    selectMatrixRoomSelectableEventIds,
    setupStore,
} from '@fedi/common/redux'
import { MatrixRoom } from '@fedi/common/types'

import { createMockNonPaymentEvent } from '../../mock-data/matrix-event'

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
