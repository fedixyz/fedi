import { act, waitFor } from '@testing-library/react'

import { useFederationInviteCode } from '../../../hooks/federation'
import { createIntegrationTestBuilder } from '../../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../../utils/render'

describe('parseInviteCode RPC', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    describe('useFederationInviteCode', () => {
        it('should parse invite code and return federation preview', async () => {
            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            // Get an invite code from the test federation
            const inviteCode = await context.bridge.getInviteCode()

            // Render the hook with the invite code
            const { result } = renderHookWithBridge(
                () => useFederationInviteCode(inviteCode),
                store,
                fedimint,
            )

            // Wait for the hook to finish checking
            await waitFor(
                () => {
                    expect(result.current.isChecking).toBe(false)
                },
                { timeout: 10000 },
            )

            // Verify the preview result is available
            expect(result.current.previewResult).toBeTruthy()
            expect(result.current.previewResult?.preview).toBeDefined()
            expect(result.current.previewResult?.preview.id).toBeTruthy()
            expect(result.current.previewResult?.isMember).toBe(false)
            expect(result.current.isError).toBe(false)
        })

        it('should indicate user is already a member if federation is joined', async () => {
            await builder.withFederationJoined()

            const {
                store,
                bridge: { fedimint },
            } = context

            // Get the invite code of the already-joined federation
            const inviteCode = await context.bridge.getInviteCode()

            // Render the hook with the invite code
            const { result } = renderHookWithBridge(
                () => useFederationInviteCode(inviteCode),
                store,
                fedimint,
            )

            // Wait for the hook to finish checking
            await waitFor(
                () => {
                    expect(result.current.isChecking).toBe(false)
                },
                { timeout: 10000 },
            )

            // Verify the preview result shows user is a member
            expect(result.current.previewResult).toBeTruthy()
            expect(result.current.previewResult?.isMember).toBe(true)
            expect(result.current.isError).toBe(false)
        })

        it('should handle invalid invite code gracefully', async () => {
            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            const invalidInviteCode = 'invalid-invite-code-12345'

            // Render the hook with an invalid invite code
            const { result } = renderHookWithBridge(
                () => useFederationInviteCode(invalidInviteCode),
                store,
                fedimint,
            )

            // Wait for the hook to finish checking
            await waitFor(
                () => {
                    expect(result.current.isChecking).toBe(false)
                },
                { timeout: 10000 },
            )

            // Verify error state
            expect(result.current.isError).toBe(true)
            expect(result.current.previewResult).toBeNull()
        })

        it('should allow joining federation from parsed invite code', async () => {
            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            // Get an invite code from the test federation
            const inviteCode = await context.bridge.getInviteCode()

            // Render the hook with the invite code
            const { result } = renderHookWithBridge(
                () => useFederationInviteCode(inviteCode),
                store,
                fedimint,
            )

            // Wait for the hook to finish checking
            await waitFor(
                () => {
                    expect(result.current.isChecking).toBe(false)
                },
                { timeout: 10000 },
            )

            // Verify preview is available and user is not a member
            expect(result.current.previewResult?.isMember).toBe(false)

            // Now join the federation
            await act(async () => {
                await result.current.handleJoin()
            })

            // Wait for joining to complete
            await waitFor(
                () => {
                    expect(result.current.isJoining).toBe(false)
                },
                { timeout: 15000 },
            )

            // Verify federation was joined successfully
            // The hook doesn't update isMember state, but we can verify via store
            const federations = store.getState().federation.federations
            expect(Object.keys(federations).length).toBeGreaterThan(0)
        })
    })
})
