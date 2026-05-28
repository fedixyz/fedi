import { act, waitFor } from '@testing-library/react'

import {
    useMatrixRoomPreview,
    useObserveMatrixRoom,
} from '@fedi/common/hooks/matrix'
import {
    knockMatrixRoom,
    refetchMatrixRoomMembers,
    selectActiveMatrixRoomMembers,
    selectMatrixAuth,
    selectMatrixChatsList,
    selectMatrixRoom,
    selectMatrixRoomKnockingMembers,
    selectMatrixRoomMembersByMe,
    selectMatrixRoomMembersCount,
} from '@fedi/common/redux'

import { createIntegrationTestBuilder } from '../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../utils/render'
import { createMockT } from '../utils/setup'

describe('knocking on private rooms', () => {
    const builder1 = createIntegrationTestBuilder()
    const admin = builder1.getContext()
    const builder2 = createIntegrationTestBuilder()
    const knocker = builder2.getContext()

    // Sets up a room the knocker has knocked on, with the admin observing and
    // having seen the knock membership in their members list.
    async function setupKnockedRoom() {
        await builder1.withChatReady()
        await builder2.withChatReady()

        const { store: adminStore, bridge: adminBridge } = admin
        const { store: knockerStore, bridge: knockerBridge } = knocker
        const knockerAuth = selectMatrixAuth(knockerStore.getState())

        const roomId = await builder1.withChatGroupCreated(
            'test group',
            false,
            false,
            true,
        )

        await act(async () => {
            await knockerStore.dispatch(
                knockMatrixRoom({
                    fedimint: knockerBridge.fedimint,
                    roomId,
                }),
            )
        })

        renderHookWithBridge(
            () => useObserveMatrixRoom(roomId),
            knockerStore,
            knockerBridge.fedimint,
        )
        renderHookWithBridge(
            () => useObserveMatrixRoom(roomId),
            adminStore,
            adminBridge.fedimint,
        )

        await waitFor(
            () => {
                const room = selectMatrixRoom(knockerStore.getState(), roomId)
                expect(room?.roomState).toBe('knocked')
            },
            { timeout: 15000 },
        )

        await act(async () => {
            await adminStore.dispatch(
                refetchMatrixRoomMembers({
                    fedimint: adminBridge.fedimint,
                    roomId,
                }),
            )
        })

        await waitFor(
            () => {
                const knocking = selectMatrixRoomKnockingMembers(
                    adminStore.getState(),
                    roomId,
                )
                expect(knocking[0]?.id).toBe(knockerAuth?.userId)
            },
            { timeout: 10000 },
        )

        return {
            roomId,
            adminStore,
            adminBridge,
            knockerStore,
            knockerBridge,
            knockerAuth,
        }
    }

    it('admin accepts knock; knocker becomes a joined member', async () => {
        const { roomId, adminStore, adminBridge, knockerStore, knockerAuth } =
            await setupKnockedRoom()
        const adminAuth = selectMatrixAuth(adminStore.getState())

        const memberCountBefore = selectMatrixRoomMembersCount(
            adminStore.getState(),
            roomId,
        )

        // Knocked room should appear in knocker's chat list and the preview
        // should show pending text.
        const knockerChats = selectMatrixChatsList(knockerStore.getState())
        expect(knockerChats.find(r => r.id === roomId)?.roomState).toBe(
            'knocked',
        )

        const { result: previewResult } = renderHookWithBridge(
            () =>
                useMatrixRoomPreview({
                    roomId,
                    t: createMockT(),
                }),
            knockerStore,
            adminBridge.fedimint,
        )
        expect(previewResult.current.text).toBe(
            'feature.chat.request-to-join-pending',
        )

        // Admin accepts (invites the knocker).
        await act(async () => {
            await adminBridge.fedimint.matrixRoomInviteUserById({
                roomId,
                userId: knockerAuth?.userId as string,
            })
        })

        await waitFor(
            () => {
                const room = selectMatrixRoom(knockerStore.getState(), roomId)
                expect(room?.roomState).toBe('joined')
            },
            { timeout: 15000 },
        )

        await act(async () => {
            await adminStore.dispatch(
                refetchMatrixRoomMembers({
                    fedimint: adminBridge.fedimint,
                    roomId,
                }),
            )
        })

        await waitFor(
            () => {
                const knocking = selectMatrixRoomKnockingMembers(
                    adminStore.getState(),
                    roomId,
                )
                expect(knocking).toHaveLength(0)
            },
            { timeout: 10000 },
        )

        const members = selectMatrixRoomMembersByMe(
            adminStore.getState(),
            roomId,
        )
        expect(members[0].id).toBe(adminAuth?.userId)
        expect(members.map(m => m.id)).toContain(knockerAuth?.userId)
        for (const member of members) {
            expect(member.membership).toBe('join')
        }

        expect(
            selectMatrixRoomMembersCount(adminStore.getState(), roomId),
        ).toBe(memberCountBefore + 1)

        const active = selectActiveMatrixRoomMembers(
            adminStore.getState(),
            roomId,
        )
        expect(active.find(m => m.id === knockerAuth?.userId)?.membership).toBe(
            'join',
        )
    })

    it('admin declines knock; knocker can re-knock (kick, not ban)', async () => {
        const {
            roomId,
            adminStore,
            adminBridge,
            knockerStore,
            knockerBridge,
            knockerAuth,
        } = await setupKnockedRoom()

        // Admin declines (kicks the knocker).
        await act(async () => {
            await adminBridge.fedimint.matrixRoomKickUser({
                roomId,
                userId: knockerAuth?.userId as string,
                reason: null,
            })
        })

        await waitFor(
            () => {
                const room = selectMatrixRoom(knockerStore.getState(), roomId)
                expect(!room || room.roomState === 'left').toBe(true)
            },
            { timeout: 15000 },
        )

        expect(
            selectMatrixChatsList(knockerStore.getState()).find(
                r => r.id === roomId,
            ),
        ).toBeUndefined()

        await act(async () => {
            await adminStore.dispatch(
                refetchMatrixRoomMembers({
                    fedimint: adminBridge.fedimint,
                    roomId,
                }),
            )
        })

        await waitFor(
            () => {
                expect(
                    selectMatrixRoomKnockingMembers(
                        adminStore.getState(),
                        roomId,
                    ),
                ).toHaveLength(0)
            },
            { timeout: 10000 },
        )

        // Re-knock should succeed since decline was a kick, not a ban.
        await act(async () => {
            await knockerStore.dispatch(
                knockMatrixRoom({
                    fedimint: knockerBridge.fedimint,
                    roomId,
                }),
            )
        })

        await waitFor(
            () => {
                const room = selectMatrixRoom(knockerStore.getState(), roomId)
                expect(room?.roomState).toBe('knocked')
            },
            { timeout: 15000 },
        )

        expect(
            selectMatrixChatsList(knockerStore.getState()).find(
                r => r.id === roomId,
            )?.roomState,
        ).toBe('knocked')
    })
})
