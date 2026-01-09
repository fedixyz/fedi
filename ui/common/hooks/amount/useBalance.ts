import { selectCurrency, selectFederationBalance } from '../../redux'
import { MSats } from '../../types'
import amountUtils from '../../utils/AmountUtils'
import { useCommonSelector } from '../redux'
import { useAmountFormatter } from './useAmountFormatter'

/**
 * Provides state for rendering a balance amount in fiat and sats.
 */
export function useBalance(federationId: string) {
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

    return {
        satsBalance: amountUtils.msatToSat(balance),
        formattedBalanceFiat: formattedFiat,
        formattedBalanceSats: formattedSats,
        formattedBalance: `${formattedPrimaryAmount} (${formattedSecondaryAmount})`,
    }
}
