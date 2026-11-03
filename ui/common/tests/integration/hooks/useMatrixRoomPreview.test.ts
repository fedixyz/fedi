import { act, waitFor } from '@testing-library/react'
import i18next from 'i18next'

import { useChatPaymentUtils } from '../../../hooks/chat'
import {
    useMatrixRoomPreview,
    useObserveMatrixRoom,
} from '../../../hooks/matrix'
import {
    ignoreUser,
    joinMatrixRoom,
    previewCommunityDefaultChats,
    selectMatrixAuth,
    selectMatrixRoom,
    selectMatrixRoomEvents,
    sendMatrixDirectMessage,
    sendMatrixMessage,
    upsertCommunity,
} from '../../../redux'
import { Community, Sats } from '../../../types'
import { RpcTimelineEventItemId } from '../../../types/bindings'
import { isTextEvent } from '../../../utils/matrix'
import { createIntegrationTestBuilder } from '../../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../../utils/render'

describe('useMatrixRoomPreview > groups', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    it('should return the body of the last text message in a room', async () => {
        await builder.withChatReady()

        const {
            store,
            bridge: { fedimint },
        } = context
        const body = 'the quick brown fox eats the lazy dog'

        // Create different types of matrix rooms
        const roomId = await builder.withChatGroupCreated('room')
        const broadcastRoomId = await builder.withChatGroupCreated(
            'public room',
            false,
            true,
        )
        const publicRoomId = await builder.withChatGroupCreated(
            'public room',
            true,
        )
        const publicBroadcastRoomId = await builder.withChatGroupCreated(
            'public broadcast room',
            true,
            true,
        )

        // Send a text message to each room
        await act(async () => {
            await store.dispatch(
                sendMatrixMessage({
                    fedimint,
                    roomId,
                    body,
                }),
            )
            await store.dispatch(
                sendMatrixMessage({
                    fedimint,
                    roomId: broadcastRoomId,
                    body,
                }),
            )
            await store.dispatch(
                sendMatrixMessage({
                    fedimint,
                    roomId: publicRoomId,
                    body,
                }),
            )
            await store.dispatch(
                sendMatrixMessage({
                    fedimint,
                    roomId: publicBroadcastRoomId,
                    body,
                }),
            )
        })

        // Get the preview text of each room
        const { result: roomResult } = renderHookWithBridge(
            () => useMatrixRoomPreview({ roomId, t: i18next.t }),
            store,
            fedimint,
        )
        const { result: publicRoomResult } = renderHookWithBridge(
            () => useMatrixRoomPreview({ roomId: publicRoomId, t: i18next.t }),
            store,
            fedimint,
        )
        const { result: broadcastRoomResult } = renderHookWithBridge(
            () =>
                useMatrixRoomPreview({ roomId: broadcastRoomId, t: i18next.t }),
            store,
            fedimint,
        )
        const { result: publicBroadcastRoomResult } = renderHookWithBridge(
            () =>
                useMatrixRoomPreview({
                    roomId: publicBroadcastRoomId,
                    t: i18next.t,
                }),
            store,
            fedimint,
        )

        await waitFor(() => {
            expect(roomResult.current.text).toEqual(body)
            expect(publicRoomResult.current.text).toEqual(body)
            expect(broadcastRoomResult.current.text).toEqual(body)
            expect(publicBroadcastRoomResult.current.text).toEqual(body)
        })
    })

    // TODO: re-enable once deleted-message previews update reliably in integration tests.
    it.skip('should return "no messages" if there are no messages in a room', async () => {
        await builder.withChatReady()

        const {
            store,
            bridge: { fedimint },
        } = context

        const roomId = await builder.withChatGroupCreated()

        await act(async () => {
            await store.dispatch(
                sendMatrixMessage({
                    fedimint,
                    roomId,
                    body: 'test',
                }),
            )
        })

        renderHookWithBridge(
            () => useObserveMatrixRoom(roomId),
            store,
            fedimint,
        )

        // Find the event ID of the last message
        const eventId = await waitFor(() => {
            const timeline = selectMatrixRoomEvents(store.getState(), roomId)
            const message = timeline.find(
                event => isTextEvent(event) && event.content.body === 'test',
            )

            expect(message).toBeDefined()
            return message?.id as RpcTimelineEventItemId
        })

        // Delete the message
        await fedimint.matrixDeleteMessage(roomId, eventId, null)

        const { result: roomResult } = renderHookWithBridge(
            () => useMatrixRoomPreview({ roomId, t: i18next.t }),
            store,
            fedimint,
        )

        await waitFor(() => {
            expect(roomResult.current.text).toEqual(
                i18next.t('feature.chat.message-deleted'),
            )
            expect(roomResult.current.isNotice).toBeTruthy()
        })
    })

    it('shoult return "no messages" if the room is empty', async () => {
        await builder.withChatReady()

        const {
            store,
            bridge: { fedimint },
        } = context

        const roomId = await builder.withChatGroupCreated()

        const { result: roomResult } = renderHookWithBridge(
            () => useMatrixRoomPreview({ roomId, t: i18next.t }),
            store,
            fedimint,
        )

        await waitFor(() => {
            expect(roomResult.current.text).toEqual(
                i18next.t('feature.chat.no-messages'),
            )
            expect(roomResult.current.isNotice).toBeTruthy()
        })
    })
})

describe('useMatrixRoomPreview > community default chats', () => {
    const adminBuilder = createIntegrationTestBuilder()
    const admin = adminBuilder.getContext()
    const memberBuilder = createIntegrationTestBuilder()
    const member = memberBuilder.getContext()

    // Puts the rooms in a community's default chats on the member's side and
    // fetches their previews the way the app does at launch.
    async function previewAsDefaultChats(roomIds: string[]) {
        const community: Community = {
            id: 'default-chats-community',
            name: 'Default chats community',
            status: 'active',
            communityInvite: {
                type: 'legacy',
                invite_code_str: 'default-chats-community',
                community_meta_url: 'https://example.com/meta.json',
            },
            meta: { default_group_chats: JSON.stringify(roomIds) },
        }
        await act(async () => {
            member.store.dispatch(upsertCommunity(community))
            await member.store
                .dispatch(
                    previewCommunityDefaultChats({
                        fedimint: member.bridge.fedimint,
                        communityId: community.id,
                    }),
                )
                .unwrap()
        })
    }

    // The admin creates a public broadcast room and a public group room and
    // posts in each, then the member previews both as default chats.
    async function setupDefaultChats() {
        await adminBuilder.withChatReady()
        await memberBuilder.withChatReady()

        const broadcastRoomId = await adminBuilder.withChatGroupCreated(
            'announcements',
            true,
            true,
        )
        const groupRoomId = await adminBuilder.withChatGroupCreated(
            'town square',
            true,
            false,
        )
        await act(async () => {
            for (const roomId of [broadcastRoomId, groupRoomId]) {
                await admin.store
                    .dispatch(
                        sendMatrixMessage({
                            fedimint: admin.bridge.fedimint,
                            roomId,
                            body: 'posted before launch',
                        }),
                    )
                    .unwrap()
            }
        })
        // Sending returns once the message is queued; wait for the homeserver
        // to echo it back before another user previews the rooms.
        await waitFor(
            () => {
                for (const roomId of [broadcastRoomId, groupRoomId]) {
                    const preview = selectMatrixRoom(
                        admin.store.getState(),
                        roomId,
                    )?.preview
                    expect(preview?.localEcho).toBe(false)
                }
            },
            { timeout: 15000 },
        )

        await previewAsDefaultChats([broadcastRoomId, groupRoomId])

        const { result: broadcast } = renderHookWithBridge(
            () =>
                useMatrixRoomPreview({ roomId: broadcastRoomId, t: i18next.t }),
            member.store,
            member.bridge.fedimint,
        )
        const { result: group } = renderHookWithBridge(
            () => useMatrixRoomPreview({ roomId: groupRoomId, t: i18next.t }),
            member.store,
            member.bridge.fedimint,
        )
        return { groupRoomId, broadcast, group }
    }

    it("reads an unjoined chat's kind from the homeserver", async () => {
        const { broadcast, group } = await setupDefaultChats()

        expect(broadcast.current.isPublicBroadcast).toBe(true)
        expect(group.current.isPublicBroadcast).toBe(false)
        expect(group.current.text).toBe('posted before launch')
    })

    it("follows a joined chat's messages posted after its preview was fetched", async () => {
        const { groupRoomId, group } = await setupDefaultChats()

        await act(async () => {
            await member.store
                .dispatch(
                    joinMatrixRoom({
                        fedimint: member.bridge.fedimint,
                        roomId: groupRoomId,
                        isPublic: true,
                    }),
                )
                .unwrap()
        })
        await waitFor(
            () =>
                expect(
                    selectMatrixRoom(member.store.getState(), groupRoomId)
                        ?.roomState,
                ).toBe('joined'),
            { timeout: 15000 },
        )

        await act(async () => {
            await admin.store
                .dispatch(
                    sendMatrixMessage({
                        fedimint: admin.bridge.fedimint,
                        roomId: groupRoomId,
                        body: 'posted after launch',
                    }),
                )
                .unwrap()
        })

        await waitFor(
            () => {
                expect(group.current.text).toBe('posted after launch')
                expect(group.current.isUnread).toBe(true)
            },
            { timeout: 15000 },
        )
    })
})

describe('useMatrixRoomPreview > direct messages', () => {
    const builder1 = createIntegrationTestBuilder()
    const alice = builder1.getContext()
    const builder2 = createIntegrationTestBuilder()
    const bob = builder2.getContext()

    it('should return the body of the last message in a DM room', async () => {
        const body = 'the quick orange cat bites the lazy fox'
        const { store: storeAlice, bridge: bridgeAlice } = alice
        await builder1.withChatReady()
        const { store: storeBob } = bob
        await builder2.withChatReady()
        const bobAuth = selectMatrixAuth(storeBob.getState())

        const { roomId } = await act(() =>
            storeAlice
                .dispatch(
                    sendMatrixDirectMessage({
                        fedimint: bridgeAlice.fedimint,
                        userId: bobAuth?.userId as string,
                        body,
                    }),
                )
                .unwrap(),
        )

        const { result } = renderHookWithBridge(
            () => useMatrixRoomPreview({ t: i18next.t, roomId: roomId }),
            storeAlice,
            bridgeAlice.fedimint,
        )

        await waitFor(() => {
            expect(result.current.text).toEqual(body)
        })
    })

    it('should return "user is blocked" if the other user in the DM room is blocked', async () => {
        const { store: storeAlice, bridge: bridgeAlice } = alice
        await builder1.withChatReady()
        const { store: storeBob } = bob
        await builder2.withChatReady()
        const bobAuth = selectMatrixAuth(storeBob.getState())

        const { roomId } = await act(() =>
            storeAlice
                .dispatch(
                    sendMatrixDirectMessage({
                        fedimint: bridgeAlice.fedimint,
                        userId: bobAuth?.userId as string,
                        body: 'test',
                    }),
                )
                .unwrap(),
        )

        await act(() =>
            storeAlice.dispatch(
                ignoreUser({
                    fedimint: bridgeAlice.fedimint,
                    userId: bobAuth?.userId as string,
                }),
            ),
        )

        const { result } = renderHookWithBridge(
            () => useMatrixRoomPreview({ t: i18next.t, roomId: roomId }),
            storeAlice,
            bridgeAlice.fedimint,
        )

        await waitFor(() => {
            expect(result.current.text).toEqual(
                i18next.t('feature.chat.user-is-blocked'),
            )
            expect(result.current.isNotice).toBeTruthy()
        })
    })

    // TODO: re-enable once DM payment previews update reliably in integration tests.
    it.skip('should return the localized payment message based on the sender/recipient direction', async () => {
        const {
            store: storeAlice,
            bridge: { fedimint: fedimintAlice },
        } = alice
        await builder1.withChatReady()
        await builder1.withEcashReceived(100000)
        const {
            store: storeBob,
            bridge: { fedimint: fedimintBob },
        } = bob
        await builder2.withChatReady()
        await builder2.withEcashReceived(100000)

        const bobId = selectMatrixAuth(storeBob.getState())?.userId ?? ''

        const { roomId } = await act(() =>
            storeAlice
                .dispatch(
                    sendMatrixDirectMessage({
                        fedimint: fedimintAlice,
                        userId: bobId,
                        body: 'test',
                    }),
                )
                .unwrap(),
        )

        const { result: payAlice } = renderHookWithBridge(
            () => useChatPaymentUtils(i18next.t, roomId, bobId),
            storeAlice,
            fedimintAlice,
        )

        const amount = 10 as Sats
        const unit = i18next.t('words.sats').toUpperCase()

        act(() => payAlice.current.setAmount(amount))

        // Alice sends a chat payment to bob
        await act(() => payAlice.current.handleSendPayment(() => {}))

        const { result: resultAlice } = renderHookWithBridge(
            () => useMatrixRoomPreview({ roomId, t: i18next.t }),
            storeAlice,
            fedimintAlice,
        )
        const { result: resultBob } = renderHookWithBridge(
            () => useMatrixRoomPreview({ roomId, t: i18next.t }),
            storeBob,
            fedimintBob,
        )

        await waitFor(() => {
            expect(resultAlice.current.text).toBe(
                i18next.t('feature.send.you-sent-amount-unit', {
                    amount,
                    unit,
                }),
            )
            expect(resultBob.current.text).toBe(
                i18next.t('feature.send.they-sent-amount-unit', {
                    amount,
                    unit,
                }),
            )
        })

        // Alice requests a payment from bob
        await act(() => payAlice.current.handleRequestPayment(() => {}))

        await waitFor(() => {
            expect(resultAlice.current.text).toBe(
                i18next.t('feature.receive.you-requested-amount-unit', {
                    amount,
                    unit,
                }),
            )
            expect(resultBob.current.text).toBe(
                i18next.t('feature.receive.they-requested-amount-unit', {
                    amount,
                    unit,
                }),
            )
        })
    })
})
