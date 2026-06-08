import { act } from '@testing-library/react'

import { useStabilityDepositForm } from '../../../hooks/amount'
import {
    fetchCurrencyPrices,
    setFederations,
    setStabilityPoolAvailableLiquidity,
    setStabilityPoolState,
    setupStore,
} from '../../../redux'
import { LoadedFederation, MSats, Sats, UsdCents } from '../../../types'
import { mockFederationWithSPV2 } from '../../mock-data/federation'
import { renderHookWithState } from '../../utils/render'

const federationWithMinDeposit: LoadedFederation = {
    ...mockFederationWithSPV2,
    clientConfig: {
        global: {},
        modules: {
            multi_sig_stability_pool: {
                kind: 'multi_sig_stability_pool',
                min_allowed_seek: 1000,
            },
        },
    },
}

describe('useStabilityDepositForm', () => {
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        store = setupStore()
        jest.clearAllMocks()

        store.dispatch({
            type: fetchCurrencyPrices.fulfilled.type,
            payload: {
                btcUsdRate: 100000,
                fiatUsdRates: {},
            },
        })
        store.dispatch(
            setStabilityPoolState({
                federationId: mockFederationWithSPV2.id,
                stabilityPoolState: {
                    locked: {
                        btc: 0 as MSats,
                        fiat: 0 as UsdCents,
                    },
                    staged: {
                        btc: 0 as MSats,
                        fiat: 0 as UsdCents,
                    },
                    idleBalance: 0 as MSats,
                    pendingUnlock: null,
                    currCycleStartPrice: 10000000,
                },
            }),
        )
        store.dispatch(
            setStabilityPoolAvailableLiquidity({
                federationId: mockFederationWithSPV2.id,
                stabilityPoolAvailableLiquidity: 3000000 as MSats,
            }),
        )
    })

    it('should require more than zero sats when the minimum amount is zero', () => {
        store.dispatch(setFederations([mockFederationWithSPV2]))

        const { result } = renderHookWithState(
            () => useStabilityDepositForm(mockFederationWithSPV2.id),
            store,
        )

        expect(result.current.inputAmount).toBe(0)
        expect(result.current.minimumAmount).toBe(0)
        expect(result.current.maximumAmount).toBe(2000)
        expect(result.current.maximumFiatAmount).toBe('2.00 USD')
        expect(result.current.submitAttempts).toBe(0)
        expect(result.current.isValidAmount).toBe(false)

        act(() => {
            result.current.setInputAmount(1 as Sats)
        })

        expect(result.current.inputAmount).toBe(1)
        expect(result.current.isValidAmount).toBe(true)
    })

    it('should require the minimum amount when one is configured', () => {
        store.dispatch(setFederations([federationWithMinDeposit]))

        const { result } = renderHookWithState(
            () => useStabilityDepositForm(federationWithMinDeposit.id),
            store,
        )

        expect(result.current.minimumAmount).toBe(1)
        expect(result.current.maximumAmount).toBe(2000)

        act(() => {
            result.current.setInputAmount(0 as Sats)
        })

        expect(result.current.isValidAmount).toBe(false)

        act(() => {
            result.current.setInputAmount(1 as Sats)
        })

        expect(result.current.isValidAmount).toBe(true)
    })

    it('should reject amounts above the maximum and expose submit attempt state', () => {
        store.dispatch(setFederations([mockFederationWithSPV2]))

        const { result } = renderHookWithState(
            () => useStabilityDepositForm(mockFederationWithSPV2.id),
            store,
        )

        act(() => {
            result.current.setInputAmount(2001 as Sats)
        })

        expect(result.current.isValidAmount).toBe(false)

        act(() => {
            result.current.setSubmitAttempts(attempts => attempts + 1)
        })

        expect(result.current.submitAttempts).toBe(1)

        act(() => {
            result.current.setInputAmount(2000 as Sats)
        })

        expect(result.current.isValidAmount).toBe(true)
    })
})
