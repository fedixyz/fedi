import { act, waitFor } from '@testing-library/react'

import {
    useSpv2OurPaymentAddress,
    useStabilityPool,
} from '../../../hooks/stabilitypool'
import {
    fetchCurrencyPrices,
    setFeatureFlags,
    setFederations,
    setStabilityPoolState,
    setupStore,
    upsertFederation,
} from '../../../redux'
import { Federation, MSats, UsdCents } from '../../../types'
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
    it('formats stable balances from common redux state', async () => {
        const store = setupStore()

        store.dispatch({
            type: fetchCurrencyPrices.fulfilled.type,
            payload: {
                btcUsdRate: 100000,
                fiatUsdRates: {},
            },
        })
        store.dispatch(
            setStabilityPoolState({
                federationId: mockFederation1.id,
                stabilityPoolState: {
                    locked: {
                        btc: 0 as MSats,
                        fiat: 12345 as UsdCents,
                    },
                    staged: {
                        btc: 0 as MSats,
                        fiat: 2500 as UsdCents,
                    },
                    idleBalance: 0 as MSats,
                    pendingUnlock: null,
                    currCycleStartPrice: 10000000,
                },
            }),
        )

        const { result } = renderHookWithState(
            () => useStabilityPool(mockFederation1.id),
            store,
        )

        expect(result.current.formattedStableBalance).toBe('123.45 USD')
        expect(result.current.formattedStableBalancePending).toBe('25.00 USD')
        expect(result.current.formattedStableBalanceSats).toBe('123,450')
    })

    it('refreshes stability pool state on demand', async () => {
        const store = setupStore()
        const fedimint = createMockFedimintBridge({
            stabilityPoolAverageFeeRate: 0,
            stabilityPoolAvailableLiquidity: 0 as MSats,
        })

        const { result } = renderHookWithState(
            () => useStabilityPool(mockFederation1.id),
            store,
            fedimint,
        )

        act(() => {
            result.current.refreshBalance()
        })

        await waitFor(() => {
            expect(fedimint.stabilityPoolAverageFeeRate).toHaveBeenCalledWith(
                mockFederation1.id,
                10,
            )
            expect(
                fedimint.stabilityPoolAvailableLiquidity,
            ).toHaveBeenCalledWith(mockFederation1.id)
        })
    })

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
