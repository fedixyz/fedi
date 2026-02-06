import { act, waitFor } from '@testing-library/react'

import { useObserveMatrixRoom } from '@fedi/common/hooks/matrix'
import {
    selectMatrixChatsList,
    selectMatrixRoomEvents,
    sendMatrixMessage,
} from '@fedi/common/redux'

import { isTextEvent } from '../../utils/matrix'
import { createIntegrationTestBuilder } from '../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../utils/render'

describe('selectMatrixChatsList', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    it('sorts rooms by recent activity', async () => {
        const { store, bridge } = context
        await builder.withChatReady()

        // Create two rooms
        const roomA = await builder.withChatGroupCreated('Room A')
        const roomB = await builder.withChatGroupCreated('Room B')

        // Observe both rooms to trigger SDK updates
        renderHookWithBridge(
            () => useObserveMatrixRoom(roomA),
            store,
            bridge.fedimint,
        )
        renderHookWithBridge(
            () => useObserveMatrixRoom(roomB),
            store,
            bridge.fedimint,
        )

        // Send message to Room B to make it most recent
        const testMessage = 'making Room B most recent'
        await act(async () => {
            await store.dispatch(
                sendMatrixMessage({
                    fedimint: bridge.fedimint,
                    roomId: roomB,
                    body: testMessage,
                }),
            )
        })

        // Wait for message to appear and verify sorting
        await waitFor(() => {
            // Verify message appeared
            const events = selectMatrixRoomEvents(store.getState(), roomB)
            const messageEvent = events.find(
                e => isTextEvent(e) && e.content.body === testMessage,
            )
            expect(messageEvent).toBeDefined()

            // Verify Room B appears before Room A in chat list
            const chatsList = selectMatrixChatsList(store.getState())
            const roomAIndex = chatsList.findIndex(r => r.id === roomA)
            const roomBIndex = chatsList.findIndex(r => r.id === roomB)
            expect(roomBIndex).toBeLessThan(roomAIndex)
        })
    })
})
