import { useMemo } from 'react'

import { Sats, SelectableCurrency } from '../../types'
import { FormattedAmounts } from '../../types/amount'
import amountUtils from '../../utils/AmountUtils'

export const useFormattedFiatSats = (
    amount: Sats,
    btcToFiatRate: number,
    currency: SelectableCurrency,
    currencyLocale: string,
): Pick<FormattedAmounts, 'formattedFiat' | 'formattedSats'> =>
    useMemo(() => {
        const formattedSats = amountUtils.formatSats(amount)

        const fiatRaw = amountUtils.satToBtc(amount) * btcToFiatRate
        const decimals = amountUtils.getCurrencyDecimals(currency, {
            locale: currencyLocale,
        })

        const formattedFiat = amountUtils.formatFiat(fiatRaw, currency, {
            locale: currencyLocale,
            symbolPosition: 'none',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        })

        return { formattedFiat, formattedSats }
    }, [amount, btcToFiatRate, currency, currencyLocale])
