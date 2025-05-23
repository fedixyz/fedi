import { TFunction } from 'i18next'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RequestInvoiceArgs } from 'webln'

import { FiatFXInfo } from '@fedi/common/types/bindings'

import {
    selectAmountInputType,
    selectBtcExchangeRate,
    selectBtcUsdExchangeRate,
    selectCurrency,
    selectCurrencyLocale,
    selectFederationBalance,
    selectMaxInvoiceAmount,
    selectMaxStableBalanceSats,
    selectMinimumDepositAmount,
    selectMinimumWithdrawAmountMsats,
    selectPaymentFederation,
    selectPaymentFederationBalance,
    selectShowFiatTxnAmounts,
    selectStabilityPoolAvailableLiquidity,
    selectStableBalanceSats,
    selectWithdrawableStableBalanceCents,
    selectWithdrawableStableBalanceMsats,
    setAmountInputType,
} from '../redux'
import {
    Btc,
    EcashRequest,
    Invoice,
    MSats,
    NonGenericCurrency,
    ParsedBip21,
    ParsedBitcoinAddress,
    ParsedLnurlPay,
    ParsedLnurlWithdraw,
    Sats,
    SelectableCurrency,
    SupportedCurrency,
    TransactionListEntry,
    UsdCents,
} from '../types'
import amountUtils from '../utils/AmountUtils'
import stringUtils from '../utils/StringUtils'
import { MeltSummary } from '../utils/cashu'
import { BridgeError, FedimintBridge } from '../utils/fedimint'
import { useCommonDispatch, useCommonSelector } from './redux'
import { useUpdatingRef } from './util'

interface RequestAmountArgs {
    lnurlWithdrawal?: ParsedLnurlWithdraw['data'] | null
    requestInvoiceArgs?: RequestInvoiceArgs | null
    ecashRequest?: EcashRequest | null
}

interface SendAmountArgs {
    btcAddress?: ParsedBitcoinAddress['data'] | null
    bip21Payment?: ParsedBip21['data'] | null
    invoice?: Invoice | null
    lnurlPayment?: ParsedLnurlPay['data'] | null
    selectedPaymentFederation?: boolean
    cashuMeltSummary?: MeltSummary | null
    t?: TFunction
}

export type FormattedAmounts = {
    formattedFiat: string
    formattedSats: string
    formattedUsd: string
    formattedPrimaryAmount: string
    formattedSecondaryAmount: string
}
export type AmountSymbolPosition = 'start' | 'end' | 'none'

// prettier-ignore
export const numpadButtons = [
    1, 2, 3,
    4, 5, 6,
    7, 8, 9,
    null, 0, 'backspace',
] as const

export type NumpadButtonValue = (typeof numpadButtons)[number]

export const useBtcFiatPrice = (currency?: SelectableCurrency) => {
    const selectedFiatCurrency = useCommonSelector(selectCurrency)
    const currencyLocale = useCommonSelector(selectCurrencyLocale)
    const exchangeRate: number = useCommonSelector(selectBtcExchangeRate)
    const btcUsdExchangeRate: number = useCommonSelector(
        selectBtcUsdExchangeRate,
    )

    const fiatCurrency = currency ?? selectedFiatCurrency

    return {
        convertCentsToFormattedFiat: useCallback(
            (cents: UsdCents, symbolPosition: AmountSymbolPosition = 'end') => {
                const amount = amountUtils.convertCentsToOtherFiat(
                    cents,
                    btcUsdExchangeRate,
                    exchangeRate,
                )
                return amountUtils.formatFiat(amount, fiatCurrency, {
                    symbolPosition,
                    locale: currencyLocale,
                })
            },
            [btcUsdExchangeRate, currencyLocale, exchangeRate, fiatCurrency],
        ),
        convertSatsToFiat: useCallback(
            (sats: Sats) => {
                return amountUtils.satToFiat(sats, exchangeRate)
            },
            [exchangeRate],
        ),
        convertSatsToCents: useCallback(
            (sats: Sats) => {
                return Math.round(
                    amountUtils.satToFiat(sats, btcUsdExchangeRate) * 100,
                ) as UsdCents
            },
            [btcUsdExchangeRate],
        ),
        convertSatsToFormattedFiat: useCallback(
            (
                sats: Sats,
                symbolPosition: AmountSymbolPosition = 'end',
                historicalFiatInfo?: FiatFXInfo,
            ) => {
                const conversionCurrency: SelectableCurrency =
                    historicalFiatInfo
                        ? (historicalFiatInfo.fiatCode as NonGenericCurrency)
                        : fiatCurrency
                const conversionRate = historicalFiatInfo
                    ? historicalFiatInfo.btcToFiatHundredths / 100
                    : exchangeRate
                const amount = amountUtils.satToFiat(sats, conversionRate)
                return amountUtils.formatFiat(amount, conversionCurrency, {
                    symbolPosition,
                    locale: currencyLocale,
                })
            },
            [exchangeRate, fiatCurrency, currencyLocale],
        ),

        convertSatsToFormattedUsd: useCallback(
            (sats: Sats, symbolPosition: AmountSymbolPosition = 'end') => {
                const amount = amountUtils.satToFiat(sats, btcUsdExchangeRate)
                return amountUtils.formatFiat(amount, SupportedCurrency.USD, {
                    symbolPosition,
                    locale: currencyLocale,
                })
            },
            [btcUsdExchangeRate, currencyLocale],
        ),
    }
}
export const useAmountFormatter = (currency?: SelectableCurrency) => {
    const { convertSatsToFormattedUsd, convertSatsToFormattedFiat } =
        useBtcFiatPrice(currency)
    const showFiatTxnAmounts = useCommonSelector(selectShowFiatTxnAmounts)

    const makeFormattedAmountsFromSats = useCallback(
        (
            amount: Sats,
            symbolPosition: AmountSymbolPosition = 'end',
        ): FormattedAmounts => {
            const formattedFiat = convertSatsToFormattedFiat(
                amount,
                symbolPosition,
            )
            const formattedUsd = convertSatsToFormattedUsd(
                amount,
                symbolPosition,
            )
            const formattedSats =
                symbolPosition === 'none'
                    ? amountUtils.formatSats(amount)
                    : `${amountUtils.formatSats(amount)} SATS`
            return {
                formattedFiat,
                formattedSats,
                formattedUsd,
                formattedPrimaryAmount: showFiatTxnAmounts
                    ? formattedFiat
                    : formattedSats,
                formattedSecondaryAmount: showFiatTxnAmounts
                    ? formattedSats
                    : formattedFiat,
            }
        },
        [
            convertSatsToFormattedFiat,
            convertSatsToFormattedUsd,
            showFiatTxnAmounts,
        ],
    )

    const makeFormattedAmountsFromMSats = useCallback(
        (
            amount: MSats,
            symbolPosition: AmountSymbolPosition = 'end',
        ): FormattedAmounts => {
            const sats = amountUtils.msatToSat(amount)
            return makeFormattedAmountsFromSats(sats, symbolPosition)
        },
        [makeFormattedAmountsFromSats],
    )

    const makeFormattedAmountsFromTxn = useCallback(
        (
            txn: TransactionListEntry,
            symbolPosition: AmountSymbolPosition = 'end',
        ): FormattedAmounts => {
            if (txn.txDateFiatInfo) {
                const sats = amountUtils.msatToSat(txn.amount)
                const formattedFiat = convertSatsToFormattedFiat(
                    sats,
                    symbolPosition,
                    txn.txDateFiatInfo,
                )
                const formattedUsd = convertSatsToFormattedUsd(
                    sats,
                    symbolPosition,
                )
                const formattedSats =
                    symbolPosition === 'none'
                        ? amountUtils.formatSats(sats)
                        : `${amountUtils.formatSats(sats)} SATS`
                return {
                    formattedFiat,
                    formattedSats,
                    formattedUsd,
                    formattedPrimaryAmount: showFiatTxnAmounts
                        ? formattedFiat
                        : formattedSats,
                    formattedSecondaryAmount: showFiatTxnAmounts
                        ? formattedSats
                        : formattedFiat,
                }
            } else {
                return makeFormattedAmountsFromMSats(txn.amount, symbolPosition)
            }
        },
        [
            convertSatsToFormattedFiat,
            convertSatsToFormattedUsd,
            makeFormattedAmountsFromMSats,
            showFiatTxnAmounts,
        ],
    )

    return {
        makeFormattedAmountsFromMSats,
        makeFormattedAmountsFromSats,
        makeFormattedAmountsFromTxn,
    }
}

/**
 * Provides state for rendering a balance amount in fiat and sats.
 */
export function useBalance() {
    const balance = useCommonSelector(selectFederationBalance) as MSats
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()

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
/**
 * Provides state, callbacks, and misc information for rendering an amount
 * input that allows entry in both fiat and sats.
 */
export function useAmountInput(
    amount: Sats,
    onChangeAmount?: (amount: Sats) => void,
    minimumAmount?: Sats | null,
    maximumAmount?: Sats | null,
) {
    const dispatch = useCommonDispatch()
    const btcToFiatRate = useCommonSelector(selectBtcExchangeRate)
    const btcToFiatRateRef = useUpdatingRef(btcToFiatRate)
    const currency = useCommonSelector(selectCurrency)
    const currencyLocale = useCommonSelector(selectCurrencyLocale)
    const defaultAmountInputType = useCommonSelector(selectAmountInputType)

    const [isFiat, _setIsFiat] = useState<boolean>(
        defaultAmountInputType !== 'sats',
    )

    const [satsValue, setSatsValue] = useState<string>(
        amountUtils.formatSats(amount),
    )
    const [fiatValue, setFiatValue] = useState<string>(
        amountUtils.formatFiat(
            amountUtils.satToFiat(amount, btcToFiatRate),
            currency,
            { symbolPosition: 'none', locale: currencyLocale },
        ),
    )

    const setIsFiat = useCallback(
        (value: boolean) => {
            _setIsFiat(value)
            dispatch(setAmountInputType(value ? 'fiat' : 'sats'))
        },
        [dispatch],
    )

    const clampSats = useCallback((value: number) => {
        if (Number.isNaN(value)) return 0 as Sats
        return Math.round(Math.max(0, value)) as Sats
    }, [])

    const handleChangeSats = useCallback(
        (value: string) => {
            // can be 1,000 or 1.000 or 1 000
            const thousandsSeparator = amountUtils.getThousandsSeparator({
                locale: currencyLocale,
            })
            // replacing periods requires a special regex
            let escapeSeparator = thousandsSeparator
            if (thousandsSeparator === '.') {
                escapeSeparator = '\\.'
            }
            const regex = new RegExp(escapeSeparator, 'g')
            const sats = clampSats(parseInt(value.replace(regex, ''), 10))
            const fiat = amountUtils.satToBtc(sats) * btcToFiatRateRef.current
            onChangeAmount && onChangeAmount(sats)
            setSatsValue(Intl.NumberFormat().format(sats))
            setFiatValue(
                amountUtils.formatFiat(fiat, currency, {
                    symbolPosition: 'none',
                    locale: currencyLocale,
                }),
            )
        },
        [currencyLocale, clampSats, btcToFiatRateRef, onChangeAmount, currency],
    )

    const handleChangeFiat = useCallback(
        (value: string) => {
            let fiat = amountUtils.parseFiatString(value, {
                locale: currencyLocale,
            })
            if (Number.isNaN(fiat) || fiat < 0) {
                fiat = 0
            }

            // If they've added or removed a sigdig, offset all numbers by a tens place
            const decimals = amountUtils.getCurrencyDecimals(currency, {
                locale: currencyLocale,
            })
            const decimalSeparator = amountUtils.getDecimalSeparator({
                locale: currencyLocale,
            })
            const valueDecimals = value.split(decimalSeparator)[1]?.length || 0
            if (valueDecimals > decimals) {
                fiat = fiat * 10
            } else if (valueDecimals < decimals) {
                fiat = fiat / 10
            }

            let sats = clampSats(
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

            onChangeAmount && onChangeAmount(sats)
            setFiatValue(
                amountUtils.formatFiat(fiat, currency, {
                    symbolPosition: 'none',
                    locale: currencyLocale,
                }),
            )
            setSatsValue(amountUtils.formatSats(sats))
        },
        [
            currencyLocale,
            currency,
            clampSats,
            btcToFiatRateRef,
            minimumAmount,
            maximumAmount,
            onChangeAmount,
        ],
    )

    const handleNumpadPress = useCallback(
        (button: (typeof numpadButtons)[number]) => {
            if (button === null) return
            const value = isFiat ? fiatValue : satsValue
            const handleChange = isFiat ? handleChangeFiat : handleChangeSats
            const maxSatLength = maximumAmount?.toString().length
            const satsValueLength = satsValue
                .split('')
                .filter(c => /[0-9]/.test(c)).length

            if (button === 'backspace') {
                handleChange(value.slice(0, -1))
            } else if (
                typeof maxSatLength === 'number'
                    ? satsValueLength <= maxSatLength
                    : true
            ) {
                handleChange(`${value}${button}`)
            }
        },
        [
            isFiat,
            fiatValue,
            satsValue,
            handleChangeFiat,
            handleChangeSats,
            maximumAmount,
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

/**
 * Get the minimum and maximum amount you can receive. Optionally take in an
 * LNURL withdrawal, WebLN invoice request, or ecash request as part of the calculation.
 */
export function useMinMaxRequestAmount({
    lnurlWithdrawal,
    requestInvoiceArgs,
    ecashRequest,
}: RequestAmountArgs = {}) {
    const maxInvoiceAmount = useCommonSelector(selectMaxInvoiceAmount)

    return useMemo(() => {
        let minimumAmount = 1 as Sats
        let maximumAmount = maxInvoiceAmount
        if (lnurlWithdrawal) {
            if (lnurlWithdrawal.minWithdrawable) {
                minimumAmount = Math.max(
                    amountUtils.msatToSat(lnurlWithdrawal.minWithdrawable),
                    minimumAmount,
                ) as Sats
            }
            if (lnurlWithdrawal.maxWithdrawable) {
                maximumAmount = Math.min(
                    amountUtils.msatToSat(lnurlWithdrawal.maxWithdrawable),
                    maximumAmount,
                ) as Sats
            }
        }
        if (requestInvoiceArgs) {
            if (requestInvoiceArgs.minimumAmount) {
                minimumAmount = Math.max(
                    parseInt(requestInvoiceArgs.minimumAmount as string, 10),
                    minimumAmount,
                ) as Sats
            }
            if (requestInvoiceArgs.maximumAmount) {
                maximumAmount = Math.min(
                    parseInt(requestInvoiceArgs.maximumAmount as string, 10),
                    maximumAmount,
                ) as Sats
            }
        }
        if (ecashRequest) {
            maximumAmount = 1_000_000_000_000_000 as Sats // MAX_SAFE_INTEGER rounded down
            if (ecashRequest.minimumAmount) {
                minimumAmount = Math.max(
                    parseInt(ecashRequest.minimumAmount as string, 10),
                    minimumAmount,
                ) as Sats
            }
            if (ecashRequest.maximumAmount) {
                maximumAmount = Math.min(
                    parseInt(ecashRequest.maximumAmount as string, 10),
                    maximumAmount,
                ) as Sats
            }
        }
        return { minimumAmount, maximumAmount }
    }, [maxInvoiceAmount, lnurlWithdrawal, requestInvoiceArgs, ecashRequest])
}

/**
 * Get the minimum and maximum amount you can send. Optionally take in an
 * LNURL pay request as part of the calculation.
 */
export function useMinMaxSendAmount(
    {
        invoice,
        lnurlPayment,
        cashuMeltSummary,
        selectedPaymentFederation,
        btcAddress,
        fedimint,
    }: SendAmountArgs & { fedimint?: FedimintBridge } = {},
    // TODO: Remove this option in favor of always using payFromFederation once
    // https://github.com/fedibtc/fedi/issues/4070 is finished
) {
    const [maxAmountOnchain, setMaxAmountOnchain] = useState<Sats | null>(null)
    const paymentFederation = useCommonSelector(selectPaymentFederation)
    const balance = useCommonSelector(s =>
        selectedPaymentFederation
            ? selectPaymentFederationBalance(s)
            : selectFederationBalance(s),
    )

    const invoiceAmount = invoice?.amount
    const { minSendable, maxSendable } = lnurlPayment || {}

    useEffect(() => {
        if (!btcAddress || !paymentFederation || !fedimint) return

        // Attempts to preview the payment address with the full user balance
        // Should always result in an insufficient balance error
        fedimint
            .previewPayAddress(
                btcAddress.address,
                amountUtils.msatToSat(paymentFederation.balance),
                paymentFederation.id,
            )
            .catch(e => {
                if (
                    e instanceof BridgeError &&
                    e.errorCode &&
                    typeof e.errorCode === 'object' &&
                    'insufficientBalance' in e.errorCode &&
                    typeof e.errorCode.insufficientBalance === 'number'
                ) {
                    setMaxAmountOnchain(
                        amountUtils.msatToSat(e.errorCode.insufficientBalance),
                    )
                }
            })
    }, [paymentFederation, btcAddress, fedimint])

    return useMemo(() => {
        if (balance < 1000)
            return {
                // If balance is less than 1000 msat, set the minimum to invoiceAmount, if not undefined
                // Otherwise, set minimum to 1 sat
                minimumAmount: invoiceAmount
                    ? amountUtils.msatToSat(invoiceAmount)
                    : (1 as Sats),
                maximumAmount: 0 as Sats,
            }

        let minimumAmount = 1 as Sats // Cannot send millisat amounts
        let maximumAmount = amountUtils.msatToSat(balance)

        if (cashuMeltSummary) {
            minimumAmount = amountUtils.msatToSat(cashuMeltSummary.totalAmount)
        } else if (invoiceAmount) {
            minimumAmount = amountUtils.msatToSat(invoiceAmount)
        } else {
            if (minSendable) {
                minimumAmount = amountUtils.msatToSat(minSendable)
            }
            if (maxSendable) {
                maximumAmount = Math.min(
                    amountUtils.msatToSat(maxSendable),
                    maximumAmount || Infinity,
                ) as Sats
            }

            if (btcAddress && maxAmountOnchain !== null) {
                maximumAmount = Math.min(
                    maximumAmount,
                    maxAmountOnchain,
                ) as Sats
            }
        }
        return { minimumAmount, maximumAmount }
    }, [
        balance,
        cashuMeltSummary,
        invoiceAmount,
        minSendable,
        maxSendable,
        maxAmountOnchain,
        btcAddress,
    ])
}

/**
 * Get the minimum and maximum amount you can withdraw from the stable balance
 */
export function useMinMaxWithdrawAmount() {
    const minimumMsats = useCommonSelector(selectMinimumWithdrawAmountMsats)
    const withdrawableMsats = useCommonSelector(
        selectWithdrawableStableBalanceMsats,
    )
    const minimumAmount = amountUtils.msatToSat(minimumMsats)
    const maximumAmount = amountUtils.msatToSat(withdrawableMsats)

    return { minimumAmount, maximumAmount }
}

/**
 * Get the minimum and maximum amount you can deposit to the stable balance
 */
export function useMinMaxDepositAmount() {
    const minimumAmount = useCommonSelector(selectMinimumDepositAmount)
    const balanceMSats = useCommonSelector(selectFederationBalance)
    const balanceSats = amountUtils.msatToSat(balanceMSats)
    const stableBalanceSats = useCommonSelector(selectStableBalanceSats)
    const maxStableBalanceSats = useCommonSelector(selectMaxStableBalanceSats)
    const stabilityPoolAvailableLiquidity = useCommonSelector(
        selectStabilityPoolAvailableLiquidity,
    )
    const availableLiquiditySats = stabilityPoolAvailableLiquidity
        ? amountUtils.msatToSat(stabilityPoolAvailableLiquidity)
        : 0

    // ref: https://github.com/fedibtc/fedi/pull/5654/files#r1842633164
    const maximumAmount = Math.min(
        // User's current bitcoin wallet balance
        balanceSats,
        // Available liquidity in the stability pool
        availableLiquiditySats,
        // Maximum stable balance allowed minus the user's current stable balance
        maxStableBalanceSats - stableBalanceSats,
    ) as Sats

    return { minimumAmount, maximumAmount }
}

/**
 * Provide all the state necessary to implement a request form that generates
 * a Lightning invoice. Optionally provide a set of WebLN requestInvoice args
 * or an LNURL withdrawal.
 */
export function useRequestForm(args: RequestAmountArgs = {}) {
    const { minimumAmount, maximumAmount } = useMinMaxRequestAmount(args)
    const [inputAmount, setInputAmount] = useState(
        getDefaultRequestAmount(args),
    )
    const [memo, setMemo] = useState(getDefaultRequestMemo(args))
    const argsRef = useUpdatingRef(args)

    const reset = useCallback(() => {
        setInputAmount(getDefaultRequestAmount(argsRef.current))
        setMemo(getDefaultRequestMemo(argsRef.current))
    }, [argsRef])

    // Determine if they should be able to change the amount, or if an exact
    // amount is requested.
    let exactAmount: Sats | undefined = undefined
    if (
        args.lnurlWithdrawal &&
        args.lnurlWithdrawal.minWithdrawable &&
        args.lnurlWithdrawal.minWithdrawable ===
            args.lnurlWithdrawal.maxWithdrawable
    ) {
        exactAmount = amountUtils.msatToSat(
            args.lnurlWithdrawal.minWithdrawable,
        )
    }
    if (args.requestInvoiceArgs?.amount) {
        exactAmount = parseInt(
            args.requestInvoiceArgs.amount as string,
            10,
        ) as Sats
    }

    if (args.ecashRequest?.amount) {
        exactAmount = parseInt(args.ecashRequest.amount as string, 10) as Sats
    }

    return {
        inputAmount,
        setInputAmount,
        memo,
        setMemo,
        exactAmount,
        minimumAmount,
        maximumAmount,
        reset,
    }
}

function getDefaultRequestAmount({
    requestInvoiceArgs,
    lnurlWithdrawal,
    ecashRequest,
}: RequestAmountArgs) {
    if (lnurlWithdrawal?.maxWithdrawable) {
        return amountUtils.msatToSat(lnurlWithdrawal?.maxWithdrawable)
    }
    if (requestInvoiceArgs?.amount) {
        return parseInt(requestInvoiceArgs.amount as string, 10) as Sats
    }
    if (requestInvoiceArgs?.defaultAmount) {
        return parseInt(requestInvoiceArgs.defaultAmount as string, 10) as Sats
    }
    if (ecashRequest?.amount) {
        return parseInt(ecashRequest.amount as string, 10) as Sats
    }
    if (ecashRequest?.defaultAmount) {
        return parseInt(ecashRequest.defaultAmount as string, 10) as Sats
    }
    return 0 as Sats
}

function getDefaultRequestMemo({
    requestInvoiceArgs,
    lnurlWithdrawal,
}: RequestAmountArgs) {
    if (lnurlWithdrawal?.defaultDescription) {
        return lnurlWithdrawal.defaultDescription
    }
    if (requestInvoiceArgs?.defaultMemo) {
        return requestInvoiceArgs.defaultMemo
    }
    return ''
}

/**
 * Provide all the state necessary to implement a pay form that generates
 * a Lightning invoice. Optionally provide an LNURL pay request.
 */
export function useSendForm({
    btcAddress,
    bip21Payment,
    invoice,
    lnurlPayment,
    selectedPaymentFederation,
    cashuMeltSummary,
    t,
    fedimint,
}: SendAmountArgs & { fedimint?: FedimintBridge }) {
    const [inputAmount, setInputAmount] = useState<Sats>(0 as Sats)
    if (!t) throw new Error('useSendForm requires a t function')
    const { minimumAmount, maximumAmount } = useMinMaxSendAmount({
        invoice,
        lnurlPayment,
        btcAddress,
        selectedPaymentFederation,
        cashuMeltSummary,
        t,
        fedimint,
    })
    const minimumAmountRef = useUpdatingRef(minimumAmount)

    // Determine if they should be able to change the amount, or if an exact
    // amount is requested.
    let exactAmount: Sats | undefined = undefined
    let description: string | undefined
    let sendTo: string | undefined
    if (invoice) {
        exactAmount = amountUtils.msatToSat(invoice.amount)
        description = invoice.description
        sendTo = stringUtils.truncateMiddleOfString(invoice.invoice, 8)
    } else if (
        lnurlPayment &&
        lnurlPayment.minSendable &&
        lnurlPayment.minSendable === lnurlPayment.maxSendable
    ) {
        exactAmount = amountUtils.msatToSat(lnurlPayment.minSendable)
        description = lnurlPayment.description
    } else if (bip21Payment && bip21Payment.amount) {
        exactAmount = amountUtils.btcToSat(bip21Payment.amount)
        description = bip21Payment.message
        sendTo = stringUtils.truncateMiddleOfString(bip21Payment.address, 8)
    } else if (btcAddress) {
        sendTo = stringUtils.truncateMiddleOfString(btcAddress.address, 8)
    } else if (cashuMeltSummary) {
        exactAmount = amountUtils.msatToSat(cashuMeltSummary.totalAmount)
        description = t('feature.omni.confirm-melt-cashu')
        // totalFees = amountUtils.msatToSat(cashuMeltSummary.totalFees)
    }

    const reset = useCallback(() => {
        setInputAmount(minimumAmountRef.current)
    }, [minimumAmountRef])

    return {
        inputAmount,
        setInputAmount,
        description,
        sendTo,
        exactAmount,
        minimumAmount,
        maximumAmount,
        reset,
    }
}

/**
 * Provide all the state necessary to implement a stabilitypool withdrawal form
 * that decreases the stable USD balance in the wallet
 */
export function useWithdrawForm() {
    const [inputAmount, setInputAmount] = useState<Sats>(0 as Sats)
    const [inputFiatAmount, setInputFiatAmount] = useState<UsdCents>(
        0 as UsdCents,
    )
    const { minimumAmount, maximumAmount } = useMinMaxWithdrawAmount()
    const maximumFiatCents = useCommonSelector(
        selectWithdrawableStableBalanceCents,
    )

    const { convertCentsToFormattedFiat, convertSatsToCents } =
        useBtcFiatPrice()

    const maximumFiatAmount = convertCentsToFormattedFiat(maximumFiatCents)
    const inputAmountCents = convertSatsToCents(inputAmount)

    return {
        inputAmount,
        inputAmountCents,
        setInputAmount,
        inputFiatAmount,
        setInputFiatAmount,
        minimumAmount,
        maximumAmount,
        maximumFiatAmount,
    }
}

/**
 * Provide all the state necessary to implement a stabilitypool deposit form
 * that increases the stable USD balance in the wallet
 */
export function useDepositForm() {
    const { convertSatsToFormattedFiat } = useBtcFiatPrice()
    const [inputAmount, setInputAmount] = useState<Sats>(0 as Sats)
    const { minimumAmount, maximumAmount } = useMinMaxDepositAmount()
    const maximumFiatAmount = convertSatsToFormattedFiat(maximumAmount)

    return {
        inputAmount,
        setInputAmount,
        minimumAmount,
        maximumAmount,
        maximumFiatAmount,
    }
}

/**
 * Provides a string displaying the balance as both fiat and sat.
 */
export function useBalanceDisplay(t: TFunction) {
    const { formattedBalance } = useBalance()

    return `${t('words.balance')}: ${formattedBalance}`
}
