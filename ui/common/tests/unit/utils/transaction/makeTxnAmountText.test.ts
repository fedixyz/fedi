import { act } from '@testing-library/react'

import { setupStore, fetchCurrencyPrices } from '@fedi/common/redux'

import { useAmountFormatter, useBtcFiatPrice } from '../../../../hooks/amount'
import { MSats, SupportedCurrency } from '../../../../types'
import { makeTxnAmountText } from '../../../../utils/transaction'
import { renderHookWithState } from '../../../utils/render'
import { makeTestTxnEntry } from '../../../utils/transaction'

describe('makeTxnAmountText', () => {
    const store = setupStore()

    let makeFormattedAmountsFromMSats: ReturnType<
        typeof useAmountFormatter
    >['makeFormattedAmountsFromMSats']
    let convertCentsToFormattedFiat: ReturnType<
        typeof useBtcFiatPrice
    >['convertCentsToFormattedFiat']
    let convertSatsToFormattedFiat: ReturnType<
        typeof useBtcFiatPrice
    >['convertSatsToFormattedFiat']

    beforeEach(() => {
        jest.clearAllMocks()

        act(() => {
            store.dispatch({
                type: fetchCurrencyPrices.fulfilled.type,
                payload: {
                    btcUsdRate: 100000,
                    fiatUsdRates: {
                        EUR: 1.1, // 1 EUR = 1.1 USD
                    },
                },
            })
        })

        const { result } = renderHookWithState(
            () => useAmountFormatter(),
            store,
        )
        const { result: btcFiatPriceResult } = renderHookWithState(
            () => useBtcFiatPrice(),
            store,
        )
        makeFormattedAmountsFromMSats =
            result.current.makeFormattedAmountsFromMSats
        convertCentsToFormattedFiat =
            btcFiatPriceResult.current.convertCentsToFormattedFiat
        convertSatsToFormattedFiat =
            btcFiatPriceResult.current.convertSatsToFormattedFiat
    })

    it('should show the correct sign for transactions of different directions', () => {
        const lnPay = makeTestTxnEntry('lnPay')
        const lnReceive = makeTestTxnEntry('lnReceive')

        const lnPayAmount = makeTxnAmountText(
            lnPay,
            'fiat',
            false,
            false,
            'USD',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
            convertSatsToFormattedFiat,
        )
        const lnReceiveAmount = makeTxnAmountText(
            lnReceive,
            'fiat',
            false,
            false,
            'USD',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
            convertSatsToFormattedFiat,
        )

        expect(lnPayAmount).toBe('-0.00')
        expect(lnReceiveAmount).toBe('+0.00')
    })

    it('should display an amount in sats and fiat', () => {
        const txn = makeTestTxnEntry('lnPay', {
            amount: 10000000 as MSats,
        })
        const amountSats = makeTxnAmountText(
            txn,
            'sats',
            false,
            false,
            'USD',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
            convertSatsToFormattedFiat,
        )
        const amountFiat = makeTxnAmountText(
            txn,
            'fiat',
            false,
            false,
            'USD',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
            convertSatsToFormattedFiat,
        )

        expect(amountSats).toBe('-10,000')
        expect(amountFiat).toBe('-10.00')
    })

    it('should flip the sign', () => {
        const txn = makeTestTxnEntry('lnPay', {
            amount: 10000000 as MSats,
        })
        const amount = makeTxnAmountText(
            txn,
            'fiat',
            false,
            false,
            'USD',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
            convertSatsToFormattedFiat,
        )
        const flipped = makeTxnAmountText(
            txn,
            'fiat',
            true,
            false,
            'USD',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
            convertSatsToFormattedFiat,
        )

        expect(amount).toBe('-10.00')
        expect(flipped).toBe('+10.00')
    })

    it('should include the currency', () => {
        const txn = makeTestTxnEntry('lnPay', {
            amount: 10000000 as MSats,
        })
        const withCurrency = makeTxnAmountText(
            txn,
            'fiat',
            false,
            true,
            'USD',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
            convertSatsToFormattedFiat,
        )
        const withoutCurrency = makeTxnAmountText(
            txn,
            'fiat',
            false,
            false,
            'USD',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
            convertSatsToFormattedFiat,
        )
        const satsWithCurrency = makeTxnAmountText(
            txn,
            'sats',
            false,
            true,
            'USD',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
            convertSatsToFormattedFiat,
        )

        expect(withCurrency).toBe('-10.00 USD')
        expect(withoutCurrency).toBe('-10.00')
        expect(satsWithCurrency).toBe('-10,000 SATS')
    })

    it("should display the amount in the user's preferred currency", () => {
        // `useAmountFormatter` and `useBtcFiatPrice` will have the user's preferred currency passed in
        // This test manually updates them so that the conversion rate is correct in the output
        const { result } = renderHookWithState(
            () => useAmountFormatter({ currency: SupportedCurrency.EUR }),
            store,
        )
        const { result: btcFiatPriceResult } = renderHookWithState(
            () => useBtcFiatPrice(SupportedCurrency.EUR),
            store,
        )
        makeFormattedAmountsFromMSats =
            result.current.makeFormattedAmountsFromMSats
        convertCentsToFormattedFiat =
            btcFiatPriceResult.current.convertCentsToFormattedFiat
        convertSatsToFormattedFiat =
            btcFiatPriceResult.current.convertSatsToFormattedFiat

        const txn = makeTestTxnEntry('lnPay', {
            amount: 10000000 as MSats,
        })
        const amount = makeTxnAmountText(
            txn,
            'fiat',
            false,
            true,
            'EUR',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
            convertSatsToFormattedFiat,
        )

        expect(amount).toBe('-9.09 EUR')
    })
})
