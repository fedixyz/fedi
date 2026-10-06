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

        describe.each([0, 583, 2_000])('with a maximum of %i sats', maximum => {
            it.each([0, 583, 5_836, 10_000, 100_000])(
                'should keep the minimum as non-actionable feedback for %i sats',
                amount => {
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
                                maximum as Sats,
                            ),
                        store,
                    )
                    expect(result.current.validation).toEqual({
                        i18nKey: 'errors.invalid-amount-min',
                        amount: 10_000,
                        fiatValue: 10,
                        onlyShowOnSubmit: amount === 0,
                        canUseSuggestedAmount: false,
                    })
                },
            )
        })
    })

    describe('affordable amount ranges', () => {
        it.each([
            [0, 'errors.invalid-amount-min', 294, true],
            [293, 'errors.invalid-amount-min', 294, false],
            [50_001, 'errors.invalid-amount-max', 50_000, false],
        ] as const)(
            'should keep actionable limit feedback for %i sats',
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
                            294 as Sats,
                            50_000 as Sats,
                        ),
                    store,
                )
                expect(result.current.validation).toEqual({
                    i18nKey,
                    amount: limit,
                    fiatValue: Number((limit / 1000).toFixed(2)),
                    onlyShowOnSubmit,
                    canUseSuggestedAmount: true,
                })
            },
        )

        it.each([294, 1_000, 50_000])(
            'should accept %i sats inside the range',
            amount => {
                const { result } = renderHookWithState(
                    () =>
                        useAmountInput(
                            amount as Sats,
                            undefined,
                            294 as Sats,
                            50_000 as Sats,
                        ),
                    store,
                )
                expect(result.current.validation).toBeUndefined()
            },
        )

        it('should accept an exact amount when the minimum equals the maximum', () => {
            const { result } = renderHookWithState(
                () =>
                    useAmountInput(
                        10_000 as Sats,
                        undefined,
                        10_000 as Sats,
                        10_000 as Sats,
                    ),
                store,
            )
            expect(result.current.validation).toBeUndefined()
        })
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
