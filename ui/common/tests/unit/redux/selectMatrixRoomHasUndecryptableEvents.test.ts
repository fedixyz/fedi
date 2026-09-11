import {
    handleMatrixRoomTimelineStreamUpdates,
    selectMatrixRoomHasUndecryptableEvents,
    setupStore,
} from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'

import { RpcTimelineEventItemId } from '../../../types/bindings'
import {
    createMockNonPaymentEvent,
    createMockUnableToDecryptEvent,
} from '../../mock-data/matrix-event'

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

describe('selectMatrixRoomHasUndecryptableEvents', () => {
    const roomId = '!room:example.com'

    it('should be false for a room with no observed timeline', () => {
        const store = setupStore()

        expect(
            selectMatrixRoomHasUndecryptableEvents(store.getState(), roomId),
        ).toBe(false)
    })

    it('should be false when the timeline only has decrypted events', () => {
        const store = setupStore()

        appendEvent(
            store,
            roomId,
            createMockNonPaymentEvent({
                id: '$event-1' as RpcTimelineEventItemId,
                roomId,
            }),
        )

        expect(
            selectMatrixRoomHasUndecryptableEvents(store.getState(), roomId),
        ).toBe(false)
    })

    it('should be true when the timeline holds an undecryptable event', () => {
        const store = setupStore()

        appendEvent(
            store,
            roomId,
            createMockUnableToDecryptEvent({
                id: '$utd-1' as RpcTimelineEventItemId,
                roomId,
            }),
        )

        expect(
            selectMatrixRoomHasUndecryptableEvents(store.getState(), roomId),
        ).toBe(true)
    })

    it('should stay true when decrypted events append after an undecryptable one', () => {
        const store = setupStore()

        appendEvent(
            store,
            roomId,
            createMockUnableToDecryptEvent({
                id: '$utd-1' as RpcTimelineEventItemId,
                roomId,
            }),
        )
        appendEvent(
            store,
            roomId,
            createMockNonPaymentEvent({
                id: '$event-2' as RpcTimelineEventItemId,
                roomId,
            }),
        )

        expect(
            selectMatrixRoomHasUndecryptableEvents(store.getState(), roomId),
        ).toBe(true)
    })
})
