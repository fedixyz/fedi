import { act, waitFor } from '@testing-library/react'

import { useCreatedCommunities } from '../../../hooks/federation'
import { RpcCommunity } from '../../../types/bindings'
import { CommunityMeta } from '../../../types/fediInternal'
import { prepareCreateCommunityPayload } from '../../../utils/fedimods'
import { createIntegrationTestBuilder } from '../../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../../utils/render'

describe('useCreatedCommunities', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    describe('canEditCommunity', () => {
        it('should return canEditCommunity as true for a created community', async () => {
            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            const communityMeta: CommunityMeta = {
                name: 'Test Community',
            }
            const communityPayload =
                prepareCreateCommunityPayload(communityMeta)

            let createdCommunity: RpcCommunity | undefined
            await act(async () => {
                createdCommunity =
                    await fedimint.createCommunity(communityPayload)
            })

            expect(createdCommunity).toBeDefined()
            const communityId =
                createdCommunity?.communityInvite.invite_code_str

            const { result } = renderHookWithBridge(
                () => useCreatedCommunities(communityId),
                store,
                fedimint,
            )

            await waitFor(
                () => {
                    expect(result.current.canEditCommunity).toBe(true)
                    expect(
                        result.current.createdCommunities.length,
                    ).toBeGreaterThan(0)
                    expect(
                        result.current.createdCommunities.some(
                            c =>
                                c.communityInvite.invite_code_str ===
                                communityId,
                        ),
                    ).toBe(true)
                },
                { timeout: 10000 },
            )
        })

        it('should return canEditCommunity as false for a non-created community', async () => {
            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            // Use a fake invite code that doesn't exist
            const fakeInviteCode = 'fed1fake-invite-code-12345'

            const { result } = renderHookWithBridge(
                () => useCreatedCommunities(fakeInviteCode),
                store,
                fedimint,
            )

            await waitFor(
                () => {
                    expect(result.current.canEditCommunity).toBe(false)
                },
                { timeout: 10000 },
            )
        })

        it('should return canEditCommunity as false when no communityId is provided', async () => {
            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            // Create a community to ensure listCreatedCommunities returns something
            const communityMeta: CommunityMeta = {
                name: 'Test Community for undefined ID',
            }
            const communityPayload =
                prepareCreateCommunityPayload(communityMeta)

            await act(async () => {
                await fedimint.createCommunity(communityPayload)
            })

            // Render the hook without passing a communityId
            const { result } = renderHookWithBridge(
                () => useCreatedCommunities(),
                store,
                fedimint,
            )

            // Wait for the hook to fetch created communities
            await waitFor(
                () => {
                    expect(result.current.canEditCommunity).toBe(false)
                    // createdCommunities should still be populated
                    expect(
                        result.current.createdCommunities.length,
                    ).toBeGreaterThan(0)
                },
                { timeout: 10000 },
            )
        })

        it('should handle multiple created communities correctly', async () => {
            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            // Create first community
            const communityMeta1: CommunityMeta = {
                name: 'Test Community 1',
            }
            const communityPayload1 =
                prepareCreateCommunityPayload(communityMeta1)

            let createdCommunity1: RpcCommunity | undefined
            await act(async () => {
                createdCommunity1 =
                    await fedimint.createCommunity(communityPayload1)
            })

            expect(createdCommunity1).toBeDefined()
            const communityId1 =
                createdCommunity1?.communityInvite.invite_code_str

            // Create second community
            const communityMeta2: CommunityMeta = {
                name: 'Test Community 2',
            }
            const communityPayload2 =
                prepareCreateCommunityPayload(communityMeta2)

            let createdCommunity2: RpcCommunity | undefined
            await act(async () => {
                createdCommunity2 =
                    await fedimint.createCommunity(communityPayload2)
            })

            expect(createdCommunity2).toBeDefined()
            const communityId2 =
                createdCommunity2?.communityInvite.invite_code_str

            const { result: result1 } = renderHookWithBridge(
                () => useCreatedCommunities(communityId1),
                store,
                fedimint,
            )

            await waitFor(
                () => {
                    expect(result1.current.canEditCommunity).toBe(true)
                    expect(
                        result1.current.createdCommunities.length,
                    ).toBeGreaterThanOrEqual(2)
                },
                { timeout: 10000 },
            )

            const { result: result2 } = renderHookWithBridge(
                () => useCreatedCommunities(communityId2),
                store,
                fedimint,
            )

            await waitFor(
                () => {
                    expect(result2.current.canEditCommunity).toBe(true)
                    expect(
                        result2.current.createdCommunities.length,
                    ).toBeGreaterThanOrEqual(2)
                },
                { timeout: 10000 },
            )

            expect(
                result2.current.createdCommunities.some(
                    c => c.communityInvite.invite_code_str === communityId1,
                ),
            ).toBe(true)
            expect(
                result2.current.createdCommunities.some(
                    c => c.communityInvite.invite_code_str === communityId2,
                ),
            ).toBe(true)
        })
    })
})
