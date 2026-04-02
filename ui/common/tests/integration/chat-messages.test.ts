import { act, waitFor } from '@testing-library/react'

import {
    usePinMessage,
    useMatrixRepliedMessage,
    useObserveMatrixRoom,
} from '@fedi/common/hooks/matrix'
import {
    selectMatrixChatsList,
    selectMatrixAuth,
    inviteUserToMatrixRoom,
    sendMatrixMessage,
    selectMatrixRoomPinnedEventIds,
    selectMatrixRoomPinnedEvents,
    selectMatrixRoomPowerLevels,
    selectMatrixRoomEvents,
    selectMatrixRoomSelectableEventIds,
    selectMatrixRoomSelfPowerLevel,
    sendMatrixDirectMessage,
    joinMatrixRoom,
} from '@fedi/common/redux'

import { MatrixEvent, MatrixRoom, SendableMatrixEvent } from '../../types'
import { isTextEvent } from '../../utils/matrix'
import { createIntegrationTestBuilder } from '../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../utils/render'
import { createMockT } from '../utils/setup'

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

    it('alice pins and unpins a room message, and both users converge on the same pinned state', async () => {
        const { store: storeAlice, bridge: bridgeAlice } = alice
        await builder1.withChatReady()
        const { store: storeBob, bridge: bridgeBob } = bob
        await builder2.withChatReady()
        const bobAuth = selectMatrixAuth(storeBob.getState())
        const t = createMockT()

        const roomId = await builder1.withChatGroupCreated()

        await act(() => {
            storeAlice.dispatch(
                inviteUserToMatrixRoom({
                    fedimint: bridgeAlice.fedimint,
                    roomId,
                    userId: bobAuth?.userId as string,
                }),
            )
        })

        await waitFor(() => {
            const chatsListBob = selectMatrixChatsList(storeBob.getState())
            expect(chatsListBob).toHaveLength(1)
        })

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

        const testMessage = 'message that gets pinned'
        await act(async () => {
            await storeAlice.dispatch(
                sendMatrixMessage({
                    fedimint: bridgeAlice.fedimint,
                    roomId,
                    body: testMessage,
                }),
            )
        })

        let visibleEventId = ''
        await waitFor(() => {
            const roomEventsAlice = selectMatrixRoomEvents(
                storeAlice.getState(),
                roomId,
            )
            const visibleEventAlice = roomEventsAlice.find(event => {
                return (
                    isTextEvent(event) &&
                    event.content.body === testMessage &&
                    !event.localEcho &&
                    event.sendState === null
                )
            })

            expect(visibleEventAlice).toBeDefined()
            visibleEventId = visibleEventAlice?.id as string
        })

        await waitFor(() => {
            const roomEventsBob = selectMatrixRoomEvents(
                storeBob.getState(),
                roomId,
            )
            const visibleEventBob = roomEventsBob.find(event => {
                return (
                    isTextEvent(event) &&
                    event.content.body === testMessage &&
                    !event.localEcho &&
                    event.sendState === null
                )
            })

            expect(visibleEventBob).toBeDefined()
            expect(visibleEventBob?.id).toBe(visibleEventId)
        })

        await waitFor(() => {
            expect(
                selectMatrixRoomPowerLevels(storeAlice.getState(), roomId),
            ).toBeDefined()
            expect(
                selectMatrixRoomSelfPowerLevel(storeAlice.getState(), roomId),
            ).toBeDefined()
            expect(
                selectMatrixRoomSelectableEventIds(
                    storeAlice.getState(),
                    roomId,
                ),
            ).toContain(visibleEventId)
        })

        const { result } = renderHookWithBridge(
            () =>
                usePinMessage({
                    t,
                    roomId,
                    eventId: visibleEventId,
                }),
            storeAlice,
            bridgeAlice.fedimint,
        )

        await waitFor(() => {
            expect(result.current.canPin).toBe(true)
        })

        await act(async () => {
            await result.current.pinMessage()
        })

        await waitFor(() => {
            expect(
                selectMatrixRoomPinnedEventIds(storeAlice.getState(), roomId),
            ).toEqual([visibleEventId])
            expect(
                selectMatrixRoomPinnedEventIds(storeBob.getState(), roomId),
            ).toEqual([visibleEventId])
        })

        const pinnedEventAlice = selectMatrixRoomPinnedEvents(
            storeAlice.getState(),
            roomId,
        )[0]
        const pinnedEventBob = selectMatrixRoomPinnedEvents(
            storeBob.getState(),
            roomId,
        )[0]

        expect(isTextEvent(pinnedEventAlice)).toBe(true)
        expect(isTextEvent(pinnedEventBob)).toBe(true)
        expect(
            isTextEvent(pinnedEventAlice)
                ? pinnedEventAlice.content.body
                : null,
        ).toBe(testMessage)
        expect(
            isTextEvent(pinnedEventBob) ? pinnedEventBob.content.body : null,
        ).toBe(testMessage)

        await waitFor(() => {
            expect(result.current.isPinned).toBe(true)
        })

        await act(async () => {
            await result.current.unpinMessage()
        })

        await waitFor(() => {
            expect(
                selectMatrixRoomPinnedEventIds(storeAlice.getState(), roomId),
            ).toEqual([])
            expect(
                selectMatrixRoomPinnedEventIds(storeBob.getState(), roomId),
            ).toEqual([])
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
            expect(alicesRoom.isDirect).toBe(true)
            expect(bobsRoom.isDirect).toBe(true)
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

        // bob joins the room by accepting the connection request
        await act(async () => {
            await storeBob.dispatch(
                joinMatrixRoom({
                    fedimint: bridgeBob.fedimint,
                    roomId,
                }),
            )
        })

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

describe('direct message connection request state', () => {
    const builder1 = createIntegrationTestBuilder()
    const alice = builder1.getContext()
    const builder2 = createIntegrationTestBuilder()
    const bob = builder2.getContext()

    it("when alice DMs bob, bob's chat list contains the room in an invited state", async () => {
        const { store: storeAlice, bridge: bridgeAlice } = alice
        await builder1.withChatReady()
        const { store: storeBob, bridge: bridgeBob } = bob
        await builder2.withChatReady()
        const bobAuth = selectMatrixAuth(storeBob.getState())

        storeAlice.dispatch(
            sendMatrixDirectMessage({
                fedimint: bridgeAlice.fedimint,
                userId: bobAuth?.userId as string,
                body: 'hey bob',
            }),
        )

        let invitedRoom: MatrixRoom | undefined
        await waitFor(() => {
            const chatsListBob = selectMatrixChatsList(storeBob.getState())
            invitedRoom = chatsListBob.find(r => r.roomState === 'invited')
            expect(invitedRoom).toBeDefined()
        })

        expect(invitedRoom?.isDirect).toBe(true)

        const invitedRoomId = invitedRoom?.id as string

        // observe both users' timelines
        renderHookWithBridge(
            () => useObserveMatrixRoom(invitedRoomId),
            storeAlice,
            bridgeAlice.fedimint,
        )
        renderHookWithBridge(
            () => useObserveMatrixRoom(invitedRoomId),
            storeBob,
            bridgeBob.fedimint,
        )

        // bob accepts the invitation
        await act(async () => {
            await storeBob.dispatch(
                joinMatrixRoom({
                    fedimint: bridgeBob.fedimint,
                    roomId: invitedRoomId,
                }),
            )
        })

        await waitFor(() => {
            const chatsListBob = selectMatrixChatsList(storeBob.getState())
            const joinedRoom = chatsListBob.find(
                r => r.id === invitedRoomId && r.roomState === 'joined',
            )
            expect(joinedRoom).toBeDefined()
        })
    })
})
