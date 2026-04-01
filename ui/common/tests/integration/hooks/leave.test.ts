import { act, waitFor } from '@testing-library/react'
import { t } from 'i18next'

import { useLeaveFederation } from '../../../hooks/leave'
import { selectFederations, selectLastUsedFederationId } from '../../../redux'
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

        // TODO: add tests for stable balance once stable balance *can* be tested
    })
})
