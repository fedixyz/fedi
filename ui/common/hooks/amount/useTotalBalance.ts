import {
    changeShowFiatTotalBalance,
    selectLoadedFederations,
    selectOverrideCurrency,
    selectShowFiatTotalBalance,
    selectTotalBalanceMsats,
    selectTotalStableBalanceSats,
} from '../../redux'
import { MSats, SupportedCurrency } from '../../types'
import amountUtils from '../../utils/AmountUtils'
import { useCommonDispatch, useCommonSelector } from '../redux'
import { useAmountFormatter } from './useAmountFormatter'

/**
 * Provides state for rendering the total balance across all federations.
 */
export function useTotalBalance() {
    const dispatch = useCommonDispatch()
    const loadedFederations = useCommonSelector(selectLoadedFederations)
    const totalBalanceMsats = useCommonSelector(s =>
        selectTotalBalanceMsats(s),
    ) as MSats
    const totalStableBalanceSats = useCommonSelector(s =>
        selectTotalStableBalanceSats(s),
    )
    const totalStableBalanceMsats = amountUtils.satToMsat(
        totalStableBalanceSats,
    )
    const overrideCurrency = useCommonSelector(selectOverrideCurrency)
    const showFiatTotalBalance = useCommonSelector(selectShowFiatTotalBalance)
    const currencyToUse = overrideCurrency ?? SupportedCurrency.USD
    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        currency: currencyToUse,
    })
    const combinedMsats = (totalBalanceMsats + totalStableBalanceMsats) as MSats
    const { formattedBitcoinAmount, formattedSats, formattedFiat } =
        makeFormattedAmountsFromMSats(combinedMsats, 'end', true)

    const changeDisplayCurrency = () => {
        // if the user has an override currency, tapping total balance does nothing
        if (overrideCurrency) return
        // otherwise toggle between fiat and sats
        dispatch(changeShowFiatTotalBalance(!showFiatTotalBalance))
    }

    return {
        totalBalanceSats: formattedSats,
        // always show fiat if the user has an override currency
        formattedBalance: overrideCurrency
            ? formattedFiat
            : showFiatTotalBalance
              ? formattedFiat
              : formattedBitcoinAmount,
        shouldHideTotalBalance: loadedFederations.length === 0,
        changeDisplayCurrency,
    }
}
