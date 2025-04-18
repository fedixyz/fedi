import {
    CurrencyAliases,
    CurrencyAlias,
    SupportedCurrency,
    SelectableCurrency,
    SelectableCurrencyKey,
    NonGenericCurrency,
} from '../types'

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
    const sortedCurrencies: [SelectableCurrencyKey, SelectableCurrency][] = []

    const supportedEntries = Object.entries(SupportedCurrency) as [
        keyof typeof SupportedCurrency,
        SupportedCurrency,
    ][]
    const currencyAliases = Object.keys(CurrencyAliases) as CurrencyAlias[]

    supportedEntries.forEach(([key, value]) => {
        // XAF and XOF are aliases for entries in CurrencyAlias and should not be shown
        if (key !== SupportedCurrency.XAF && key !== SupportedCurrency.XOF)
            sortedCurrencies.push([
                key as keyof NonGenericCurrency,
                value as NonGenericCurrency,
            ])
    })

    currencyAliases.forEach(key => {
        // Currency aliases are valid, selectable currency options in the UI
        sortedCurrencies.push([key, key])
    })

    return Object.fromEntries(
        sortedCurrencies.sort(([, a], [, b]) => a.localeCompare(b)),
    ) as Record<SelectableCurrencyKey, SelectableCurrency>
}
