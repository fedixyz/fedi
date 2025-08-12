/**
 * Tests for onboarding flow with remote bridge
 * Testing onboarding status updates and state management
 */
import { waitFor } from '@testing-library/react'

import { useIsStabilityPoolSupported } from '@fedi/common/hooks/federation'
import { useMonitorStabilityPool } from '@fedi/common/hooks/stabilitypool'
import {
    selectFederations,
    selectMatrixAuth,
    selectActiveFederation,
} from '@fedi/common/redux'

import { createIntegrationTestBuilder } from '../../utils/test-utils/remote-bridge-setup'
import { renderHookWithState } from '../test-utils/render'

describe('onboarding with remote bridge', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    it('should complete onboarding as new user and update status', async () => {
        const { store } = context

        await builder.withOnboardingCompleted()

        // Wait for matrix auth to be available and check userId starts with npub
        await waitFor(
            () => {
                const matrixAuth = selectMatrixAuth(store.getState())
                expect(matrixAuth?.userId).toBeTruthy()
                expect(matrixAuth?.userId.startsWith('@npub1')).toBe(true)
            },
            { timeout: 10000 },
        )
    }, 30000)

    it('should join a federation after onboarding', async () => {
        await builder.withFederationJoined()

        const { store } = context
        // Verify federation was joined
        await waitFor(
            () => {
                const state = store.getState()
                const federations = selectFederations(state)
                expect(federations).toHaveLength(1)
                expect(federations[0].hasWallet).toBe(true)
            },
            { timeout: 15000 },
        )
    }, 30000)

    it('should have spv2 module present after joining federation', async () => {
        await builder.withFederationJoined()

        const { remoteBridge, store } = context

        // Check if stability pool is supported
        const { result: stabilityPoolSupported } = renderHookWithState(
            () => useIsStabilityPoolSupported(),
            store,
            remoteBridge.fedimint,
        )

        // Start monitoring stability pool
        renderHookWithState(
            () => useMonitorStabilityPool(remoteBridge.fedimint),
            store,
            remoteBridge.fedimint,
        )

        await waitFor(
            () => {
                const state = store.getState()
                const federations = selectFederations(state)
                expect(federations).toHaveLength(1)

                const federation = federations[0]
                expect(federation.hasWallet).toBe(true)

                // Check that stability pool is supported
                expect(stabilityPoolSupported.current).toBe(true)
            },
            { timeout: 15000 },
        )
    }, 30000)

    it('should receive ecash', async () => {
        const amountMsats = 100000 // 100 sats

        await builder.withEcashReceived(amountMsats)

        const { store } = context
        await waitFor(
            () => {
                const state = store.getState()
                const federation = selectActiveFederation(state)
                expect(federation?.balance).toBeGreaterThan(amountMsats - 1)
            },
            { timeout: 20000 },
        )
    }, 60000)
})
