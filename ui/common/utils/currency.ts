import { TFunction } from 'i18next'

import {
    CurrencyAliases,
    CurrencyAlias,
    SupportedCurrency,
    SelectableCurrency,
    SelectableCurrencyKey,
    NonGenericCurrency,
} from '../types'
import { formattedCurrencyName } from './format'

// Gets the three-letter currency code from an entry in SupportedCurrency
export function getCurrencyCode(
    currency: SelectableCurrency,
): SupportedCurrency {
    if (currency in CurrencyAliases)
        return CurrencyAliases[currency as CurrencyAlias]
    else return currency as SupportedCurrency
}

export const getSelectableCurrencies = (): Record<
    SelectableCurrencyKey,
    SelectableCurrency
> => {
    const resolvedCurrencies: [SelectableCurrencyKey, SelectableCurrency][] = []

    const supportedEntries = Object.entries(SupportedCurrency) as [
        keyof typeof SupportedCurrency,
        SupportedCurrency,
    ][]
    const currencyAliases = Object.keys(CurrencyAliases) as CurrencyAlias[]

    supportedEntries.forEach(([key, value]) => {
        // XAF and XOF are aliases for entries in CurrencyAlias and should not be shown
        if (key !== SupportedCurrency.XAF && key !== SupportedCurrency.XOF)
            resolvedCurrencies.push([
                key as keyof NonGenericCurrency,
                value as NonGenericCurrency,
            ])
    })

    currencyAliases.forEach(key => {
        // Currency aliases are valid, selectable currency options in the UI
        resolvedCurrencies.push([key, key])
    })

    return Object.fromEntries(resolvedCurrencies) as Record<
        SelectableCurrencyKey,
        SelectableCurrency
    >
}

export const sortCurrenciesByName = (
    t: TFunction,
    currencies: Array<SelectableCurrency>,
) => {
    return currencies.sort((a, b) => {
        const aFormatted = formattedCurrencyName(t, a)
        const bFormatted = formattedCurrencyName(t, b)

        return aFormatted.localeCompare(bFormatted)
    })
}
