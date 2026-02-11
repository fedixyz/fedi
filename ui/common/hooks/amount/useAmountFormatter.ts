import { useCallback } from 'react'

import {
    selectCurrencyLocale,
    selectTransactionDisplayType,
} from '@fedi/common/redux'
import {
    Federation,
    MSats,
    Sats,
    SelectableCurrency,
    SupportedCurrency,
    TransactionListEntry,
    UsdCents,
} from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { AmountSymbolPosition, FormattedAmounts } from '../../types/amount'
import { useCommonSelector } from '../redux'
import { useBtcFiatPrice } from './useBtcFiatPrice'

const log = makeLog('common/hooks/useAmountFormatter')

/**
 * Provides a selection of amount formatting util functions which can be used for Sats, MSats, Cents, and `TransactionListEntry`s.
 * Automatically handles btc/fiat conversions/rates under the hood with `useBtcFiatPrice`.
 * Can be used for displaying formatted primary, secondary, and numeric amounts like `121,828 SATS`, `2,500.20 USD`, and `60,000`.
 *
 * Usage:
 * ```ts
 * const { makeFormattedAmountsFromSats } = useAmountFormatter()
 *
 * const balance: Sats = 1000
 * const { formattedPrimaryAmount, formattedSecondaryAmount } =
 *     makeFormattedAmountsFromSats(balance)
 *
 * console.log(`You have ${formattedPrimaryAmount} (${formattedSecondaryAmount})`)
 * ```
 */
export const useAmountFormatter = (options?: {
    currency?: SelectableCurrency
    federationId?: Federation['id']
}) => {
    const { currency, federationId } = options ?? {}
    const {
        convertSatsToFormattedUsd,
        convertSatsToFormattedFiat,
        convertCentsToFormattedFiat,
    } = useBtcFiatPrice(currency, federationId)
    const currencyLocale = useCommonSelector(selectCurrencyLocale)
    const transactionDisplayType = useCommonSelector(
        selectTransactionDisplayType,
    )

    const makeFormattedAmountsFromSats = useCallback(
        (
            amount: Sats,
            symbolPosition: AmountSymbolPosition = 'end',
            useBtcThreshold: boolean = false,
        ): FormattedAmounts => {
            const formattedFiat = convertSatsToFormattedFiat(
                amount,
                symbolPosition,
            )
            const formattedUsd = convertSatsToFormattedUsd(
                amount,
                symbolPosition,
            )
            const formattedSats =
                symbolPosition === 'none'
                    ? amountUtils.formatSats(amount)
                    : `${amountUtils.formatSats(amount)} SATS`

            const amountBtc = amountUtils.satToBtc(amount)
            const formattedBtc =
                symbolPosition === 'none'
                    ? amountUtils.formatBtc(amountBtc)
                    : `${amountUtils.formatBtc(amountBtc)} BTC`

            // optional formatting to use BTC over sats if amount is greater than 1M sats
            const formattedBitcoinAmount =
                useBtcThreshold && amount >= 1_000_000
                    ? formattedBtc
                    : formattedSats

            return {
                formattedFiat,
                formattedSats,
                formattedBtc,
                formattedUsd,
                formattedBitcoinAmount,
                formattedPrimaryAmount:
                    transactionDisplayType === 'fiat'
                        ? formattedFiat
                        : formattedBitcoinAmount,
                formattedSecondaryAmount:
                    transactionDisplayType === 'fiat'
                        ? formattedBitcoinAmount
                        : formattedFiat,
            }
        },
        [
            convertSatsToFormattedFiat,
            convertSatsToFormattedUsd,
            transactionDisplayType,
        ],
    )

    const makeFormattedAmountsFromCents = useCallback(
        (
            amount: UsdCents,
            symbolPosition: AmountSymbolPosition = 'end',
        ): FormattedAmounts => {
            const formattedFiat = convertCentsToFormattedFiat(
                amount,
                symbolPosition,
            )
            const formattedUsd = amountUtils.formatFiat(
                amount,
                SupportedCurrency.USD,
                { symbolPosition, locale: currencyLocale },
            )
            return {
                formattedFiat,
                formattedSats: '',
                formattedBtc: '',
                formattedUsd,
                formattedPrimaryAmount:
                    transactionDisplayType === 'fiat'
                        ? formattedFiat
                        : formattedUsd,
                formattedSecondaryAmount:
                    transactionDisplayType === 'fiat'
                        ? formattedUsd
                        : formattedFiat,
            }
        },
        [convertCentsToFormattedFiat, currencyLocale, transactionDisplayType],
    )

    const makeFormattedAmountsFromMSats = useCallback(
        (
            amount: MSats,
            symbolPosition: AmountSymbolPosition = 'end',
            useBtcThreshold: boolean = false,
        ): FormattedAmounts => {
            const sats = amountUtils.msatToSat(amount)
            return makeFormattedAmountsFromSats(
                sats,
                symbolPosition,
                useBtcThreshold,
            )
        },
        [makeFormattedAmountsFromSats],
    )

    const makeFormattedAmountsFromTxn = useCallback(
        (
            txn: TransactionListEntry,
            symbolPosition: AmountSymbolPosition = 'end',
        ): FormattedAmounts => {
            if (txn.txDateFiatInfo) {
                // Too noisy. Logs for each item in the list. Uncomment if helpful.
                // log.debug(
                //     'makeFormattedAmountsFromTxn - Using historical exchange rate',
                //     {
                //         amountMSats: txn.amount,
                //         txDateFiatInfo: txn.txDateFiatInfo,
                //     },
                // )
                const sats = amountUtils.msatToSat(txn.amount)
                const formattedFiat = convertSatsToFormattedFiat(
                    sats,
                    symbolPosition,
                    txn.txDateFiatInfo,
                )
                const formattedUsd = convertSatsToFormattedUsd(
                    sats,
                    symbolPosition,
                )
                const formattedSats =
                    symbolPosition === 'none'
                        ? amountUtils.formatSats(sats)
                        : `${amountUtils.formatSats(sats)} SATS`
                return {
                    formattedFiat,
                    formattedSats,
                    formattedUsd,
                    formattedPrimaryAmount:
                        transactionDisplayType === 'fiat'
                            ? formattedFiat
                            : formattedSats,
                    formattedSecondaryAmount:
                        transactionDisplayType === 'fiat'
                            ? formattedSats
                            : formattedFiat,
                }
            } else {
                log.debug(
                    'makeFormattedAmountsFromTxn - No historical data, using current rates',
                    {
                        hasTransaction: !!txn,
                        transactionKeys: txn ? Object.keys(txn) : [],
                    },
                )
                return makeFormattedAmountsFromMSats(txn.amount, symbolPosition)
            }
        },
        [
            convertSatsToFormattedFiat,
            convertSatsToFormattedUsd,
            makeFormattedAmountsFromMSats,
            transactionDisplayType,
        ],
    )

    return {
        makeFormattedAmountsFromMSats,
        makeFormattedAmountsFromSats,
        makeFormattedAmountsFromTxn,
        makeFormattedAmountsFromCents,
    }
}
