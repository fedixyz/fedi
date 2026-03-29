import { act, waitFor } from '@testing-library/react'

import { useRecoveryProgress } from '../../../hooks/recovery'
import {
    selectLastUsedFederationId,
    selectLoadedFederations,
} from '../../../redux'
import { setSimulateRecovery } from '../../../redux/federation'
import { createIntegrationTestBuilder } from '../../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../../utils/render'

/**
 * note that this test uses the simulate recovery dev setting as a mocking tool
 * so it doesn't test full recovery functionality end-to-end, just the display &
 * formatting of the progress according to what is in the UI state
 */
describe('useRecoveryProgress', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    it('should return recoveryInProgress false when federation is not recovering', async () => {
        await builder.withFederationJoined()

        const {
            store,
            bridge: { fedimint },
        } = context

        const federationId = selectLastUsedFederationId(store.getState()) ?? ''

        const { result } = renderHookWithBridge(
            () => useRecoveryProgress(federationId),
            store,
            fedimint,
        )

        expect(result.current.recoveryInProgress).toBe(false)
        expect(result.current.progress).toBeUndefined()
        expect(result.current.formattedPercent).toBe('')
    })

    it('should return recoveryInProgress true when simulate recovery is enabled', async () => {
        await builder.withFederationJoined()

        const {
            store,
            bridge: { fedimint },
        } = context

        const federationId = selectLastUsedFederationId(store.getState()) ?? ''

        await act(() => {
            store.dispatch(
                setSimulateRecovery({
                    federationId,
                    enabled: true,
                }),
            )
        })

        const loadedFederations = selectLoadedFederations(store.getState())
        const federation = loadedFederations.find(f => f.id === federationId)
        expect(federation?.recovering).toBe(true)

        const { result } = renderHookWithBridge(
            () => useRecoveryProgress(federationId),
            store,
            fedimint,
        )

        expect(result.current.recoveryInProgress).toBe(true)
    })

    it('should produce valid percentage progress when simulating recovery', async () => {
        await builder.withFederationJoined()

        const {
            store,
            bridge: { fedimint },
        } = context

        const federationId = selectLastUsedFederationId(store.getState()) ?? ''

        await act(() => {
            store.dispatch(
                setSimulateRecovery({
                    federationId,
                    enabled: true,
                }),
            )
        })

        const { result } = renderHookWithBridge(
            () => useRecoveryProgress(federationId),
            store,
            fedimint,
        )

        await waitFor(() => {
            expect(result.current.progress).toBeDefined()
            expect(result.current.progress).toBeGreaterThanOrEqual(0)
            expect(result.current.formattedPercent).toMatch(/^\d+%$/)
        })
    })

    it('should stop reporting recovery when simulation is disabled', async () => {
        await builder.withFederationJoined()

        const {
            store,
            bridge: { fedimint },
        } = context

        const federationId = selectLastUsedFederationId(store.getState()) ?? ''

        await act(() => {
            store.dispatch(
                setSimulateRecovery({
                    federationId,
                    enabled: true,
                }),
            )
        })

        const { result, rerender } = renderHookWithBridge(
            () => useRecoveryProgress(federationId),
            store,
            fedimint,
        )

        expect(result.current.recoveryInProgress).toBe(true)

        await act(() => {
            store.dispatch(
                setSimulateRecovery({
                    federationId,
                    enabled: false,
                }),
            )
        })

        rerender(() => useRecoveryProgress(federationId))

        await waitFor(() => {
            expect(result.current.recoveryInProgress).toBe(false)
        })
    })
})
