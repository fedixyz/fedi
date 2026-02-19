import { act, waitFor } from '@testing-library/react'

import { useObserveMatrixRoom } from '@fedi/common/hooks/matrix'
import {
    selectMatrixAuth,
    selectMatrixChatsList,
    selectMatrixRoomEvents,
    inviteUserToMatrixRoom,
    sendMatrixMessage,
    setMatrixRoomMemberPowerLevel,
} from '@fedi/common/redux'

import { MatrixPowerLevel } from '../../types'
import { RpcTimelineEventItemId } from '../../types/bindings'
import { isDeletedEvent, isTextEvent } from '../../utils/matrix'
import { createIntegrationTestBuilder } from '../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../utils/render'

describe('message deletion', () => {
    const builder1 = createIntegrationTestBuilder()
    const alice = builder1.getContext()
    const builder2 = createIntegrationTestBuilder()
    const bob = builder2.getContext()
    const builder3 = createIntegrationTestBuilder()
    const charlie = builder3.getContext()

    it("users can delete their own messages, but only admin and moderator can delete others' messages", async () => {
        await builder1.withChatReady()
        await builder2.withChatReady()
        await builder3.withChatReady()

        const { store: storeAlice, bridge: bridgeAlice } = alice
        const { store: storeBob, bridge: bridgeBob } = bob
        const { store: storeCharlie, bridge: bridgeCharlie } = charlie

        const authBob = selectMatrixAuth(storeBob.getState())
        const authCharlie = selectMatrixAuth(storeCharlie.getState())

        const roomId = await builder1.withChatGroupCreated()

        // invite bob and charlie to the group, make bob a moderator
        await act(async () => {
            await storeAlice.dispatch(
                inviteUserToMatrixRoom({
                    fedimint: bridgeAlice.fedimint,
                    roomId,
                    userId: authBob?.userId as string,
                }),
            )
            await storeAlice.dispatch(
                inviteUserToMatrixRoom({
                    fedimint: bridgeAlice.fedimint,
                    roomId,
                    userId: authCharlie?.userId as string,
                }),
            )
        })
        await waitFor(() => {
            const chatsListBob = selectMatrixChatsList(storeBob.getState())
            const chatsListCharlie = selectMatrixChatsList(
                storeCharlie.getState(),
            )
            expect(chatsListBob).toHaveLength(1)
            expect(chatsListCharlie).toHaveLength(1)
        })
        await act(async () => {
            await storeAlice.dispatch(
                setMatrixRoomMemberPowerLevel({
                    fedimint: bridgeAlice.fedimint,
                    roomId,
                    userId: authBob?.userId as string,
                    powerLevel: MatrixPowerLevel.Moderator,
                }),
            )
        })

        // all 3 users observing their timelines and send a message from each
        renderHookWithBridge(
            () => useObserveMatrixRoom(roomId),
            storeAlice,
            bridgeAlice.fedimint,
        )
        renderHookWithBridge(
            () => useObserveMatrixRoom(roomId),
            storeBob,
            bridgeBob.fedimint,
        )
        renderHookWithBridge(
            () => useObserveMatrixRoom(roomId),
            storeCharlie,
            bridgeCharlie.fedimint,
        )

        // send messages one at a time, verifying each appears in all
        // timelines before sending the next (this pattern helps with flakiness)
        const allStores = [storeAlice, storeBob, storeCharlie]
        const sendAndVerifyInAllTimelines = async (
            store: typeof storeAlice,
            bridge: typeof bridgeAlice,
            body: string,
        ) => {
            await act(async () => {
                await store.dispatch(
                    sendMatrixMessage({
                        fedimint: bridge.fedimint,
                        roomId,
                        body,
                    }),
                )
            })
            await waitFor(() => {
                for (const s of allStores) {
                    const events = selectMatrixRoomEvents(s.getState(), roomId)
                    expect(
                        events.find(
                            e => isTextEvent(e) && e.content.body === body,
                        ),
                    ).toBeDefined()
                }
            })
        }
        const aliceMsg = 'message from alice'
        const aliceSelfMsg = 'alice self-delete test'
        const bobMsg = 'message from bob'
        const bobSelfMsg = 'bob self-delete test'
        const charlieMsg = 'message from charlie'
        const charlieSelfMsg = 'charlie self-delete test'
        const messagesToSend = [
            { store: storeAlice, bridge: bridgeAlice, body: aliceMsg },
            { store: storeAlice, bridge: bridgeAlice, body: aliceSelfMsg },
            { store: storeBob, bridge: bridgeBob, body: bobMsg },
            { store: storeBob, bridge: bridgeBob, body: bobSelfMsg },
            { store: storeCharlie, bridge: bridgeCharlie, body: charlieMsg },
            {
                store: storeCharlie,
                bridge: bridgeCharlie,
                body: charlieSelfMsg,
            },
        ]
        for (const { store, bridge, body } of messagesToSend) {
            await sendAndVerifyInAllTimelines(store, bridge, body)
        }

        // ---- Test 1: Admin (Alice) can delete Bob's message ----
        const messageFromBobInAliceTimeline = await waitFor(() => {
            const aliceRoomEvents = selectMatrixRoomEvents(
                storeAlice.getState(),
                roomId,
            )
            const msg = aliceRoomEvents.find(
                e => isTextEvent(e) && e.content.body === bobMsg,
            )
            expect(msg).toBeDefined()
            return msg?.id as RpcTimelineEventItemId
        })
        await bridgeAlice.fedimint.matrixDeleteMessage(
            roomId,
            messageFromBobInAliceTimeline,
            null,
        )

        await waitFor(() => {
            const events = selectMatrixRoomEvents(storeAlice.getState(), roomId)
            const deletedEvent = events.find(
                e =>
                    e.id === messageFromBobInAliceTimeline && isDeletedEvent(e),
            )
            expect(deletedEvent).toBeDefined()
        })

        // ---- Test 2: Moderator (Bob) can delete Charlie's message ----
        const messageFromCharlieInBobTimeline = await waitFor(() => {
            const bobRoomEvents = selectMatrixRoomEvents(
                storeBob.getState(),
                roomId,
            )
            const msg = bobRoomEvents.find(
                e => isTextEvent(e) && e.content.body === charlieMsg,
            )
            expect(msg).toBeDefined()
            return msg?.id as RpcTimelineEventItemId
        })
        await bridgeBob.fedimint.matrixDeleteMessage(
            roomId,
            messageFromCharlieInBobTimeline,
            null,
        )

        await waitFor(() => {
            const events = selectMatrixRoomEvents(storeBob.getState(), roomId)
            const deletedEvent = events.find(
                e =>
                    e.id === messageFromCharlieInBobTimeline &&
                    isDeletedEvent(e),
            )
            expect(deletedEvent).toBeDefined()
        })

        // ---- Test 3: Regular member (Charlie) cannot delete Alice's message ----
        const messageFromAliceInCharlieTimeline = await waitFor(() => {
            const charlieRoomEvents = selectMatrixRoomEvents(
                storeCharlie.getState(),
                roomId,
            )
            const msg = charlieRoomEvents.find(
                e => isTextEvent(e) && e.content.body === aliceMsg,
            )
            expect(msg).toBeDefined()
            return msg?.id as RpcTimelineEventItemId
        })
        await expect(
            bridgeCharlie.fedimint.matrixDeleteMessage(
                roomId,
                messageFromAliceInCharlieTimeline,
                null,
            ),
        ).rejects.toThrow()

        // ---- Test 4: All users can delete their own messages ----
        const aliceSelfMsgEventId = await waitFor(() => {
            const events = selectMatrixRoomEvents(storeAlice.getState(), roomId)
            const msg = events.find(
                e => isTextEvent(e) && e.content.body === aliceSelfMsg,
            )
            expect(msg).toBeDefined()
            return msg?.id as RpcTimelineEventItemId
        })
        await bridgeAlice.fedimint.matrixDeleteMessage(
            roomId,
            aliceSelfMsgEventId,
            null,
        )
        const bobSelfMsgEventId = await waitFor(() => {
            const events = selectMatrixRoomEvents(storeBob.getState(), roomId)
            const msg = events.find(
                e => isTextEvent(e) && e.content.body === bobSelfMsg,
            )
            expect(msg).toBeDefined()
            return msg?.id as RpcTimelineEventItemId
        })
        await bridgeBob.fedimint.matrixDeleteMessage(
            roomId,
            bobSelfMsgEventId,
            null,
        )
        const charlieSelfMsgEventId = await waitFor(() => {
            const events = selectMatrixRoomEvents(
                storeCharlie.getState(),
                roomId,
            )
            const msg = events.find(
                e => isTextEvent(e) && e.content.body === charlieSelfMsg,
            )
            expect(msg).toBeDefined()
            return msg?.id as RpcTimelineEventItemId
        })
        await bridgeCharlie.fedimint.matrixDeleteMessage(
            roomId,
            charlieSelfMsgEventId,
            null,
        )
    }, 120000)
})
