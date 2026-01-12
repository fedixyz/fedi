import { useCallback } from 'react'

import {
    selectBtcExchangeRate,
    selectBtcUsdExchangeRate,
    selectCurrency,
    selectCurrencyLocale,
} from '@fedi/common/redux'
import {
    Federation,
    NonGenericCurrency,
    Sats,
    SelectableCurrency,
    SupportedCurrency,
    UsdCents,
} from '@fedi/common/types'
import { FiatFXInfo } from '@fedi/common/types/bindings'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { AmountSymbolPosition } from '../../types/amount'
import { useCommonSelector } from '../redux'

/**
 * Provides a set of conversion utility functions for converting and formatting Bitcoin, Fiat, and Cents.
 *
 * Unlike `useAmountFormatter`, each function provided by this hook returns a direct value instead of a set of formatted values.
 *
 * Currency/bitcoin rates, currency locale, symbol positioning are already handled.
 *
 * Usage:
 * ```ts
 * const { convertSatsToFiat } = useBtcFiatPrice()
 * const { convertCentsToSats } = useBtcFiatPrice(SupportedCurrency.USD)
 * const { convertCentsToFormattedFiat } = useBtcFiatPrice(
 *     SupportedCurrency.USD,
 *     federationId,
 * )
 *
 * convertSatsToFiat(1000 as Sats) // Sats
 * convertCentsToSats(1000 as UsdCents) // Usd
 * convertCentsToFormattedFiat(1000 as UsdCents) // "10.00 USD"
 * ```
 */
export const useBtcFiatPrice = (
    currency?: SelectableCurrency,
    federationId?: Federation['id'],
) => {
    const selectedFiatCurrency = useCommonSelector(s =>
        selectCurrency(s, federationId),
    )
    const currencyLocale = useCommonSelector(selectCurrencyLocale)
    const exchangeRate = useCommonSelector(s =>
        selectBtcExchangeRate(s, currency, federationId),
    )
    const btcUsdExchangeRate = useCommonSelector(s =>
        selectBtcUsdExchangeRate(s, federationId),
    )

    const fiatCurrency = currency ?? selectedFiatCurrency

    return {
        convertCentsToSats: useCallback(
            (cents: UsdCents) => {
                // since we are passing cents, the exchange rate should also be in cents
                return amountUtils.fiatToSat(cents, btcUsdExchangeRate * 100)
            },
            [btcUsdExchangeRate],
        ),
        convertCentsToFormattedFiat: useCallback(
            (cents: UsdCents, symbolPosition: AmountSymbolPosition = 'end') => {
                const amount = amountUtils.convertCentsToOtherFiat(
                    cents,
                    btcUsdExchangeRate,
                    exchangeRate,
                )
                return amountUtils.formatFiat(amount, fiatCurrency, {
                    symbolPosition,
                    locale: currencyLocale,
                })
            },
            [btcUsdExchangeRate, currencyLocale, exchangeRate, fiatCurrency],
        ),
        convertSatsToFiat: useCallback(
            (sats: Sats) => {
                return amountUtils.satToFiat(sats, exchangeRate)
            },
            [exchangeRate],
        ),
        convertSatsToCents: useCallback(
            (sats: Sats) => {
                return Math.round(
                    amountUtils.satToFiat(sats, btcUsdExchangeRate) * 100,
                ) as UsdCents
            },
            [btcUsdExchangeRate],
        ),
        convertSatsToFormattedFiat: useCallback(
            (
                sats: Sats,
                symbolPosition: AmountSymbolPosition = 'end',
                historicalFiatInfo?: FiatFXInfo,
            ) => {
                const conversionCurrency: SelectableCurrency =
                    historicalFiatInfo
                        ? (historicalFiatInfo.fiatCode as NonGenericCurrency)
                        : fiatCurrency
                const conversionRate = historicalFiatInfo
                    ? historicalFiatInfo.btcToFiatHundredths / 100
                    : exchangeRate
                const amount = amountUtils.satToFiat(sats, conversionRate)
                return amountUtils.formatFiat(amount, conversionCurrency, {
                    symbolPosition,
                    locale: currencyLocale,
                })
            },
            [exchangeRate, fiatCurrency, currencyLocale],
        ),

        convertSatsToFormattedUsd: useCallback(
            (sats: Sats, symbolPosition: AmountSymbolPosition = 'end') => {
                const amount = amountUtils.satToFiat(sats, btcUsdExchangeRate)
                return amountUtils.formatFiat(amount, SupportedCurrency.USD, {
                    symbolPosition,
                    locale: currencyLocale,
                })
            },
            [btcUsdExchangeRate, currencyLocale],
        ),
    }
}
