import { useCallback, useMemo, useRef, useState } from 'react'

import {
    selectAmountInputType,
    selectBtcExchangeRate,
    selectCurrency,
    selectCurrencyLocale,
    setAmountInputType,
} from '../../redux'
import { Btc, Federation, Sats } from '../../types'
import { numpadButtons } from '../../types/amount'
import amountUtils from '../../utils/AmountUtils'
import { useCommonDispatch, useCommonSelector } from '../redux'
import { useUpdatingRef } from '../util'

/**
 * A hook containing the logic for an amount input, usually used within an `<AmountInput />` component in either the `web` or `native` codebase.
 *
 * You probably won't use this hook directly. See `native/components/ui/AmountInput.tsx` and `web/src/components/AmountInput.tsx` for more information.
 */
export function useAmountInput(
    amount: Sats,
    onChangeAmount?: (amount: Sats) => void,
    minimumAmount?: Sats | null,
    maximumAmount?: Sats | null,
    federationId?: Federation['id'],
) {
    const dispatch = useCommonDispatch()
    const currency = useCommonSelector(s => selectCurrency(s, federationId))
    const btcToFiatRate = useCommonSelector(s =>
        selectBtcExchangeRate(s, currency, federationId || ''),
    )
    const btcToFiatRateRef = useUpdatingRef(btcToFiatRate)
    const currencyLocale = useCommonSelector(selectCurrencyLocale)
    const defaultAmountInputType = useCommonSelector(selectAmountInputType)

    const [isFiat, _setIsFiat] = useState<boolean>(
        defaultAmountInputType !== 'sats',
    )

    const [satsValue, setSatsValue] = useState<string>(
        amountUtils.formatSats(amount),
    )

    const [fiatValue, setFiatValue] = useState<string>(() => {
        const fiatAmount = amountUtils.satToFiat(amount, btcToFiatRate)
        return amountUtils.formatFiat(fiatAmount, currency, {
            symbolPosition: 'none',
            locale: currencyLocale,
            // show X USD instead of X.00 USD for initial render
            // only truncates if we don't lose decimal precision
            ...(fiatAmount === Number(Math.floor(fiatAmount).toFixed(0))
                ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
                : {}),
        })
    })

    const setIsFiat = useCallback(
        (value: boolean) => {
            _setIsFiat(value)
            dispatch(setAmountInputType(value ? 'fiat' : 'sats'))
        },
        [dispatch],
    )

    const handleChangeSats = useCallback(
        (value: string) => {
            const sats = amountUtils.stripSatsValue(value, currency)
            const fiat = amountUtils.satToBtc(sats) * btcToFiatRateRef.current
            onChangeAmount && onChangeAmount(sats)
            setSatsValue(amountUtils.formatSats(sats))
            setFiatValue(
                amountUtils.formatFiat(fiat, currency, {
                    symbolPosition: 'none',
                    locale: currencyLocale,
                }),
            )
        },
        [currency, btcToFiatRateRef, onChangeAmount, currencyLocale],
    )

    const handleChangeFiat = useCallback(
        (value: string) => {
            const decimalSeparator = amountUtils.getDecimalSeparator({
                locale: currencyLocale,
            })
            let fiat: number

            // If the input is empty, default to 0.
            if (value === '') {
                fiat = 0
            } else if (!value.includes(decimalSeparator)) {
                // If there's no decimal separator, parse as whole units.
                fiat = parseInt(value, 10)
                if (Number.isNaN(fiat) || fiat < 0) fiat = 0
            } else {
                // Otherwise, handle it as a normal fiat string with decimals.
                fiat = amountUtils.parseFiatString(value, {
                    locale: currencyLocale,
                })
                if (Number.isNaN(fiat) || fiat < 0) {
                    fiat = 0
                }

                // Adjust for sig digs if user changed decimal places
                const decimals = amountUtils.getCurrencyDecimals(currency, {
                    locale: currencyLocale,
                })
                const valueDecimals =
                    value.split(decimalSeparator)[1]?.length || 0
                if (valueDecimals > decimals) {
                    fiat = fiat * 10
                } else if (valueDecimals < decimals) {
                    fiat = fiat / 10
                }
            }

            // Convert to sats and clamp
            let sats = amountUtils.clampSats(
                amountUtils.btcToSat((fiat / btcToFiatRateRef.current) as Btc),
            )

            // If the amount is being entered as fiat, the equivalent amount in sats
            // will sometimes be slightly above or below the min/max (in sats)
            // UX expectation is that the entered amount is exactly equal to the min/max amount
            // This logic ensures to round the min/max (in fiat) down to the nearest 0.01 to
            // include the entered amount into the rounding threshold to qualify as a min/max input
            if (typeof minimumAmount === 'number') {
                const minFiat =
                    amountUtils.satToBtc(minimumAmount as Sats) *
                    btcToFiatRateRef.current
                if (
                    Number(minFiat.toFixed(2)) === Number(fiat.toFixed(2)) &&
                    fiat > 0
                ) {
                    sats = minimumAmount
                }
            }
            if (typeof maximumAmount === 'number') {
                const maxFiat =
                    amountUtils.satToBtc(maximumAmount as Sats) *
                    btcToFiatRateRef.current
                if (
                    Number(maxFiat.toFixed(2)) === Number(fiat.toFixed(2)) &&
                    fiat > 0
                ) {
                    sats = maximumAmount
                }
            }

            // Notify parent and update display values
            onChangeAmount && onChangeAmount(sats)
            setFiatValue(
                // Format without decimals if user didn't type a separator
                !value.includes(decimalSeparator)
                    ? amountUtils.formatFiat(fiat, currency, {
                          symbolPosition: 'none',
                          locale: currencyLocale,
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                      })
                    : amountUtils.formatFiat(fiat, currency, {
                          symbolPosition: 'none',
                          locale: currencyLocale,
                      }),
            )
            setSatsValue(amountUtils.formatSats(sats))
        },
        [
            currencyLocale,
            currency,
            btcToFiatRateRef,
            minimumAmount,
            maximumAmount,
            onChangeAmount,
        ],
    )

    // Keeps track of the current index (cursor) within the fractional part of the number
    const fractionIndexRef = useRef(0)

    const rejectExtraKey = (): boolean => {
        /* pure helper – no platform code */
        return true
    }

    /**
     * Handles presses on the on‑screen num‑pad (digits, decimal separator or backspace).
     *
     * Locale quirks handled:
     * ──────────────────────────────────────────────────────────────
     * Some hardware / soft keyboards always emit a dot ('.') regardless of locale.
     * When the active locale’s decimal separator is a comma (','), we translate that
     * dot into a comma so the rest of the logic can stay locale‑agnostic.
     */
    const handleNumpadPress = useCallback(
        (
            /** The raw button value coming from the on‑screen key */
            rawBtn: (typeof numpadButtons)[number],
        ) => {
            //guard - ignore nulls (should never happen)
            if (rawBtn === null) return false

            // Locale‑aware decimal separator ('.' for en‑US, ',' for de‑DE …)
            const decimalSeparator = amountUtils.getDecimalSeparator({
                locale: currencyLocale,
            })

            /*
             * Map hardware dot to the locale separator when they differ.
             * Some keyboards always emit '.', even on comma locales.
             */
            const button =
                rawBtn === '.' && decimalSeparator !== '.'
                    ? (decimalSeparator as typeof rawBtn)
                    : rawBtn

            /**
             * ----------------------------------------------------------------------------
             * Sanitize input: keep *only* digits and the locale decimal separator
             * ----------------------------------------------------------------------------
             * Regex: /[^0-9${decimalSeparator}]/g
             *   [^ … ]  → "any char *not* inside this set"
             *   0-9     → digits 0 through 9 stay untouched
             *   ${decimalSeparator} → the active separator ('.' or ',') is kept
             *   g‑flag → replace *all* unwanted chars, not just the first one
             * The result is a clean string that contains at most one separator
             * (we control insertion elsewhere) and only numeric characters.
             */
            const sanitise = (v: string) =>
                v.replace(new RegExp(`[^0-9${decimalSeparator}]`, 'g'), '')

            const handleNoDecimals = (rawValue: string) => {
                if (button === 'backspace') {
                    handleChangeFiat(rawValue.slice(0, -1) || '0')
                    return false
                }
                if (button === decimalSeparator) {
                    return rejectExtraKey() // separator not allowed
                }
                handleChangeFiat(
                    rawValue === '0' ? String(button) : rawValue + button,
                )
                return false
            }

            const handleSeparator = (rawValue: string, maxDecimals: number) => {
                if (!rawValue.includes(decimalSeparator)) {
                    handleChangeFiat(
                        rawValue + decimalSeparator + '0'.repeat(maxDecimals),
                    )
                }
                // place cursor at first decimal slot
                fractionIndexRef.current = 0
                return false
            }

            const handleBackspace = (rawValue: string, maxDecimals: number) => {
                if (rawValue.includes(decimalSeparator)) {
                    const [whole, fractionRaw = ''] =
                        rawValue.split(decimalSeparator)
                    const fractionArr = (fractionRaw + '0'.repeat(maxDecimals))
                        .slice(0, maxDecimals)
                        .split('')

                    /*
                     * When switching from sats → fiat the cursor may still be
                     * at 0 while both fraction digits are non‑zero. In that
                     * case start deleting from the *rightmost* digit.
                     */
                    if (
                        fractionIndexRef.current === 0 &&
                        fractionArr.some(d => d !== '0')
                    ) {
                        fractionIndexRef.current = maxDecimals
                    }

                    // Move cursor one step left (but not below 0)
                    if (fractionIndexRef.current > 0)
                        fractionIndexRef.current -= 1

                    // Zero‑out the digit under the cursor
                    fractionArr[fractionIndexRef.current] = '0'
                    const newFraction = fractionArr.join('')

                    if (
                        newFraction === '0'.repeat(maxDecimals) &&
                        fractionIndexRef.current === 0
                    ) {
                        // drop decimal section entirely
                        handleChangeFiat(whole)
                    } else {
                        handleChangeFiat(
                            `${whole}${decimalSeparator}${newFraction}`,
                        )
                    }
                } else {
                    // Deleting in the whole part
                    const newWhole = rawValue.slice(0, -1) || '0'
                    handleChangeFiat(newWhole)
                }

                return false
            }

            const handleDigit = (rawValue: string, maxDecimals: number) => {
                if (rawValue.includes(decimalSeparator)) {
                    /* Already have a separator → edit the fraction part */
                    if (fractionIndexRef.current >= maxDecimals) {
                        return rejectExtraKey() // reject when precision limit hit
                    }

                    const [whole, fractionRaw = ''] =
                        rawValue.split(decimalSeparator)
                    const fractionArr = (fractionRaw + '0'.repeat(maxDecimals))
                        .slice(0, maxDecimals)
                        .split('')

                    if (fractionIndexRef.current < maxDecimals) {
                        fractionArr[fractionIndexRef.current] = String(button)
                        fractionIndexRef.current += 1
                    } else {
                        fractionArr[maxDecimals - 1] = String(button)
                    }

                    handleChangeFiat(
                        `${whole}${decimalSeparator}${fractionArr.join('')}`,
                    )
                } else {
                    handleChangeFiat(
                        rawValue === '0' ? String(button) : rawValue + button,
                    )
                }
                return false
            }

            /*
             * Main decision tree
             */

            //Fiat Mode
            if (isFiat) {
                // Maximum number of decimals allowed for this currency
                const maxDecimals = amountUtils.getCurrencyDecimals(currency, {
                    locale: currencyLocale,
                })

                const rawValue = sanitise(fiatValue)

                if (maxDecimals === 0) {
                    return handleNoDecimals(rawValue)
                }
                if (button === decimalSeparator)
                    return handleSeparator(rawValue, maxDecimals)
                if (button === 'backspace')
                    return handleBackspace(rawValue, maxDecimals)
                return handleDigit(rawValue, maxDecimals) // finished fiat branch
            }

            //Int only BTC Modes
            const rawSats = satsValue.replace(/[^0-9]/g, '')
            if (button === 'backspace') {
                handleChangeSats(rawSats.slice(0, -1))
            } else {
                handleChangeSats(
                    rawSats === '0' ? String(button) : rawSats + button,
                )
            }
            return false
        },
        [
            isFiat,
            fiatValue,
            satsValue,
            handleChangeFiat,
            handleChangeSats,
            currency,
            currencyLocale,
        ],
    )

    const currencySymbol = useMemo(
        () => amountUtils.getCurrencySymbol(currency),
        [currency],
    )

    const validation = useMemo(() => {
        if (typeof maximumAmount === 'number' && amount > maximumAmount) {
            return {
                i18nKey: 'errors.invalid-amount-max',
                amount: maximumAmount,
                fiatValue: amountUtils.satToFiat(
                    maximumAmount,
                    btcToFiatRateRef.current,
                ),
                onlyShowOnSubmit: false,
            } as const
        }
        if (typeof minimumAmount === 'number' && amount < minimumAmount) {
            return {
                i18nKey: 'errors.invalid-amount-min',
                amount: minimumAmount,
                fiatValue: amountUtils.satToFiat(
                    minimumAmount,
                    btcToFiatRateRef.current,
                ),
                onlyShowOnSubmit: true,
            } as const
        }
    }, [amount, btcToFiatRateRef, minimumAmount, maximumAmount])

    return {
        isFiat,
        setIsFiat,
        satsValue,
        fiatValue,
        handleChangeFiat,
        handleChangeSats,
        currency,
        currencySymbol,
        currencyLocale,
        numpadButtons,
        handleNumpadPress,
        validation,
    }
}
