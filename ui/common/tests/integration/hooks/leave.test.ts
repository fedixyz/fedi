import { act, waitFor } from '@testing-library/react'
import { t } from 'i18next'

import { useLeaveFederation } from '../../../hooks/leave'
import {
    selectFederations,
    selectLastUsedFederation,
    selectLastUsedFederationId,
    selectLoadedFederation,
} from '../../../redux'
import { LoadedFederation } from '../../../types'
import { createIntegrationTestBuilder } from '../../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../../utils/render'

describe('common/hooks/leave', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    describe('useLeaveFederation', () => {
        it('should leave a federation', async () => {
            await builder.withFederationJoined()

            const {
                store,
                bridge: { fedimint },
            } = context

            const federationId = selectLastUsedFederationId(store.getState())
            const { result } = renderHookWithBridge(
                () =>
                    useLeaveFederation({
                        t,
                        fedimint,
                        federationId,
                    }),
                store,
                fedimint,
            )

            await act(result.current.handleLeaveFederation)

            await waitFor(() => {
                const federations = selectFederations(store.getState())

                expect(federations).toHaveLength(0)
            })
        })

        it('should not let you leave the federation if your balance > 100 sats', async () => {
            await builder.withFederationJoined()

            const {
                store,
                bridge: { fedimint },
            } = context

            const federationId = selectLastUsedFederationId(store.getState())
            const federation = selectLastUsedFederation(store.getState())
            const { result } = renderHookWithBridge(
                () =>
                    useLeaveFederation({
                        t,
                        fedimint,
                        federationId,
                    }),
                store,
                fedimint,
            )

            const canLeave = result.current.validateCanLeaveFederation(
                federation as LoadedFederation,
            )

            expect(canLeave).toBeTruthy()

            await builder.withEcashReceived(1000000)

            // After ecash received, wait for balance to update then validate again
            await waitFor(() => {
                const loadedFederation = selectLoadedFederation(
                    store.getState(),
                    federationId,
                )
                expect(loadedFederation?.balance).toBeGreaterThanOrEqual(
                    1000000,
                )

                const canLeaveWithEcash =
                    result.current.validateCanLeaveFederation(
                        loadedFederation as LoadedFederation,
                    )
                expect(canLeaveWithEcash).toBeFalsy()
            })
        })

        // TODO: add tests for stable balance once stable balance *can* be tested
    })
})
