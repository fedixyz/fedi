import { act } from '@testing-library/react'

import { useStabilityWithdrawForm } from '../../../hooks/amount'
import {
    fetchCurrencyPrices,
    setFederations,
    setStabilityPoolState,
    setupStore,
} from '../../../redux'
import { MSats, Sats, UsdCents } from '../../../types'
import {
    mockFederationWithSPV1,
    mockFederationWithSPV2,
} from '../../mock-data/federation'
import { renderHookWithState } from '../../utils/render'

describe('useStabilityWithdrawForm', () => {
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
    })

    it('should require more than zero sats when the minimum amount is zero', () => {
        store.dispatch(setFederations([mockFederationWithSPV1]))
        store.dispatch(
            setStabilityPoolState({
                federationId: mockFederationWithSPV1.id,
                stabilityPoolState: {
                    locked: {
                        btc: 0 as MSats,
                        fiat: 100 as UsdCents,
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

        const { result } = renderHookWithState(
            () => useStabilityWithdrawForm(mockFederationWithSPV1.id),
            store,
        )

        expect(result.current.inputAmount).toBe(0)
        expect(result.current.inputAmountCents).toBe(0)
        expect(result.current.inputFiatAmount).toBe(0)
        expect(result.current.minimumAmount).toBe(0)
        expect(result.current.maximumAmount).toBe(1000)
        expect(result.current.maximumFiatAmount).toBe('1.00 USD')
        expect(result.current.submitAttempts).toBe(0)
        expect(result.current.isValidAmount).toBe(false)

        act(() => {
            result.current.setInputAmount(1 as Sats)
        })

        expect(result.current.inputAmount).toBe(1)
        expect(result.current.inputAmountCents).toBe(0)
        expect(result.current.isValidAmount).toBe(true)

        act(() => {
            result.current.setInputFiatAmount(25 as UsdCents)
        })

        expect(result.current.inputFiatAmount).toBe(25)
    })

    it('should require the minimum amount when one is configured', () => {
        store.dispatch(setFederations([mockFederationWithSPV2]))
        store.dispatch(
            setStabilityPoolState({
                federationId: mockFederationWithSPV2.id,
                stabilityPoolState: {
                    locked: {
                        btc: 0 as MSats,
                        fiat: 100 as UsdCents,
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

        const { result } = renderHookWithState(
            () => useStabilityWithdrawForm(mockFederationWithSPV2.id),
            store,
        )

        expect(result.current.minimumAmount).toBe(10)
        expect(result.current.maximumAmount).toBe(1000)

        act(() => {
            result.current.setInputAmount(9 as Sats)
        })

        expect(result.current.inputAmountCents).toBe(1)
        expect(result.current.isValidAmount).toBe(false)

        act(() => {
            result.current.setInputAmount(10 as Sats)
        })

        expect(result.current.inputAmountCents).toBe(1)
        expect(result.current.isValidAmount).toBe(true)
    })

    it('should reject amounts above the maximum and expose submit attempt state', () => {
        store.dispatch(setFederations([mockFederationWithSPV2]))
        store.dispatch(
            setStabilityPoolState({
                federationId: mockFederationWithSPV2.id,
                stabilityPoolState: {
                    locked: {
                        btc: 0 as MSats,
                        fiat: 100 as UsdCents,
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

        const { result } = renderHookWithState(
            () => useStabilityWithdrawForm(mockFederationWithSPV2.id),
            store,
        )

        act(() => {
            result.current.setInputAmount(1001 as Sats)
        })

        expect(result.current.isValidAmount).toBe(false)

        act(() => {
            result.current.setSubmitAttempts(attempts => attempts + 1)
        })

        expect(result.current.submitAttempts).toBe(1)

        act(() => {
            result.current.setInputAmount(1000 as Sats)
        })

        expect(result.current.isValidAmount).toBe(true)
    })
})
