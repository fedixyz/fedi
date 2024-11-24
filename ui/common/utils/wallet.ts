import { TFunction } from 'i18next'

import { AmountSymbolPosition, FormattedAmounts } from '../hooks/amount'
import { FeeItem } from '../hooks/transactions'
import {
    MSats,
    SupportedCurrency,
    Transaction,
    TransactionDirection,
    UsdCents,
} from '../types'
import dateUtils from './DateUtils'

export interface DetailItem {
    label: string
    value: string
    truncated?: boolean
    copyable?: boolean
    copiedMessage?: string
}

export const makePendingBalanceText = (
    t: TFunction,
    pendingBalance: number,
    formattedAmount: string,
): string => {
    if (pendingBalance > 0) {
        return t('feature.stabilitypool.deposit-pending', {
            amount: formattedAmount,
        })
    } else {
        return t('feature.stabilitypool.withdrawal-pending', {
            amount: formattedAmount,
        })
    }
}

export const makeTxnDetailStatusText = (
    t: TFunction,
    txn: Transaction,
): string => {
    switch (txn.direction) {
        case TransactionDirection.send:
            if (txn.lightning) {
                // TODO: confirm if this is even reachable/needed since it's
                // possible refunds or any other failed LN sends may just have
                // direction=receive instead of direction=send
                switch (txn.lnState?.type) {
                    case 'waitingForRefund':
                        return t('feature.send.waiting-for-refund')
                    case 'canceled':
                    case 'refunded':
                    case 'failed':
                        return t('words.failed')
                    default:
                        return t('phrases.sent-bitcoin')
                }
            } else if (txn.bitcoin) {
                switch (txn.onchainState?.type) {
                    case 'succeeded':
                        return t('phrases.sent-bitcoin')
                    case 'failed':
                        return t('words.failed')
                    default:
                        return t('words.pending')
                }
            } else if (txn.stabilityPoolState) {
                switch (txn.stabilityPoolState.type) {
                    case 'pendingDeposit':
                        return t('words.pending')
                    case 'completeDeposit':
                        return t('words.complete')
                    default:
                        return t('phrases.sent-bitcoin')
                }
            } else {
                return t('phrases.sent-bitcoin')
            }
        case TransactionDirection.receive:
            if (txn.lightning) {
                if (!txn.lnState) return `${t('phrases.receive-pending')}`
                switch (txn.lnState.type) {
                    case 'waitingForRefund':
                        return t('feature.send.waiting-for-refund')
                    case 'refunded':
                        return t('words.refund')
                    case 'waitingForPayment':
                        return t('words.pending')
                    case 'claimed':
                        return t('words.complete')
                    case 'canceled':
                        return t('words.expired')
                    default:
                        return txn.lnState.type || ''
                }
            } else if (txn.bitcoin) {
                switch (txn.onchainState?.type) {
                    case 'waitingForTransaction':
                        return t('words.pending')
                    case 'waitingForConfirmation':
                        return t('words.seen')
                    case 'confirmed':
                        return t('words.seen')
                    case 'claimed':
                        return t('words.complete')
                    default:
                        return t('phrases.receive-pending')
                }
            } else if (txn.stabilityPoolState) {
                switch (txn.stabilityPoolState?.type) {
                    case 'pendingWithdrawal':
                        return t('words.pending')
                    case 'completeWithdrawal':
                        return t('words.complete')
                    default:
                        return ''
                }
            } else {
                return t('words.received')
            }
        default:
            return t('words.unknown')
    }
}

export const makeTxnDetailTitleText = (
    t: TFunction,
    txn: Transaction,
): string => {
    if (txn.direction === TransactionDirection.send) {
        return t('feature.send.you-sent')
    }
    if (txn.lightning) {
        if (!txn.lnState) return `${t('phrases.receive-pending')}`
        switch (txn.lnState.type) {
            case 'waitingForPayment':
                return t('phrases.receive-pending')
            case 'claimed':
                return t('feature.receive.you-received')
            case 'canceled':
                return t('words.expired')
            default:
                return t('phrases.receive-pending')
        }
    } else if (txn.bitcoin) {
        switch (txn.onchainState?.type) {
            case 'waitingForTransaction':
                return t('phrases.bitcoin-address-created')
            case 'claimed':
                return t('feature.receive.you-received')
            default:
                return t('phrases.receive-pending')
        }
    } else if (txn.stabilityPoolState) {
        switch (txn.stabilityPoolState?.type) {
            case 'pendingWithdrawal':
                return t('phrases.receive-pending')
            case 'completeWithdrawal':
                return t('feature.receive.you-received')
            default:
                return t('phrases.receive-pending')
        }
    } else {
        return t('feature.receive.you-received')
    }
}

export const makeTxnNotesText = (
    t: TFunction,
    txn: Transaction,
    currency: SupportedCurrency | undefined = SupportedCurrency.USD,
): string => {
    // always render user-submitted notes first
    if (txn.notes) return txn.notes

    // if notes is empty, some txn types can render placeholder text here
    if (txn.stabilityPoolState) {
        if (
            txn.stabilityPoolState.type === 'pendingDeposit' ||
            txn.stabilityPoolState.type === 'completeDeposit'
        ) {
            // indicate stabilitypool deposits
            return t('feature.stabilitypool.deposit-to-balance', {
                currency,
            })
        } else if (
            txn.stabilityPoolState.type === 'pendingWithdrawal' ||
            txn.stabilityPoolState.type === 'completeWithdrawal'
        ) {
            // indicate stabilitypool withdrawals
            return t('feature.stabilitypool.withdrawal-from-balance', {
                currency,
            })
        }
    }
    // indicate bitcoin addresses that do not yet have an onchain txid
    if (
        txn.direction === TransactionDirection.receive &&
        txn.bitcoin &&
        txn.onchainState?.type === 'waitingForTransaction'
    ) {
        return t('phrases.bitcoin-address-created')
    }
    return ''
}

export const makeTxnAmountText = (
    txn: Transaction,
    showFiatTxnAmounts: boolean,
    makeFormattedAmountsFromMSats: (
        amt: MSats,
        symbolPosition?: AmountSymbolPosition,
    ) => FormattedAmounts,
    convertCentsToFormattedFiat: (
        amt: UsdCents,
        symbolPosition?: AmountSymbolPosition,
    ) => string,
): string => {
    const { amount, direction } = txn

    let sign = direction ? (direction === 'receive' ? `+` : `-`) : ''

    const { formattedPrimaryAmount } = makeFormattedAmountsFromMSats(
        amount,
        'none',
    )
    let formattedAmount: string = formattedPrimaryAmount

    // amount may be zero for onchain pending receives or for pending stabilitypool withdrawals
    if (txn.bitcoin && txn.onchainState?.type === 'waitingForTransaction') {
        sign = `~`
        formattedAmount = ''
    }

    if (txn.lnState?.type === 'canceled') {
        sign = ''
    }

    if (txn.stabilityPoolState && showFiatTxnAmounts) {
        if ('estimated_withdrawal_cents' in txn.stabilityPoolState) {
            const estimatedWithdrawalCents = Number(
                txn.stabilityPoolState.estimated_withdrawal_cents,
            ) as UsdCents
            formattedAmount = convertCentsToFormattedFiat(
                estimatedWithdrawalCents,
                'none',
            )
        } else if ('initial_amount_cents' in txn.stabilityPoolState) {
            const initialAmountCents = Number(
                txn.stabilityPoolState.initial_amount_cents,
            ) as UsdCents
            formattedAmount = convertCentsToFormattedFiat(
                initialAmountCents,
                'none',
            )
        }
    }

    return `${sign}${formattedAmount}`
}

export const makeTxnStatusText = (t: TFunction, txn: Transaction): string => {
    switch (txn.direction) {
        case TransactionDirection.send:
            if (txn.lightning) {
                // TODO: confirm if this is even reachable/needed since it's
                // possible refunds or any other failed LN sends may just have
                // direction=receive instead of direction=send
                switch (txn.lnState?.type) {
                    case 'waitingForRefund':
                        return t('phrases.refund-pending')
                    case 'success':
                        return t('phrases.sent-bitcoin')
                    case 'created':
                    case 'funded':
                        return t('words.pending')
                    case 'canceled':
                    case 'refunded':
                    case 'failed':
                        return t('words.failed')
                    default:
                        return t('phrases.sent-bitcoin')
                }
            } else if (txn.bitcoin) {
                switch (txn.onchainState?.type) {
                    case 'failed':
                        return t('words.failed')
                    default:
                        return t('phrases.sent-bitcoin')
                }
            } else {
                return t('phrases.sent-bitcoin')
            }
        case TransactionDirection.receive:
            if (txn.lightning) {
                if (!txn.lnState) return `${t('phrases.receive-pending')}`
                switch (txn.lnState.type) {
                    case 'waitingForRefund':
                        return t('phrases.refund-pending')
                    case 'refunded':
                        return t('words.refund')
                    case 'waitingForPayment':
                        return t('phrases.receive-pending')
                    case 'canceled':
                        return t('words.expired')
                    case 'claimed':
                        return t('phrases.received-bitcoin')
                    default:
                        return t('phrases.receive-pending')
                }
            } else if (txn.bitcoin) {
                switch (txn.onchainState?.type) {
                    case 'waitingForTransaction':
                        return t('phrases.receive-pending')
                    case 'claimed':
                        return t('phrases.received-bitcoin')
                    default:
                        return t('phrases.receive-pending')
                }
            } else if (txn.stabilityPoolState) {
                switch (txn.stabilityPoolState.type) {
                    case 'pendingWithdrawal':
                        return t('phrases.receive-pending')
                    default:
                        return t('words.received')
                }
            } else {
                return t('words.received')
            }
        default:
            return ''
    }
}
export const makeTxnFeeDetails = (
    t: TFunction,
    txn: Transaction,
    makeFormattedAmountsFromMSats: (amt: MSats) => FormattedAmounts,
): FeeItem[] => {
    const items: FeeItem[] = []
    let totalFee = 0
    // Handle Fedi Fee
    if (
        txn.fediFeeStatus &&
        // TODO: render "pending" txns differently than
        // success txns. For now, we render each the same
        (txn.fediFeeStatus.type === 'success' ||
            txn.fediFeeStatus.type === 'pendingSend')
    ) {
        const fediFee = txn.fediFeeStatus.fedi_fee ?? (0 as MSats)
        const { formattedPrimaryAmount, formattedSecondaryAmount } =
            makeFormattedAmountsFromMSats(fediFee)
        items.push({
            label: t('phrases.fedi-fee'),
            formattedAmount: `${formattedPrimaryAmount} (${formattedSecondaryAmount})`,
        })
        totalFee += fediFee
    }

    // Handle Lightning Fee
    if (txn.lightning) {
        const lnFee = txn.lightning.fee ?? (0 as MSats)
        const { formattedPrimaryAmount, formattedSecondaryAmount } =
            makeFormattedAmountsFromMSats(lnFee)
        items.push({
            label: t('phrases.lightning-network'),
            formattedAmount: `${formattedPrimaryAmount} (${formattedSecondaryAmount})`,
        })
        totalFee += lnFee
    }

    // Handle Onchain Fee
    if (txn.onchainWithdrawalDetails) {
        const onchainFee = txn.onchainWithdrawalDetails.fee ?? (0 as MSats)
        const { formattedPrimaryAmount, formattedSecondaryAmount } =
            makeFormattedAmountsFromMSats(onchainFee as MSats)
        items.push({
            label: t('phrases.lightning-network'),
            formattedAmount: `${formattedPrimaryAmount} (${formattedSecondaryAmount})`,
        })
        totalFee += onchainFee
    }
    // TODO - Add Federation Fee once RPC supports it
    //  t('phrases.federation-fee'),

    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromMSats(totalFee as MSats)
    const fediFee = {
        label: t('phrases.total-fees'),
        formattedAmount: `${formattedPrimaryAmount} (${formattedSecondaryAmount})`,
    }
    items.push(fediFee)

    return items
}

export const makeTxnDetailItems = (
    t: TFunction,
    txn: Transaction,
    currency: SupportedCurrency | undefined = SupportedCurrency.USD,
    showFiatTxnAmounts: boolean,
    makeFormattedAmountsFromMSats: (amt: MSats) => FormattedAmounts,
    convertCentsToFormattedFiat: (amt: UsdCents) => string,
) => {
    const items: DetailItem[] = []
    const { formattedFiat, formattedSats } = makeFormattedAmountsFromMSats(
        txn.amount,
    )

    // Hide BTC Equivalent item when amount is zero or SATS-first setting is on
    if (txn.amount !== 0 && showFiatTxnAmounts) {
        items.push({
            label: t('phrases.bitcoin-equivalent'),
            value: formattedSats,
        })
    }
    items.push({
        label: t('words.time'),
        value: dateUtils.formatTimestamp(txn.createdAt, 'MMM dd yyyy, h:mmaaa'),
    })

    // shows the value of ecash sent in/out of stabilitypool at today's price
    // in local currency (historical value at time of txn shows elsewhere)
    if (
        txn.stabilityPoolState &&
        txn.stabilityPoolState.type !== 'pendingWithdrawal'
    ) {
        items.push({
            label: t('feature.stabilitypool.current-value'),
            value: formattedFiat,
        })
        // Show additional item for historical deposit/withdrawal value if SATS-first setting is on
        if (showFiatTxnAmounts === false) {
            if ('estimated_withdrawal_cents' in txn.stabilityPoolState) {
                const estimatedWithdrawalCents = Number(
                    txn.stabilityPoolState.estimated_withdrawal_cents,
                ) as UsdCents
                const formattedAmount = convertCentsToFormattedFiat(
                    estimatedWithdrawalCents,
                )
                items.push({
                    label: t('feature.stabilitypool.withdrawal-value'),
                    value: formattedAmount,
                })
            } else if ('initial_amount_cents' in txn.stabilityPoolState) {
                const initialAmountCents = Number(
                    txn.stabilityPoolState.initial_amount_cents,
                ) as UsdCents
                const formattedAmount =
                    convertCentsToFormattedFiat(initialAmountCents)
                items.push({
                    label: t('feature.stabilitypool.withdrawal-value'),
                    value: formattedAmount,
                })
            }
        }
    }
    if (txn.lightning) {
        items.push({
            label: t('phrases.lightning-request'),
            value: txn.lightning.invoice,
            copiedMessage: t('phrases.copied-lightning-request'),
            copyable: true,
            truncated: true,
        })

        if (txn.lnState?.type === 'success' && txn.direction === 'send') {
            items.push({
                label: t('words.preimage'),
                value: txn.lnState.preimage,
                copiedMessage: t('phrases.copied-to-clipboard'),
                copyable: true,
                truncated: true,
            })
        }
    }
    if (txn.bitcoin) {
        items.push({
            label:
                txn.onchainState?.type === 'waitingForTransaction'
                    ? t('words.address')
                    : t('words.to'),
            value: txn.bitcoin.address,
            copiedMessage: t('phrases.copied-bitcoin-address'),
            copyable: true,
            truncated: true,
        })
    }
    if (txn.onchainState && 'txid' in txn.onchainState) {
        items.push({
            label: t('phrases.transaction-id'),
            value: txn.onchainState.txid,
            copiedMessage: t('phrases.copied-transaction-id'),
            copyable: true,
            truncated: true,
        })
    }
    if (txn.onchainWithdrawalDetails) {
        items.push({
            label: t('words.address'),
            value: txn.onchainWithdrawalDetails.address,
            copiedMessage: t('phrases.copied-bitcoin-address'),
            copyable: true,
            truncated: true,
        })
        items.push({
            label: t('phrases.transaction-id'),
            value: txn.onchainWithdrawalDetails.txid,
            copiedMessage: t('phrases.copied-transaction-id'),
            copyable: true,
            truncated: true,
        })
    }

    items.push({
        label: t('words.status'),
        value: makeTxnDetailStatusText(t, txn),
    })

    // indicate stabilitypool deposits / withdrawals
    if (txn.stabilityPoolState) {
        if (
            txn.stabilityPoolState.type === 'pendingDeposit' ||
            txn.stabilityPoolState.type === 'completeDeposit'
        ) {
            items.push({
                label: t('feature.stabilitypool.deposit-to'),
                value: t('feature.stabilitypool.currency-balance', {
                    currency,
                }),
            })
        } else if (
            txn.stabilityPoolState.type === 'pendingWithdrawal' ||
            txn.stabilityPoolState.type === 'completeWithdrawal'
        ) {
            items.push({
                label: t('feature.stabilitypool.withdrawal-from'),
                value: t('feature.stabilitypool.currency-balance', {
                    currency,
                }),
            })
        }
    }

    return items
}

export const makeStabilityTxnStatusText = (t: TFunction, txn: Transaction) => {
    return txn.direction === 'send' ? t('words.deposit') : t('words.withdrawal')
}

export const makeStabilityTxnStatusSubtext = (
    t: TFunction,
    txn: Transaction,
) => {
    if (txn.stabilityPoolState) {
        if (
            txn.stabilityPoolState.type === 'completeDeposit' ||
            txn.stabilityPoolState.type === 'completeWithdrawal'
        ) {
            return t('words.complete')
        } else if (
            txn.stabilityPoolState.type === 'pendingWithdrawal' ||
            txn.stabilityPoolState.type === 'pendingDeposit'
        ) {
            return t('words.pending')
        }
    }
    return ''
}

export const makeStabilityTxnDetailTitleText = (
    t: TFunction,
    txn: Transaction,
) => {
    return txn.direction === 'send'
        ? t('feature.stabilitypool.you-deposited')
        : t('feature.stabilitypool.you-withdrew')
}

export const makeStabilityTxnDetailItems = (
    t: TFunction,
    txn: Transaction,
    makeFormattedAmountsFromMSats: (amt: MSats) => FormattedAmounts,
) => {
    const items: DetailItem[] = []
    const { formattedSats } = makeFormattedAmountsFromMSats(txn.amount)

    // Hide BTC Equivalent item when amount is zero or SATS-first setting is on
    if (txn.amount !== 0) {
        items.push({
            label:
                txn.direction === 'send'
                    ? t('feature.stabilitypool.deposit-amount')
                    : t('feature.stabilitypool.withdrawal-amount'),
            value: formattedSats,
        })
    }

    items.push({
        label: t('words.status'),
        value: makeTxnDetailStatusText(t, txn),
    })

    items.push({
        label: t('words.time'),
        value: dateUtils.formatTimestamp(txn.createdAt, 'MMM dd yyyy, h:mmaaa'),
    })
    return items
}

export const makeStabilityTxnFeeDetails = (
    t: TFunction,
    txn: Transaction,
    makeFormattedAmountsFromMSats: (amt: MSats) => FormattedAmounts,
): FeeItem[] => {
    const items: FeeItem[] = []
    let totalFee = 0
    // Handle Fedi Fee
    if (
        txn.fediFeeStatus &&
        // TODO: render "pending" txns differently than
        // success txns. For now, we render each the same
        (txn.fediFeeStatus.type === 'success' ||
            txn.fediFeeStatus.type === 'pendingSend')
    ) {
        const fediFee = txn.fediFeeStatus.fedi_fee ?? (0 as MSats)
        const { formattedPrimaryAmount, formattedSecondaryAmount } =
            makeFormattedAmountsFromMSats(fediFee)
        items.push({
            label: t('phrases.fedi-fee'),
            formattedAmount: `${formattedPrimaryAmount} (${formattedSecondaryAmount})`,
        })
        totalFee += fediFee
    }

    if (
        txn.stabilityPoolState &&
        txn.stabilityPoolState.type === 'completeDeposit' &&
        'fees_paid_so_far' in txn.stabilityPoolState
    ) {
        const feesPaidSoFar =
            txn.stabilityPoolState.fees_paid_so_far ?? (0 as MSats)
        const { formattedPrimaryAmount, formattedSecondaryAmount } =
            makeFormattedAmountsFromMSats(feesPaidSoFar)
        items.push({
            label: t('feature.stabilitypool.fees-paid'),
            formattedAmount: `${formattedPrimaryAmount} (${formattedSecondaryAmount})`,
        })
        totalFee += feesPaidSoFar
    }
    // TODO - Add Federation Fee once RPC supports it
    //  t('phrases.federation-fee'),

    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromMSats(totalFee as MSats)
    const totalFees = {
        label: t('phrases.total-fees'),
        formattedAmount: `${formattedPrimaryAmount} (${formattedSecondaryAmount})`,
    }
    items.push(totalFees)

    return items
}

export const makeStabilityTxnAmountText = (
    t: TFunction,
    txn: Transaction,
    showFiatTxnAmounts: boolean,
    makeFormattedAmountsFromMSats: (
        amt: MSats,
        symbolPosition?: AmountSymbolPosition,
    ) => FormattedAmounts,
    convertCentsToFormattedFiat: (
        amt: UsdCents,
        symbolPosition?: AmountSymbolPosition,
    ) => string,
): string => {
    const { amount } = txn

    let sign = txn.direction ? (txn.direction === 'send' ? `+` : `-`) : ''

    const { formattedPrimaryAmount } = makeFormattedAmountsFromMSats(
        amount,
        'none',
    )
    let formattedAmount: string = formattedPrimaryAmount

    // amount may be zero for onchain pending receives or for pending stabilitypool withdrawals
    if (txn.onchainState?.type === 'waitingForTransaction') {
        sign = `~`
    }

    if (txn.lnState?.type === 'canceled') {
        sign = ''
    }

    if (txn.stabilityPoolState && showFiatTxnAmounts) {
        if ('estimated_withdrawal_cents' in txn.stabilityPoolState) {
            const estimatedWithdrawalCents = Number(
                txn.stabilityPoolState.estimated_withdrawal_cents,
            ) as UsdCents
            formattedAmount = convertCentsToFormattedFiat(
                estimatedWithdrawalCents,
                'none',
            )
        } else if ('initial_amount_cents' in txn.stabilityPoolState) {
            const initialAmountCents = Number(
                txn.stabilityPoolState.initial_amount_cents,
            ) as UsdCents
            formattedAmount = convertCentsToFormattedFiat(
                initialAmountCents,
                'none',
            )
        }
    }
    return `${sign}${formattedAmount}`
}
