import accounting from 'accounting'

import { AmountSymbolPosition } from '../hooks/amount'
import {
    Btc,
    BtcString,
    MSats,
    MsatsString,
    Sats,
    SatsString,
    SupportedCurrency,
    Usd,
    UsdCents,
    UsdString,
} from '../types'

class AmountUtils {
    static BTC_MAX_DECIMAL_PLACES = 8
    static MIN_BTC_VALUE = 0.00000001
    static SATS_PER_BTC = 100000000
    static MSATS_PER_SAT = 1000
    static FIAT_MAX_DECIMAL_PLACES = 2

    // For BTC unit conversions returned as number
    msatToFiat = (msats: MSats, rate: number): Usd => {
        const btc = this.msatToBtc(msats)
        return this.btcToFiat(btc, rate)
    }
    satToFiat = (sats: Sats, rate: number): Usd => {
        const btc = this.satToBtc(sats)
        return this.btcToFiat(btc, rate)
    }
    btcToFiat = (btc: Btc, rate: number): Usd => {
        return Number(
            (btc * rate).toFixed(AmountUtils.FIAT_MAX_DECIMAL_PLACES),
        ) as Usd
    }
    msatToFiatString = (msats: MSats, rate: number): UsdString => {
        const btc = this.msatToBtc(msats)
        return this.btcToFiatString(btc, rate)
    }
    satToFiatString = (sats: Sats, rate: number): UsdString => {
        const btc = this.satToBtc(sats)
        return this.btcToFiatString(btc, rate)
    }
    btcToFiatString = (btc: Btc, rate: number): UsdString => {
        return this.btcToFiat(btc, rate).toFixed(
            AmountUtils.FIAT_MAX_DECIMAL_PLACES,
        ) as UsdString
    }

    // For BTC unit conversions returned as number
    msatToSat = (msats: MSats): Sats => {
        // Round down so that we never say the user has more than they have,
        // which could cause "wallet sweep" to fail
        return Math.floor(msats / AmountUtils.MSATS_PER_SAT) as Sats
    }
    satToMsat = (sats: Sats): MSats => {
        return (sats * AmountUtils.MSATS_PER_SAT) as MSats
    }
    satToBtc = (sats: Sats): Btc => {
        return Number(
            (sats / AmountUtils.SATS_PER_BTC).toFixed(
                AmountUtils.BTC_MAX_DECIMAL_PLACES,
            ),
        ) as Btc
    }
    btcToSat = (btc: Btc): Sats => {
        return Number(
            (btc * AmountUtils.SATS_PER_BTC).toFixed(
                AmountUtils.BTC_MAX_DECIMAL_PLACES,
            ),
        ) as Sats
    }
    btcToMsat = (btc: Btc): MSats => {
        const sats = this.btcToSat(btc)
        const msats = this.satToMsat(sats)
        return msats
    }
    msatToBtc = (msats: MSats): Btc => {
        const sats = this.msatToSat(msats)
        const btc = this.satToBtc(sats)
        return btc
    }
    // For fiat unit conversions returned as number
    fiatToMsat = (fiat: number, rate: number): MSats => {
        const btc = this.fiatToBtc(fiat, rate)
        return this.btcToMsat(btc)
    }
    fiatToSat = (fiat: number, rate: number): Sats => {
        const btc = this.fiatToBtc(fiat, rate)
        return this.btcToSat(btc)
    }
    fiatToBtc = (fiat: number, rate: number): Btc => {
        return Number(
            (fiat / rate).toFixed(AmountUtils.BTC_MAX_DECIMAL_PLACES),
        ) as Btc
    }

    // For BTC unit conversions returned as strings
    msatToSatString = (msats: MSats): SatsString => {
        return this.msatToSat(msats).toFixed(0) as SatsString
    }

    satToMsatString = (sats: Sats): MsatsString => {
        return this.satToMsat(sats).toFixed(0) as MsatsString
    }
    satToBtcString = (sats: Sats): BtcString => {
        return this.satToBtc(sats).toFixed(
            AmountUtils.BTC_MAX_DECIMAL_PLACES,
        ) as BtcString
    }
    btcToSatString = (btc: Btc): SatsString => {
        return this.btcToSat(btc).toFixed(0) as SatsString
    }
    btcToMsatString = (btc: Btc): MsatsString => {
        return this.btcToMsat(btc).toFixed(0) as MsatsString
    }
    msatToBtcString = (msats: MSats): BtcString => {
        const btc = this.msatToBtc(msats)
        return (
            btc < AmountUtils.MIN_BTC_VALUE
                ? '0'
                : btc.toFixed(AmountUtils.BTC_MAX_DECIMAL_PLACES)
        ) as BtcString
    }
    formatNumber = (amount: number): string => {
        return accounting.formatNumber(amount, { precision: 0 })
    }
    formatSats = (sats: Sats): string => {
        return Intl.NumberFormat().format(sats)
    }
    /**
     * Given a fiat currency amount and the ISO code of the currency,
     * return a string formatted in the user's default locale of the
     * amount. Use symbolPosition to move or hide the currency code
     */
    formatFiat = (
        amount: number,
        currency: SupportedCurrency,
        options: {
            locale?: string | string[]
            symbolPosition?: AmountSymbolPosition
        } = {},
    ) => {
        if (options.symbolPosition === 'none') {
            const fmtOptions = new Intl.NumberFormat(options.locale, {
                style: 'currency',
                currency,
            }).resolvedOptions()
            return amount.toLocaleString(options.locale, {
                ...fmtOptions,
                style: undefined,
                currency: undefined,
                currencySign: undefined,
            })
        } else {
            const formatted = Intl.NumberFormat(options.locale, {
                style: 'currency',
                currency,
                currencyDisplay: 'code',
            }).format(amount)

            return options.symbolPosition === 'end'
                ? formatted.replace(/^(-)?([A-Z]{3})\s*(.+)$/, '$1$3 $2')
                : formatted
        }
    }
    /**
     * Given a currency, return a symbol for it in the user's default locale.
     */
    getCurrencySymbol = (
        currency: SupportedCurrency,
        options: { locale?: string | string[] } = {},
    ) => {
        return (0)
            .toLocaleString(options.locale, {
                style: 'currency',
                currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
            })
            .replace(/\d/g, '')
            .trim()
    }
    /**
     * Given a currency, return the number of decimals (significant digits)
     * that is standard for that currency.
     */
    getCurrencyDecimals = (
        currency: SupportedCurrency,
        options: { locale?: string | string[] } = {},
    ) => {
        const fmtOptions = new Intl.NumberFormat(options.locale, {
            style: 'currency',
            currency,
        }).resolvedOptions()
        return fmtOptions.maximumFractionDigits
    }
    /**
     * Returns the thousands separator character for the user's default locale.
     */
    getThousandsSeparator = (options: { locale?: string | string[] } = {}) => {
        return Intl.NumberFormat(options.locale)
            .format(11111)
            .replace(/\p{Number}/gu, '')
    }
    /**
     * Returns the decimal separator character for the user's default locale.
     */
    getDecimalSeparator = (options: { locale?: string | string[] } = {}) => {
        return Intl.NumberFormat(options.locale)
            .format(1.1)
            .replace(/\p{Number}/gu, '')
    }
    /**
     * Given a string amount that is formatted in the user's default locale,
     * parse a floating point number from it. Handles removing symbols too.
     */
    parseFiatString = (
        fiat: string,
        options: { locale?: string | string[] } = {},
    ): number => {
        const thousandSeparator = this.getThousandsSeparator(options)
        const decimalSeparator = this.getDecimalSeparator(options)
        return parseFloat(
            fiat
                .replace(new RegExp('\\' + thousandSeparator, 'g'), '')
                .replace(new RegExp('\\' + decimalSeparator), '.')
                .replace(/[^0-9.-]+/g, ''),
        )
    }
    /**
     * Given a number amount in USD cents, convert to a any other fiat
     * currency with the 2 exchange rates
     */
    convertCentsToOtherFiat = (
        cents: UsdCents,
        btcUsdRate: number,
        btcFiatRate: number,
    ): number => {
        const usd = Number(
            (cents / 100).toFixed(AmountUtils.FIAT_MAX_DECIMAL_PLACES),
        ) as Usd
        const btc = Number(
            (usd / btcUsdRate).toFixed(AmountUtils.BTC_MAX_DECIMAL_PLACES),
        ) as Btc
        const fiat = Number(
            (btc * btcFiatRate).toFixed(AmountUtils.FIAT_MAX_DECIMAL_PLACES),
        )
        return fiat
    }
}

const amountUtils = new AmountUtils()
export default amountUtils
