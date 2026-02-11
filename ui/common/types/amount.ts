export type AmountSymbolPosition = 'start' | 'end' | 'none'

// prettier-ignore
export const numpadButtons = [
    1, 2, 3,
    4, 5, 6,
    7, 8, 9,
    '.', 0, 'backspace',
] as const

export type NumpadButtonValue = (typeof numpadButtons)[number]

export type FormattedAmounts = {
    formattedFiat: string
    formattedSats: string
    formattedBtc?: string
    formattedUsd: string
    formattedBitcoinAmount?: string
    formattedPrimaryAmount: string
    formattedSecondaryAmount: string
}
