import { act, waitFor } from '@testing-library/react'

import { useMessageInputState } from '@fedi/common/hooks/chat'
import { useObserveMatrixRoom } from '@fedi/common/hooks/matrix'
import {
    selectMatrixAuth,
    selectMatrixChatsList,
    selectMatrixRoomMembers,
    inviteUserToMatrixRoom,
    joinMatrixRoom,
    refetchMatrixRoomMembers,
    setMatrixRoomMemberPowerLevel,
} from '@fedi/common/redux'

import { MatrixPowerLevel } from '../../types'
import { createIntegrationTestBuilder } from '../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../utils/render'

describe('media upload permissions', () => {
    const builder1 = createIntegrationTestBuilder()
    const alice = builder1.getContext()
    const builder2 = createIntegrationTestBuilder()
    const bob = builder2.getContext()

    it('chat should show media upload buttons for all users in private rooms and only for admins & moderators in public and broadcast rooms', async () => {
        await builder1.withChatReady()
        await builder2.withChatReady()

        const { store: storeAlice, bridge: bridgeAlice } = alice
        const { store: storeBob, bridge: bridgeBob } = bob
        const authBob = selectMatrixAuth(storeBob.getState())

        // Test 1: In public rooms, only moderators and admins can upload media
        const publicRoomId = await builder1.withChatGroupCreated(
            'public-room',
            true,
        )

        await act(async () => {
            await storeBob.dispatch(
                joinMatrixRoom({
                    fedimint: bridgeBob.fedimint,
                    roomId: publicRoomId,
                    isPublic: true,
                }),
            )
        })
        await waitFor(() => {
            expect(selectMatrixChatsList(storeBob.getState())).toHaveLength(1)
        })

        renderHookWithBridge(
            () => useObserveMatrixRoom(publicRoomId),
            storeAlice,
            bridgeAlice.fedimint,
        )
        renderHookWithBridge(
            () => useObserveMatrixRoom(publicRoomId),
            storeBob,
            bridgeBob.fedimint,
        )
        await waitFor(() => {
            expect(
                selectMatrixRoomMembers(storeAlice.getState(), publicRoomId)
                    .length,
            ).toBeGreaterThanOrEqual(2)
            expect(
                selectMatrixRoomMembers(storeBob.getState(), publicRoomId)
                    .length,
            ).toBeGreaterThanOrEqual(2)
        })

        const { result: alicePublic } = renderHookWithBridge(
            () => useMessageInputState(publicRoomId),
            storeAlice,
            bridgeAlice.fedimint,
        )
        expect(alicePublic.current.shouldShowMediaButtons).toBe(true)

        const { result: bobPublicBefore } = renderHookWithBridge(
            () => useMessageInputState(publicRoomId),
            storeBob,
            bridgeBob.fedimint,
        )
        expect(bobPublicBefore.current.shouldShowMediaButtons).toBe(false)

        await act(async () => {
            await storeAlice.dispatch(
                setMatrixRoomMemberPowerLevel({
                    fedimint: bridgeAlice.fedimint,
                    roomId: publicRoomId,
                    userId: authBob?.userId as string,
                    powerLevel: MatrixPowerLevel.Moderator,
                }),
            )
        })

        // The member list is not a real observable, so need a manual refresh.
        // The power level change may not have synced to Bob's client yet,
        // so retry the refetch inside waitFor until it propagates.
        await waitFor(async () => {
            await storeBob.dispatch(
                refetchMatrixRoomMembers({
                    fedimint: bridgeBob.fedimint,
                    roomId: publicRoomId,
                }),
            )
            const bobMember = selectMatrixRoomMembers(
                storeBob.getState(),
                publicRoomId,
            ).find(m => m.id === authBob?.userId)
            expect(bobMember?.powerLevel).toEqual({
                type: 'int',
                value: MatrixPowerLevel.Moderator,
            })
        })

        const { result: bobPublicAfter } = renderHookWithBridge(
            () => useMessageInputState(publicRoomId),
            storeBob,
            bridgeBob.fedimint,
        )
        await waitFor(() => {
            expect(bobPublicAfter.current.shouldShowMediaButtons).toBe(true)
        })

        // Test 2: In private rooms, any power level can upload media
        const privateRoomId = await builder1.withChatGroupCreated(
            'private-room',
            false,
        )

        await act(async () => {
            await storeAlice.dispatch(
                inviteUserToMatrixRoom({
                    fedimint: bridgeAlice.fedimint,
                    roomId: privateRoomId,
                    userId: authBob?.userId as string,
                }),
            )
        })
        await waitFor(() => {
            expect(selectMatrixChatsList(storeBob.getState())).toHaveLength(2)
        })

        renderHookWithBridge(
            () => useObserveMatrixRoom(privateRoomId),
            storeAlice,
            bridgeAlice.fedimint,
        )
        renderHookWithBridge(
            () => useObserveMatrixRoom(privateRoomId),
            storeBob,
            bridgeBob.fedimint,
        )
        await waitFor(() => {
            expect(
                selectMatrixRoomMembers(storeBob.getState(), privateRoomId)
                    .length,
            ).toBeGreaterThanOrEqual(2)
        })

        const { result: bobPrivate } = renderHookWithBridge(
            () => useMessageInputState(privateRoomId),
            storeBob,
            bridgeBob.fedimint,
        )
        expect(bobPrivate.current.shouldShowMediaButtons).toBe(true)

        // Test 3: In broadcast public rooms, only moderators and admins can upload media
        const broadcastPublicRoomId = await builder1.withChatGroupCreated(
            'broadcast-public-room',
            true,
            true,
        )

        await act(async () => {
            await storeBob.dispatch(
                joinMatrixRoom({
                    fedimint: bridgeBob.fedimint,
                    roomId: broadcastPublicRoomId,
                    isPublic: true,
                }),
            )
        })
        await waitFor(() => {
            const chats = selectMatrixChatsList(storeBob.getState())
            expect(
                chats.find(c => c.id === broadcastPublicRoomId),
            ).toBeDefined()
        })

        renderHookWithBridge(
            () => useObserveMatrixRoom(broadcastPublicRoomId),
            storeAlice,
            bridgeAlice.fedimint,
        )
        renderHookWithBridge(
            () => useObserveMatrixRoom(broadcastPublicRoomId),
            storeBob,
            bridgeBob.fedimint,
        )
        await waitFor(() => {
            expect(
                selectMatrixRoomMembers(
                    storeAlice.getState(),
                    broadcastPublicRoomId,
                ).length,
            ).toBeGreaterThanOrEqual(2)
            expect(
                selectMatrixRoomMembers(
                    storeBob.getState(),
                    broadcastPublicRoomId,
                ).length,
            ).toBeGreaterThanOrEqual(2)
        })

        const { result: aliceBroadcastPublic } = renderHookWithBridge(
            () => useMessageInputState(broadcastPublicRoomId),
            storeAlice,
            bridgeAlice.fedimint,
        )
        expect(aliceBroadcastPublic.current.shouldShowMediaButtons).toBe(true)

        const { result: bobBroadcastPublicBefore } = renderHookWithBridge(
            () => useMessageInputState(broadcastPublicRoomId),
            storeBob,
            bridgeBob.fedimint,
        )
        expect(bobBroadcastPublicBefore.current.shouldShowMediaButtons).toBe(
            false,
        )

        await act(async () => {
            await storeAlice.dispatch(
                setMatrixRoomMemberPowerLevel({
                    fedimint: bridgeAlice.fedimint,
                    roomId: broadcastPublicRoomId,
                    userId: authBob?.userId as string,
                    powerLevel: MatrixPowerLevel.Moderator,
                }),
            )
        })

        await waitFor(async () => {
            await storeBob.dispatch(
                refetchMatrixRoomMembers({
                    fedimint: bridgeBob.fedimint,
                    roomId: broadcastPublicRoomId,
                }),
            )
            const bobMember = selectMatrixRoomMembers(
                storeBob.getState(),
                broadcastPublicRoomId,
            ).find(m => m.id === authBob?.userId)
            expect(bobMember?.powerLevel).toEqual({
                type: 'int',
                value: MatrixPowerLevel.Moderator,
            })
        })

        const { result: bobBroadcastPublicAfter } = renderHookWithBridge(
            () => useMessageInputState(broadcastPublicRoomId),
            storeBob,
            bridgeBob.fedimint,
        )
        await waitFor(() => {
            expect(bobBroadcastPublicAfter.current.shouldShowMediaButtons).toBe(
                true,
            )
        })

        // Test 4: In broadcast private rooms, only moderators and admins can upload media
        // (canUploadMedia is true since room is not public, but isReadOnly blocks regular users)
        const broadcastPrivateRoomId = await builder1.withChatGroupCreated(
            'broadcast-private-room',
            false,
            true,
        )

        await act(async () => {
            await storeAlice.dispatch(
                inviteUserToMatrixRoom({
                    fedimint: bridgeAlice.fedimint,
                    roomId: broadcastPrivateRoomId,
                    userId: authBob?.userId as string,
                }),
            )
        })
        await waitFor(() => {
            const chats = selectMatrixChatsList(storeBob.getState())
            expect(
                chats.find(c => c.id === broadcastPrivateRoomId),
            ).toBeDefined()
        })

        renderHookWithBridge(
            () => useObserveMatrixRoom(broadcastPrivateRoomId),
            storeAlice,
            bridgeAlice.fedimint,
        )
        renderHookWithBridge(
            () => useObserveMatrixRoom(broadcastPrivateRoomId),
            storeBob,
            bridgeBob.fedimint,
        )
        await waitFor(() => {
            expect(
                selectMatrixRoomMembers(
                    storeBob.getState(),
                    broadcastPrivateRoomId,
                ).length,
            ).toBeGreaterThanOrEqual(2)
        })

        const { result: aliceBroadcastPrivate } = renderHookWithBridge(
            () => useMessageInputState(broadcastPrivateRoomId),
            storeAlice,
            bridgeAlice.fedimint,
        )
        expect(aliceBroadcastPrivate.current.shouldShowMediaButtons).toBe(true)

        const { result: bobBroadcastPrivateBefore } = renderHookWithBridge(
            () => useMessageInputState(broadcastPrivateRoomId),
            storeBob,
            bridgeBob.fedimint,
        )
        expect(bobBroadcastPrivateBefore.current.shouldShowMediaButtons).toBe(
            false,
        )

        await act(async () => {
            await storeAlice.dispatch(
                setMatrixRoomMemberPowerLevel({
                    fedimint: bridgeAlice.fedimint,
                    roomId: broadcastPrivateRoomId,
                    userId: authBob?.userId as string,
                    powerLevel: MatrixPowerLevel.Moderator,
                }),
            )
        })

        await waitFor(async () => {
            await storeBob.dispatch(
                refetchMatrixRoomMembers({
                    fedimint: bridgeBob.fedimint,
                    roomId: broadcastPrivateRoomId,
                }),
            )
            const bobMember = selectMatrixRoomMembers(
                storeBob.getState(),
                broadcastPrivateRoomId,
            ).find(m => m.id === authBob?.userId)
            expect(bobMember?.powerLevel).toEqual({
                type: 'int',
                value: MatrixPowerLevel.Moderator,
            })
        })

        const { result: bobBroadcastPrivateAfter } = renderHookWithBridge(
            () => useMessageInputState(broadcastPrivateRoomId),
            storeBob,
            bridgeBob.fedimint,
        )
        await waitFor(() => {
            expect(
                bobBroadcastPrivateAfter.current.shouldShowMediaButtons,
            ).toBe(true)
        })
    }, 120000)
})
