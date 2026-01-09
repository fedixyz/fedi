import { TFunction } from 'i18next'

import { selectCurrency, selectFederationBalance } from '../../redux'
import { MSats } from '../../types'
import amountUtils from '../../utils/AmountUtils'
import { useCommonSelector } from '../redux'
import { useAmountFormatter } from './useAmountFormatter'

/**
 * Returns the balance for a given federation in Sats and various formatted values consisting of Sats and/or Fiat
 * (`10`, `0.01 USD`, `10 SATS`, `0.01 USD (10 SATS)`, `Balance: 0.01 USD (10 SATS)`)
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
        formattedPrimaryAmount,
        formattedSecondaryAmount,
    } = makeFormattedAmountsFromMSats(balance)

    const formattedBalance = `${formattedPrimaryAmount} (${formattedSecondaryAmount})`

    return {
        satsBalance: amountUtils.msatToSat(balance),
        formattedBalanceFiat: formattedFiat,
        formattedBalanceSats: formattedSats,
        formattedBalance,
        formattedBalanceText: `${t('words.balance')}: ${formattedBalance}`,
    }
}
