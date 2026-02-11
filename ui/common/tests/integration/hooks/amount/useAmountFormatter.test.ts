import { act } from '@testing-library/react'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import {
    changeOverrideCurrency,
    setCurrencyLocale,
    fetchCurrencyPrices,
    setTransactionDisplayType,
} from '@fedi/common/redux'
import { createMockTransaction } from '@fedi/common/tests/mock-data/transactions'
import { setupRemoteBridgeTests } from '@fedi/common/tests/utils/remote-bridge-setup'
import { renderHookWithBridge } from '@fedi/common/tests/utils/render'
import { mockSystemLocale } from '@fedi/common/tests/utils/setup'
import { MSats, Sats, SupportedCurrency, UsdCents } from '@fedi/common/types'

import amountUtils from '../../../../utils/AmountUtils'

describe('useAmountFormatter hook', () => {
    const context = setupRemoteBridgeTests()

    describe('makeFormattedAmountsFromTxn with historical exchange rates', () => {
        it('uses historical exchange rate when txDateFiatInfo is present', () => {
            const { store, bridge } = context

            const { result } = renderHookWithBridge(
                () => useAmountFormatter(),
                store,
                bridge.fedimint,
            )

            const txn = createMockTransaction({
                amount: 100000000000, // 1 BTC in msats
                txDateFiatInfo: {
                    btcToFiatHundredths: 4000000, // Historical rate: $40K per BTC
                    fiatCode: 'USD',
                },
            })

            const formatted = result.current.makeFormattedAmountsFromTxn(
                txn,
                'none',
            )

            // Should use historical rate ($40k) not current rate ($100k)
            expect(formatted.formattedFiat).toBe('40,000.00')
            expect(formatted.formattedSats).toBe('100,000,000')
        })

        it('falls back to current exchange rates when txDateFiatInfo is missing', () => {
            const { store, bridge } = context

            store.dispatch({
                type: fetchCurrencyPrices.fulfilled.type,
                payload: {
                    btcUsdRate: 100000, // Current rate: $100K per BTC
                    fiatUsdRates: {},
                },
            })

            const { result } = renderHookWithBridge(
                () => useAmountFormatter(),
                store,
                bridge.fedimint,
            )

            const txn = createMockTransaction({
                amount: 100000000000, // 1 BTC, no historical data
            })

            const formatted = result.current.makeFormattedAmountsFromTxn(
                txn,
                'none',
            )

            expect(formatted.formattedFiat).toBe('100,000.00')
            expect(formatted.formattedSats).toBe('100,000,000')
        })

        it('works with different fiat currencies in historical data', () => {
            const { store, bridge } = context
            store.dispatch(changeOverrideCurrency(SupportedCurrency.EUR))
            store.dispatch(setCurrencyLocale('de-DE'))
            mockSystemLocale('de-DE')

            const { result } = renderHookWithBridge(
                () => useAmountFormatter(),
                store,
                bridge.fedimint,
            )

            const txn = createMockTransaction({
                amount: 10000000000, // 0.1 BTC
                txDateFiatInfo: {
                    btcToFiatHundredths: 4500000, // Historical rate: €45,000.00 per BTC
                    fiatCode: 'EUR',
                },
            })

            const formatted = result.current.makeFormattedAmountsFromTxn(
                txn,
                'none',
            )

            // Should use EUR historical rate and currency
            expect(formatted.formattedFiat).toBe('4.500,00')
            expect(formatted.formattedSats).toBe('10.000.000')
        })

        it('respects transactionDisplayType setting with historical data', () => {
            const { store, bridge } = context

            act(() => store.dispatch(setTransactionDisplayType('fiat'))) // with fiat display preference

            const { result: fiatPrimaryResult } = renderHookWithBridge(
                () => useAmountFormatter(),
                store,
                bridge.fedimint,
            )

            const txn = createMockTransaction({
                amount: 1000000000, // 0.01 BTC
                txDateFiatInfo: {
                    btcToFiatHundredths: 6000000, // Historical rate: $60,000.00 per BTC
                    fiatCode: 'USD',
                },
            })

            const fiatPrimaryFormatted =
                fiatPrimaryResult.current.makeFormattedAmountsFromTxn(txn)

            // When fiat is primary, historical fiat should be primary
            expect(fiatPrimaryFormatted.formattedPrimaryAmount).toBe(
                '600.00 USD',
            )
            expect(fiatPrimaryFormatted.formattedSecondaryAmount).toBe(
                '1,000,000 SATS',
            )

            act(() => {
                store.dispatch(setTransactionDisplayType('sats')) // don't show fiat display preference
            })

            const { result: satsPrimaryResult } = renderHookWithBridge(
                () => useAmountFormatter(),
                store,
                bridge.fedimint,
            )

            const satsPrimaryFormatted =
                satsPrimaryResult.current.makeFormattedAmountsFromTxn(txn)

            // When sats is primary, sats should be primary
            expect(satsPrimaryFormatted.formattedPrimaryAmount).toBe(
                '1,000,000 SATS',
            )
            expect(satsPrimaryFormatted.formattedSecondaryAmount).toBe(
                '600.00 USD',
            )
        })

        it('handles small historical amounts with proper precision', () => {
            const { store, bridge } = context
            const { result } = renderHookWithBridge(
                () => useAmountFormatter(),
                store,
                bridge.fedimint,
            )

            const txn = createMockTransaction({
                amount: 1000000, // 1000 sats (0.00001 BTC)
                txDateFiatInfo: {
                    btcToFiatHundredths: 5000000, // Historical rate: $50K per BTC
                    fiatCode: 'USD',
                },
            })

            const formatted = result.current.makeFormattedAmountsFromTxn(
                txn,
                'none',
            )

            // 1000 sats * $50K / 100,000,000 sats = $0.50
            expect(formatted.formattedFiat).toBe('0.50')
            expect(formatted.formattedSats).toBe('1,000')
        })
    })

    it('should convert and format an amount in Sats and MSats', () => {
        const { store, bridge } = context
        store.dispatch({
            type: fetchCurrencyPrices.fulfilled.type,
            payload: { btcUsdRate: 100000 },
        })

        const { result } = renderHookWithBridge(
            () => useAmountFormatter(),
            store,
            bridge.fedimint,
        )
        const { makeFormattedAmountsFromSats, makeFormattedAmountsFromMSats } =
            result.current
        const amount: Sats = 2100 as Sats
        const amountMsats = amountUtils.satToMsat(amount)
        const formattedAmounts = makeFormattedAmountsFromSats(2100 as Sats)
        const msatAmounts = makeFormattedAmountsFromMSats(amountMsats)

        expect(msatAmounts).toEqual(formattedAmounts)
        expect(formattedAmounts.formattedSats).toEqual('2,100 SATS')
        expect(formattedAmounts.formattedFiat).toEqual('2.10 USD')
        expect(formattedAmounts.formattedBitcoinAmount).toEqual('2,100 SATS')
        // formatBtc is fixed to 2 decimal places for some reason
        // TODO: investigate if this is by design or if it should be fixed
        expect(formattedAmounts.formattedBtc).toEqual('0.00 BTC')
        expect(formattedAmounts.formattedUsd).toEqual('2.10 USD')
        expect(formattedAmounts.formattedPrimaryAmount).toEqual('2.10 USD')
        expect(formattedAmounts.formattedSecondaryAmount).toEqual('2,100 SATS')
    })

    it('should format an amount in BTC when the threshold of >1M sats is met', () => {
        const { store, bridge } = context
        store.dispatch({
            type: fetchCurrencyPrices.fulfilled.type,
            payload: { btcUsdRate: 100000 },
        })

        const { result } = renderHookWithBridge(
            () => useAmountFormatter(),
            store,
            bridge.fedimint,
        )
        const { makeFormattedAmountsFromSats } = result.current
        const amount: Sats = 2100000 as Sats
        const formattedAmounts = makeFormattedAmountsFromSats(
            amount,
            'end',
            true,
        )

        expect(formattedAmounts.formattedSats).toEqual('2,100,000 SATS')
        expect(formattedAmounts.formattedFiat).toEqual('2,100.00 USD')
        expect(formattedAmounts.formattedBtc).toEqual('0.02 BTC')
        expect(formattedAmounts.formattedUsd).toEqual('2,100.00 USD')
        expect(formattedAmounts.formattedPrimaryAmount).toEqual('2,100.00 USD')
        expect(formattedAmounts.formattedSecondaryAmount).toEqual('0.02 BTC')
    })

    it('should convert and format an amount in Cents', () => {
        const { store, bridge } = context
        store.dispatch({
            type: fetchCurrencyPrices.fulfilled.type,
            payload: { btcUsdRate: 100000, fiatUsdRates: { EUR: 0.5 } },
        })
        store.dispatch(setTransactionDisplayType('fiat'))
        store.dispatch(changeOverrideCurrency(SupportedCurrency.EUR))

        const { result } = renderHookWithBridge(
            () => useAmountFormatter(),
            store,
            bridge.fedimint,
        )
        const { makeFormattedAmountsFromCents } = result.current
        const formattedAmounts = makeFormattedAmountsFromCents(128 as UsdCents)

        // For reasons unknown, `formattedSats` and `formattedBtc` are set to empty strings in `makeFormattedAmountsFromCents`
        expect(formattedAmounts.formattedSats).toEqual('')
        expect(formattedAmounts.formattedBtc).toEqual('')
        expect(formattedAmounts.formattedFiat).toEqual('2.56 EUR')
        expect(formattedAmounts.formattedUsd).toEqual('128.00 USD')
        expect(formattedAmounts.formattedPrimaryAmount).toEqual('2.56 EUR')
        expect(formattedAmounts.formattedSecondaryAmount).toEqual('128.00 USD')
    })

    it('should respect the symbol position', () => {
        const { store, bridge } = context
        store.dispatch({
            type: fetchCurrencyPrices.fulfilled.type,
            payload: { btcUsdRate: 100000 },
        })

        const { result } = renderHookWithBridge(
            () => useAmountFormatter(),
            store,
            bridge.fedimint,
        )
        const {
            makeFormattedAmountsFromSats,
            makeFormattedAmountsFromMSats,
            makeFormattedAmountsFromCents,
        } = result.current

        const satsPositionNone = makeFormattedAmountsFromSats(
            1000 as Sats,
            'none',
        )
        const satsPositionStart = makeFormattedAmountsFromSats(
            1000 as Sats,
            'start',
        )
        const satsPositionEnd = makeFormattedAmountsFromSats(
            1000 as Sats,
            'end',
        )
        const msatsPositionNone = makeFormattedAmountsFromMSats(
            1000 as MSats,
            'none',
        )
        const msatsPositionStart = makeFormattedAmountsFromMSats(
            1000 as MSats,
            'start',
        )
        const msatsPositionEnd = makeFormattedAmountsFromMSats(
            1000 as MSats,
            'end',
        )
        const centsPositionNone = makeFormattedAmountsFromCents(
            1000 as UsdCents,
            'none',
        )
        const centsPositionStart = makeFormattedAmountsFromCents(
            1000 as UsdCents,
            'start',
        )
        const centsPositionEnd = makeFormattedAmountsFromCents(
            1000 as UsdCents,
            'end',
        )

        expect(satsPositionNone.formattedPrimaryAmount).not.toContain('USD')
        expect(satsPositionNone.formattedSecondaryAmount).not.toContain('SATS')
        expect(msatsPositionNone.formattedPrimaryAmount).not.toContain('USD')
        expect(msatsPositionNone.formattedSecondaryAmount).not.toContain('SATS')
        expect(centsPositionNone.formattedPrimaryAmount).not.toContain('USD')
        expect(centsPositionNone.formattedSecondaryAmount).not.toContain('USD')

        // The currency symbol only appears at the front **formatted fiat** amounts, not bitcoin amounts
        expect(satsPositionStart.formattedPrimaryAmount.startsWith('USD')).toBe(
            true,
        )
        expect(
            msatsPositionStart.formattedPrimaryAmount.startsWith('USD'),
        ).toBe(true)
        expect(
            centsPositionStart.formattedPrimaryAmount.startsWith('USD'),
        ).toBe(true)
        expect(
            centsPositionStart.formattedSecondaryAmount.startsWith('USD'),
        ).toBe(true)

        expect(satsPositionEnd.formattedPrimaryAmount.endsWith('USD')).toBe(
            true,
        )
        expect(msatsPositionEnd.formattedPrimaryAmount.endsWith('USD')).toBe(
            true,
        )
        expect(centsPositionEnd.formattedPrimaryAmount.endsWith('USD')).toBe(
            true,
        )
        expect(centsPositionEnd.formattedSecondaryAmount.endsWith('USD')).toBe(
            true,
        )
    })
})
