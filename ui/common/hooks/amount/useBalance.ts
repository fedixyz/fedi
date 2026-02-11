import { TFunction } from 'i18next'

import { selectCurrency, selectFederationBalance } from '../../redux'
import { MSats } from '../../types'
import amountUtils from '../../utils/AmountUtils'
import { useCommonSelector } from '../redux'
import { useAmountFormatter } from './useAmountFormatter'

/**
 * Returns the balance for a given federation in Sats and various formatted values consisting of Sats and/or Fiat like
 *
 * ```json
 * {
 *     satsBalance: 10,
 *     formattedBalanceFiat: "0.01 USD",
 *     formattedBalanceSats: "10 SATS",
 *     formattedBalance: "0.01 USD (10 SATS)",
 *     formattedBalanceText: "Balance: 0.01 USD (10 SATS)",
 * }
 * ```
 *
 * Usage:
 * ```ts
 * const { satsBalance, formattedBalanceFiat } = useBalance(federationId)
 *
 * console.log(`You have ${satsBalance} sats`)
 * console.log(`Your fiat balance is ${formattedBalanceFiat}`)
 * // ...
 * ```
 */
export function useBalance(t: TFunction, federationId: string) {
    const balance = useCommonSelector(s =>
        selectFederationBalance(s, federationId),
    ) as MSats
    const selectedCurrency = useCommonSelector(s =>
        selectCurrency(s, federationId),
    )
    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        currency: selectedCurrency,
        federationId,
    })

    const {
        formattedFiat,
        formattedSats,
        formattedBitcoinAmount,
        formattedPrimaryAmount,
        formattedSecondaryAmount,
    } = makeFormattedAmountsFromMSats(balance, 'end', true)

    const formattedBalance = `${formattedPrimaryAmount} (${formattedSecondaryAmount})`

    return {
        satsBalance: amountUtils.msatToSat(balance),
        formattedBalanceFiat: formattedFiat,
        formattedBalanceSats: formattedSats,
        formattedBalanceBitcoin: formattedBitcoinAmount,
        formattedBalance,
        formattedBalanceText: `${t('words.balance')}: ${formattedBalance}`,
    }
}
