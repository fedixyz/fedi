import { act, waitFor } from '@testing-library/react'

import {
    useAmountInput,
    useMinMaxSendAmount,
    useTotalBalance,
} from '../../../hooks/amount'
import { fetchCurrencyPrices, setFederations, setupStore } from '../../../redux'
import { MSats, Sats } from '../../../types'
import { mockFederation1 } from '../../mock-data/federation'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { renderHookWithState } from '../../utils/render'

describe('common/hooks/amount', () => {
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        store = setupStore()
    })

    describe('onchain amounts below the wallet minimum', () => {
        it.each([0, 500, 2_000_000])(
            'keeps the wallet minimum with a balance of %i millisats',
            async balance => {
                store.dispatch(
                    setFederations([
                        { ...mockFederation1, balance: balance as MSats },
                    ]),
                )
                const fedimint = createMockFedimintBridge({
                    getPayAddressLimits: () =>
                        Promise.resolve({
                            minSpendable: 10_000_000 as MSats,
                            maxSpendable: balance as MSats,
                        }),
                })
                const { result } = renderHookWithState(
                    () =>
                        useMinMaxSendAmount({
                            btcAddress: { address: 'destination' },
                            federationId: mockFederation1.id,
                        }),
                    store,
                    fedimint,
                )
                await waitFor(() =>
                    expect(result.current).toEqual({
                        minimumAmount: 10_000,
                        maximumAmount: Math.floor(balance / 1000),
                    }),
                )
            },
        )

        it.each([
            [0, 'errors.invalid-amount-min', 10_000, true],
            [5_000, 'errors.invalid-amount-min', 10_000, false],
            [10_000, 'errors.invalid-amount-max', 2_000, false],
        ] as const)(
            'shows the applicable limit for %i sats when the wallet cannot afford the minimum',
            (amount, i18nKey, limit, onlyShowOnSubmit) => {
                store.dispatch({
                    type: fetchCurrencyPrices.fulfilled.type,
                    payload: { btcUsdRate: 100_000, fiatUsdRates: {} },
                })
                const { result } = renderHookWithState(
                    () =>
                        useAmountInput(
                            amount as Sats,
                            undefined,
                            10_000 as Sats,
                            2_000 as Sats,
                        ),
                    store,
                )
                expect(result.current.validation).toEqual({
                    i18nKey,
                    amount: limit,
                    fiatValue: limit / 1000,
                    onlyShowOnSubmit,
                })
            },
        )
    })

    describe('useTotalBalance', () => {
        describe('When the changeDisplayCurrency function is called', () => {
            it('should cycle through the display values correctly', async () => {
                const { result } = renderHookWithState(
                    () => useTotalBalance(),
                    store,
                )

                expect(result.current.formattedBalance).toBe('0 SATS')

                act(() => {
                    result.current.changeDisplayCurrency()
                })
                expect(result.current.formattedBalance).toBe('0.00 USD')

                act(() => {
                    result.current.changeDisplayCurrency()
                })
                expect(result.current.formattedBalance).toBe('*******')

                act(() => {
                    result.current.changeDisplayCurrency()
                })
                expect(result.current.formattedBalance).toBe('0 SATS')
            })
        })
    })
})
