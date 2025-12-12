import { act, waitFor } from '@testing-library/react'

import {
    useMatrixRepliedMessage,
    useObserveMatrixRoom,
} from '@fedi/common/hooks/matrix'
import {
    selectMatrixChatsList,
    selectMatrixAuth,
    inviteUserToMatrixRoom,
    sendMatrixMessage,
    selectMatrixRoomEvents,
    sendMatrixDirectMessage,
} from '@fedi/common/redux'

import { MatrixEvent, SendableMatrixEvent } from '../../types'
import { isTextEvent } from '../../utils/matrix'
import { createIntegrationTestBuilder } from '../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../utils/render'

describe('group chat interactions between 2 users', () => {
    const builder1 = createIntegrationTestBuilder()
    const alice = builder1.getContext()
    const builder2 = createIntegrationTestBuilder()
    const bob = builder2.getContext()

    it("alice creates a group, invites bob, sends a message, and the message appears on both users' timelines", async () => {
        const { store: storeAlice, bridge: bridgeAlice } = alice
        await builder1.withChatReady()
        const { store: storeBob, bridge: bridgeBob } = bob
        await builder2.withChatReady()
        const bobAuth = selectMatrixAuth(storeBob.getState())

        // group created by alice
        const roomId = await builder1.withChatGroupCreated()

        await act(() => {
            storeAlice.dispatch(
                inviteUserToMatrixRoom({
                    fedimint: bridgeAlice.fedimint,
                    roomId: roomId,
                    userId: bobAuth?.userId as string,
                }),
            )
        })

        await waitFor(() => {
            const chatsList2 = selectMatrixChatsList(storeBob.getState())
            expect(chatsList2).toHaveLength(1)
        })

        const testMessage = 'test message'
        await act(async () => {
            await storeAlice.dispatch(
                sendMatrixMessage({
                    fedimint: bridgeAlice.fedimint,
                    roomId: roomId,
                    body: testMessage,
                }),
            )
        })

        renderHookWithBridge(
            () => useObserveMatrixRoom(roomId),
            storeAlice,
            bridgeAlice.fedimint,
        )

        await waitFor(() => {
            const roomEvents1 = selectMatrixRoomEvents(
                storeAlice.getState(),
                roomId,
            )
            const eventWithMessage = roomEvents1.find(event => {
                return isTextEvent(event) && event.content.body === testMessage
            })
            expect(eventWithMessage).toBeDefined()
        })

        renderHookWithBridge(
            () => useObserveMatrixRoom(roomId),
            storeBob,
            bridgeBob.fedimint,
        )

        await waitFor(() => {
            const roomEvents2 = selectMatrixRoomEvents(
                storeBob.getState(),
                roomId,
            )
            const eventWithMessage = roomEvents2.find(event => {
                return isTextEvent(event) && event.content.body === testMessage
            })
            expect(eventWithMessage).toBeDefined()
        })
    })
})

describe('group chat interactions among 3 users', () => {
    const builder1 = createIntegrationTestBuilder()
    const alice = builder1.getContext()
    const builder2 = createIntegrationTestBuilder()
    const bob = builder2.getContext()
    const builder3 = createIntegrationTestBuilder()
    const charlie = builder3.getContext()

    // TODO: remove skip once we know why this is flaky
    it.skip("alice creates a group, sends a message, invites bob and charlie, then sends another message. decryptable and undecryptable messages appear on bob and charlie's timelines", async () => {
        await builder1.withChatReady()
        await builder2.withChatReady()
        await builder3.withChatReady()
        const { store: storeAlice, bridge: bridgeAlice } = alice
        const { store: storeBob, bridge: bridgeBob } = bob
        const { store: storeCharlie, bridge: bridgeCharlie } = charlie
        const authAlice = selectMatrixAuth(storeAlice.getState())
        const authBob = selectMatrixAuth(storeBob.getState())
        const authCharlie = selectMatrixAuth(storeCharlie.getState())
        const roomId = await builder1.withChatGroupCreated()

        const undecryptableMessage =
            'this message CANNOT be decrypted by bob and charlie'
        await act(async () => {
            await storeAlice.dispatch(
                sendMatrixMessage({
                    fedimint: bridgeAlice.fedimint,
                    roomId: roomId,
                    body: undecryptableMessage,
                }),
            )
        })

        await act(async () => {
            await storeAlice.dispatch(
                inviteUserToMatrixRoom({
                    fedimint: bridgeAlice.fedimint,
                    roomId: roomId,
                    userId: authBob?.userId as string,
                }),
            )
            await storeAlice.dispatch(
                inviteUserToMatrixRoom({
                    fedimint: bridgeAlice.fedimint,
                    roomId: roomId,
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

        const testMessage = 'this message CAN be decrypted by bob and charlie'
        await act(async () => {
            await storeAlice.dispatch(
                sendMatrixMessage({
                    fedimint: bridgeAlice.fedimint,
                    roomId: roomId,
                    body: testMessage,
                }),
            )
        })

        // bob observes the timeline
        renderHookWithBridge(
            () => useObserveMatrixRoom(roomId),
            storeBob,
            bridgeBob.fedimint,
        )
        // charlie observes the timeline
        renderHookWithBridge(
            () => useObserveMatrixRoom(roomId),
            storeCharlie,
            bridgeCharlie.fedimint,
        )

        await waitFor(() => {
            const timelineBob = selectMatrixRoomEvents(
                storeBob.getState(),
                roomId,
            )
            const undecryptableMessageInBobTimeline = timelineBob.find(
                event => {
                    return event.content.msgtype === 'unableToDecrypt'
                },
            )
            expect(undecryptableMessageInBobTimeline).toBeDefined()
            expect(undecryptableMessageInBobTimeline?.sender).toBe(
                authAlice?.userId,
            )
            const decryptableMessageInBobTimeline = timelineBob.find(event => {
                return isTextEvent(event) && event.content.body === testMessage
            })
            expect(decryptableMessageInBobTimeline).toBeDefined()
            const timelineCharlie = selectMatrixRoomEvents(
                storeCharlie.getState(),
                roomId,
            )
            const undecryptableMessageInCharlieTimeline = timelineCharlie.find(
                event => {
                    return event.content.msgtype === 'unableToDecrypt'
                },
            )
            expect(undecryptableMessageInCharlieTimeline).toBeDefined()
            expect(undecryptableMessageInCharlieTimeline?.sender).toBe(
                authAlice?.userId,
            )
            const decryptableMessageInCharlieTimeline = timelineCharlie.find(
                event => {
                    return (
                        isTextEvent(event) && event.content.body === testMessage
                    )
                },
            )
            expect(decryptableMessageInCharlieTimeline).toBeDefined()
        })
    })

    describe('chained replies', () => {
        it("alice sends a message, bob replies, charlie replies to bob's reply", async () => {
            await builder1.withChatReady()
            await builder2.withChatReady()
            await builder3.withChatReady()
            const { store: storeAlice, bridge: bridgeAlice } = alice
            const { store: storeBob, bridge: bridgeBob } = bob
            const { store: storeCharlie, bridge: bridgeCharlie } = charlie
            const roomId = await builder1.withChatGroupCreated()
            const authAlice = selectMatrixAuth(storeAlice.getState())
            const authBob = selectMatrixAuth(storeBob.getState())
            const authCharlie = selectMatrixAuth(storeCharlie.getState())

            await act(async () => {
                await storeAlice.dispatch(
                    inviteUserToMatrixRoom({
                        fedimint: bridgeAlice.fedimint,
                        roomId: roomId,
                        userId: authBob?.userId as string,
                    }),
                )
                await storeAlice.dispatch(
                    inviteUserToMatrixRoom({
                        fedimint: bridgeAlice.fedimint,
                        roomId: roomId,
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

            const messageFromAlice = 'hello this is alice'
            await act(async () => {
                await storeAlice.dispatch(
                    sendMatrixMessage({
                        fedimint: bridgeAlice.fedimint,
                        roomId: roomId,
                        body: messageFromAlice,
                    }),
                )
            })

            renderHookWithBridge(
                () => useObserveMatrixRoom(roomId),
                storeBob,
                bridgeBob.fedimint,
            )
            let messageFromAliceEventId = ''
            await waitFor(() => {
                const timelineBob = selectMatrixRoomEvents(
                    storeBob.getState(),
                    roomId,
                )
                const messageFromAliceInBobsTimeline = timelineBob.find(
                    event => {
                        return (
                            isTextEvent(event) &&
                            event.content.body === messageFromAlice
                        )
                    },
                )
                expect(messageFromAliceInBobsTimeline).toBeDefined()
                messageFromAliceEventId =
                    messageFromAliceInBobsTimeline?.id as string
            })

            const messageFromBob = 'hello this is bob, replying to alice'
            await act(async () => {
                await storeBob.dispatch(
                    sendMatrixMessage({
                        fedimint: bridgeBob.fedimint,
                        roomId: roomId,
                        body: messageFromBob,
                        repliedEventId: messageFromAliceEventId,
                    }),
                )
            })

            let messageFromBobEventId = ''
            renderHookWithBridge(
                () => useObserveMatrixRoom(roomId),
                storeCharlie,
                bridgeCharlie.fedimint,
            )
            await waitFor(() => {
                const timelineCharlie = selectMatrixRoomEvents(
                    storeCharlie.getState(),
                    roomId,
                )
                const messageFromBobInCharlieTimeline = timelineCharlie.find(
                    event => {
                        return (
                            isTextEvent(event) &&
                            event.content.body === messageFromBob
                        )
                    },
                )
                expect(messageFromBobInCharlieTimeline).toBeDefined()
                messageFromBobEventId =
                    messageFromBobInCharlieTimeline?.id as string
            })

            const messageFromCharlie = 'hello this is charlie, replying to bob'
            await act(async () => {
                await storeCharlie.dispatch(
                    sendMatrixMessage({
                        fedimint: bridgeCharlie.fedimint,
                        roomId: roomId,
                        body: messageFromCharlie,
                        repliedEventId: messageFromBobEventId,
                    }),
                )
            })

            let messageFromCharlieInAliceTimeline: MatrixEvent | undefined
            let messageFromBobInAliceTimeline: MatrixEvent | undefined
            renderHookWithBridge(
                () => useObserveMatrixRoom(roomId),
                storeAlice,
                bridgeAlice.fedimint,
            )
            await waitFor(() => {
                const timelineAlice = selectMatrixRoomEvents(
                    storeAlice.getState(),
                    roomId,
                )
                messageFromCharlieInAliceTimeline = timelineAlice.find(
                    event => {
                        return (
                            isTextEvent(event) &&
                            event.content.body === messageFromCharlie
                        )
                    },
                )
                messageFromBobInAliceTimeline = timelineAlice.find(event => {
                    return (
                        isTextEvent(event) &&
                        event.content.body === messageFromBob
                    )
                })
                expect(messageFromCharlieInAliceTimeline).toBeDefined()
                expect(messageFromBobInAliceTimeline).toBeDefined()
            })

            const { result: resultCharlieReply } = renderHookWithBridge(
                () =>
                    useMatrixRepliedMessage(
                        messageFromCharlieInAliceTimeline as SendableMatrixEvent,
                    ),
                storeAlice,
                bridgeAlice.fedimint,
            )
            await waitFor(() => {
                const { repliedData } = resultCharlieReply.current
                expect(repliedData).toBeDefined()
                expect(repliedData?.content.body).toBe(messageFromBob)
                expect(repliedData?.sender).toBe(authBob?.userId)
            })

            const { result: resultBobReply } = renderHookWithBridge(
                () =>
                    useMatrixRepliedMessage(
                        messageFromBobInAliceTimeline as SendableMatrixEvent,
                    ),
                storeAlice,
                bridgeAlice.fedimint,
            )
            await waitFor(async () => {
                const { repliedData } = resultBobReply.current
                expect(repliedData).toBeDefined()
                expect(repliedData?.content.body).toBe(messageFromAlice)
                expect(repliedData?.sender).toBe(authAlice?.userId)
            })
        })
    })
})

describe('direct chat interactions between 2 users', () => {
    const builder1 = createIntegrationTestBuilder()
    const alice = builder1.getContext()
    const builder2 = createIntegrationTestBuilder()
    const bob = builder2.getContext()

    it("alice DMs bob, bob DMs back as a direct reply and messages should appear on both users' timelines", async () => {
        const { store: storeAlice, bridge: bridgeAlice } = alice
        await builder1.withChatReady()
        const { store: storeBob, bridge: bridgeBob } = bob
        await builder2.withChatReady()
        const aliceAuth = selectMatrixAuth(storeAlice.getState())
        const bobAuth = selectMatrixAuth(storeBob.getState())

        storeAlice.dispatch(
            sendMatrixDirectMessage({
                fedimint: bridgeAlice.fedimint,
                userId: bobAuth?.userId as string,
                body: 'hi bob this is alice',
            }),
        )

        let roomId = ''
        await waitFor(() => {
            const chatsListAlice = selectMatrixChatsList(storeAlice.getState())
            const chatsListBob = selectMatrixChatsList(storeBob.getState())
            expect(chatsListAlice).toHaveLength(1)
            expect(chatsListBob).toHaveLength(1)
            const alicesRoom = chatsListAlice[0]
            const bobsRoom = chatsListBob[0]
            expect(alicesRoom.id).toBe(bobsRoom.id)
            expect(alicesRoom.directUserId).toBe(bobAuth?.userId)
            expect(bobsRoom.directUserId).toBe(aliceAuth?.userId)
            roomId = alicesRoom.id
        })

        // observe both users' timelines
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

        // check for the message in both users' timelines
        let eventIdAlice = ''
        await waitFor(() => {
            const timelineAlice = selectMatrixRoomEvents(
                storeAlice.getState(),
                roomId,
            )
            const eventWithMessageAlice = timelineAlice.find(event => {
                return (
                    isTextEvent(event) &&
                    event.content.body === 'hi bob this is alice'
                )
            })
            expect(eventWithMessageAlice).toBeDefined()
            eventIdAlice = eventWithMessageAlice?.id as string
            const timelineBob = selectMatrixRoomEvents(
                storeBob.getState(),
                roomId,
            )
            const eventWithMessageBob = timelineBob.find(event => {
                return (
                    isTextEvent(event) &&
                    event.content.body === 'hi bob this is alice'
                )
            })
            expect(eventWithMessageBob).toBeDefined()
        })

        storeBob.dispatch(
            sendMatrixDirectMessage({
                fedimint: bridgeBob.fedimint,
                userId: aliceAuth?.userId as string,
                body: 'hi alice this is bob, replying to your message',
                repliedEventId: eventIdAlice,
            }),
        )

        await waitFor(() => {
            const timelineAlice = selectMatrixRoomEvents(
                storeAlice.getState(),
                roomId,
            )
            const bobsMessageInAlicesTimeline = timelineAlice.find(event => {
                return (
                    isTextEvent(event) &&
                    event.content.body ===
                        'hi alice this is bob, replying to your message'
                )
            })
            expect(bobsMessageInAlicesTimeline).toBeDefined()
            expect(bobsMessageInAlicesTimeline?.sender).toBe(bobAuth?.userId)
            const { result } = renderHookWithBridge(
                () =>
                    useMatrixRepliedMessage(
                        bobsMessageInAlicesTimeline as SendableMatrixEvent,
                    ),
                storeAlice,
                bridgeAlice.fedimint,
            )
            const { repliedData } = result.current
            expect(repliedData).toBeDefined()
            expect(repliedData?.content.body).toBe('hi bob this is alice')
            expect(repliedData?.sender).toBe(aliceAuth?.userId)
        })
    })
})
