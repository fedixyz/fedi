import { act, waitFor } from '@testing-library/react'

import { useSpv2OurPaymentAddress } from '../../../hooks/stabilitypool'
import {
    setFeatureFlags,
    setFederations,
    setupStore,
    upsertFederation,
} from '../../../redux'
import { Federation } from '../../../types'
import { FeatureCatalog } from '../../../types/bindings'
import { mockFederation1 } from '../../mock-data/federation'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { renderHookWithState } from '../../utils/render'

const featureFlags = {
    sp_transfer_ui: { mode: 'Chat' },
} as FeatureCatalog

const spv2Federation = {
    ...mockFederation1,
    clientConfig: {
        global: {},
        modules: {
            stability: {
                kind: 'multi_sig_stability_pool',
            },
        },
    },
} satisfies Federation

describe('common/hooks/stabilitypool', () => {
    it('includes federation invite code unless metadata disables it', async () => {
        const store = setupStore()
        const fedimint = createMockFedimintBridge()
        fedimint.spv2OurPaymentAddress = jest
            .fn()
            .mockResolvedValueOnce('sp1withinvite')
            .mockResolvedValueOnce('sp1withoutinvite')
        fedimint.spv2StartFastSync = jest.fn().mockResolvedValue(null)

        store.dispatch(setFederations([spv2Federation]))
        store.dispatch(setFeatureFlags(featureFlags))

        const { result } = renderHookWithState(
            () => useSpv2OurPaymentAddress(spv2Federation.id),
            store,
            fedimint,
        )

        await waitFor(() => {
            expect(result.current).toBe('sp1withinvite')
            expect(fedimint.spv2OurPaymentAddress).toHaveBeenCalledWith(
                spv2Federation.id,
                true,
            )
            expect(fedimint.spv2StartFastSync).toHaveBeenCalledWith(
                spv2Federation.id,
            )
        })

        act(() => {
            store.dispatch(
                upsertFederation({
                    ...spv2Federation,
                    meta: {
                        ...spv2Federation.meta,
                        invite_codes_disabled: 'true',
                    },
                }),
            )
        })

        await waitFor(() => {
            expect(result.current).toBe('sp1withoutinvite')
            expect(fedimint.spv2OurPaymentAddress).toHaveBeenLastCalledWith(
                spv2Federation.id,
                false,
            )
        })
    })
})
