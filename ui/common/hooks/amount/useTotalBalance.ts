import {
    selectLoadedFederations,
    selectOverrideCurrency,
    selectBalanceDisplay,
    selectTotalBalanceMsats,
    selectTotalStableBalanceSats,
    setBalanceDisplay,
} from '../../redux'
import { BalanceDisplayType as BalanceDisplay } from '../../redux/currency'
import { MSats, SupportedCurrency } from '../../types'
import amountUtils from '../../utils/AmountUtils'
import { useCommonDispatch, useCommonSelector } from '../redux'
import { useAmountFormatter } from './useAmountFormatter'

const DISPLAY_CAROUSEL_MAP: Record<BalanceDisplay, BalanceDisplay> = {
    sats: 'fiat',
    fiat: 'hidden',
    hidden: 'sats',
}

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
    const balanceDisplay = useCommonSelector(selectBalanceDisplay)
    const currencyToUse = overrideCurrency ?? SupportedCurrency.USD
    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        currency: currencyToUse,
    })
    const combinedMsats = (totalBalanceMsats + totalStableBalanceMsats) as MSats
    const { formattedBitcoinAmount, formattedSats, formattedFiat } =
        makeFormattedAmountsFromMSats(combinedMsats, 'end', true)

    // sats -> fiat -> hidden -> sats...
    const changeDisplayCurrency = () => {
        dispatch(setBalanceDisplay(DISPLAY_CAROUSEL_MAP[balanceDisplay]))
    }

    const formattedBalanceMap: Record<BalanceDisplay, string> = {
        hidden: '*******',
        fiat: formattedFiat ?? '',
        sats: formattedBitcoinAmount ?? '',
    }

    // Allows user to see btc amount + chosen fiat currency + hidden
    return {
        totalBalanceSats: formattedSats,
        formattedBalance: formattedBalanceMap[balanceDisplay],
        shouldHideTotalBalance: loadedFederations.length === 0,
        changeDisplayCurrency,
    }
}
