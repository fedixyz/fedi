import { createIntegrationTestBuilder } from '@fedi/common/tests/utils/remote-bridge-setup'
import { renderHookWithBridge } from '@fedi/common/tests/utils/render'

import { useBtcFiatPrice } from '../../../../hooks/amount'
import {
    changeOverrideCurrency,
    fetchCurrencyPrices,
    setAmountInputType,
    setCurrencyLocale,
    setupStore,
} from '../../../../redux'
import { Sats, SupportedCurrency, UsdCents } from '../../../../types'
import { FedimintBridge } from '../../../../utils/fedimint'

describe('useBtcFiatPrice hook', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    let store: ReturnType<typeof setupStore>
    let fedimint: FedimintBridge

    beforeEach(() => {
        context.store.dispatch({
            type: fetchCurrencyPrices.fulfilled.type,
            payload: {
                // For this test suite, 1 cent = 10 sats = 0.01 USD
                btcUsdRate: 100000,
                fiatUsdRates: {
                    EUR: 1.1, // 1 EUR = 1.1 USD
                },
            },
        })
        context.store.dispatch(changeOverrideCurrency(SupportedCurrency.USD))
        context.store.dispatch(setCurrencyLocale('en-US'))
        context.store.dispatch(setAmountInputType('fiat'))

        store = context.store
        fedimint = context.bridge.fedimint
    })

    it('convertCentsToSats should convert `UsdCents` to `Sats`', async () => {
        const { result } = renderHookWithBridge(
            () => useBtcFiatPrice(),
            store,
            fedimint,
        )

        expect(result.current.convertCentsToSats(0 as UsdCents)).toBe(0)
        expect(result.current.convertCentsToSats(1000 as UsdCents)).toBe(10000)
        expect(result.current.convertCentsToSats(10000 as UsdCents)).toBe(
            100000,
        )
    })

    it('convertCentsToFormattedFiat should convert `UsdCents` to a formatted fiat string', async () => {
        const { result } = renderHookWithBridge(
            () => useBtcFiatPrice(),
            store,
            fedimint,
        )

        const amount = 10 as UsdCents

        expect(result.current.convertCentsToFormattedFiat(amount)).toBe(
            '0.10 USD',
        )

        // Test currency symbol position
        expect(result.current.convertCentsToFormattedFiat(amount, 'none')).toBe(
            '0.10',
        )
        expect(result.current.convertCentsToFormattedFiat(amount, 'end')).toBe(
            '0.10 USD',
        )
        expect(
            result.current.convertCentsToFormattedFiat(amount, 'start'),
        ).toBe('USD 0.10')
    })

    it('convertSatsToFiat should convert `Sats` to `Usd`', async () => {
        const { result } = renderHookWithBridge(
            () => useBtcFiatPrice(),
            store,
            fedimint,
        )

        expect(result.current.convertSatsToFiat(0 as Sats)).toBe(0)
        expect(result.current.convertSatsToFiat(1000 as Sats)).toBe(1)
        expect(result.current.convertSatsToFiat(10000 as Sats)).toBe(10)
    })

    it('convertSatsToCents should convert `Sats` to `UsdCents`', async () => {
        const { result } = renderHookWithBridge(
            () => useBtcFiatPrice(),
            store,
            fedimint,
        )

        expect(result.current.convertSatsToCents(0 as Sats)).toBe(0)
        expect(result.current.convertSatsToCents(1000 as Sats)).toBe(100)
        expect(result.current.convertSatsToCents(10000 as Sats)).toBe(1000)
    })

    it('convertSatsToFormattedFiat should convert `Sats` to a formatted fiat string', async () => {
        const { result } = renderHookWithBridge(
            () => useBtcFiatPrice(),
            store,
            fedimint,
        )

        const amount = 100 as Sats

        expect(result.current.convertSatsToFormattedFiat(amount)).toBe(
            '0.10 USD',
        )

        // Test currency symbol position
        expect(result.current.convertSatsToFormattedFiat(amount, 'none')).toBe(
            '0.10',
        )
        expect(result.current.convertSatsToFormattedFiat(amount, 'end')).toBe(
            '0.10 USD',
        )
        expect(result.current.convertSatsToFormattedFiat(amount, 'start')).toBe(
            'USD 0.10',
        )
    })

    it('convertSatsToFormattedUsd should convert `Sats` to a formatted USD string', async () => {
        const { result } = renderHookWithBridge(
            () => useBtcFiatPrice(),
            store,
            fedimint,
        )

        const amount = 100 as Sats

        expect(result.current.convertSatsToFormattedUsd(amount)).toBe(
            '0.10 USD',
        )

        // Test currency symbol position
        expect(result.current.convertSatsToFormattedUsd(amount, 'none')).toBe(
            '0.10',
        )
        expect(result.current.convertSatsToFormattedUsd(amount, 'end')).toBe(
            '0.10 USD',
        )
        expect(result.current.convertSatsToFormattedUsd(amount, 'start')).toBe(
            'USD 0.10',
        )
    })

    it('convertCentsToFormattedFiat and convertSatsToFormattedFiat should adhere to the correct currency non-usd conversion rate', async () => {
        store.dispatch(changeOverrideCurrency(SupportedCurrency.EUR))
        const { result } = renderHookWithBridge(
            () => useBtcFiatPrice(),
            store,
            fedimint,
        )

        expect(result.current.convertCentsToFormattedFiat(10 as UsdCents)).toBe(
            '0.09 EUR',
        )
        expect(result.current.convertSatsToFormattedFiat(1000 as Sats)).toBe(
            '0.91 EUR',
        )
    })
})
