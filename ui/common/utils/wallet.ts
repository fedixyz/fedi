import { TFunction } from 'i18next'

import { AmountSymbolPosition, FormattedAmounts } from '../hooks/amount'
import { FeeItem } from '../hooks/transactions'
import {
    MSats,
    SupportedCurrency,
    TransactionStatusBadge,
    TransactionDirection,
    UsdCents,
    ReceiveSuccessData,
    TransactionAmountState,
    TransactionListEntry,
} from '../types'
import amountUtils, { FIAT_MAX_DECIMAL_PLACES } from './AmountUtils'
import dateUtils from './DateUtils'

export interface DetailItem {
    label: string
    value: string
    truncated?: boolean
    copyable?: boolean
    copiedMessage?: string
}

export const getTxnDirection = (txn: TransactionListEntry): string => {
    switch (txn.kind) {
        case 'lnPay':
        case 'onchainWithdraw':
        case 'oobSend':
        case 'spDeposit':
            return TransactionDirection.send
        case 'lnReceive':
        case 'onchainDeposit':
        case 'oobReceive':
        case 'spWithdraw':
            return TransactionDirection.receive
        default:
            return TransactionDirection.send
    }
}

export const makeTxnTypeText = (
    txn: TransactionListEntry,
    t: TFunction,
): string => {
    switch (txn.kind) {
        case 'onchainDeposit':
        case 'onchainWithdraw':
            return t('words.onchain')
        case 'lnPay':
        case 'lnReceive':
            return t('words.lightning')
        case 'spDeposit':
        case 'spWithdraw':
            return t('feature.stabilitypool.stable-balance')
        case 'oobSend':
        case 'oobReceive':
            return t('words.ecash')
        default:
            return t('words.unknown')
    }
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

export const makeTxnDetailTitleText = (
    t: TFunction,
    txn: TransactionListEntry,
): string => {
    // there should always be a state, but return unknown just in case
    if (!txn.state) return t('words.unknown')

    const direction = getTxnDirection(txn)
    if (direction === TransactionDirection.send) {
        return t('feature.send.you-sent')
    }
    if (txn.kind === 'lnReceive') {
        switch (txn.state?.type) {
            case 'waitingForPayment':
                return t('phrases.receive-pending')
            case 'claimed':
                return t('feature.receive.you-received')
            case 'canceled':
                return t('words.expired')
            default:
                return t('phrases.receive-pending')
        }
    } else if (txn.kind === 'onchainDeposit') {
        switch (txn.state?.type) {
            case 'waitingForTransaction':
                return t('phrases.address-created')
            case 'claimed':
                return t('feature.receive.you-received')
            default:
                return t('phrases.receive-pending')
        }
    } else if (txn.kind === 'spWithdraw') {
        switch (txn.state?.type) {
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

export const makeTxnNotesText = (txn: TransactionListEntry): string => {
    // always render user-submitted notes first
    if (txn.txnNotes) return txn.txnNotes

    return ''
}

export const makeTxnAmountText = (
    txn: TransactionListEntry,
    showFiatTxnAmounts: boolean,
    // we use the opposite signs on the stabilitypool txn list
    flipSign: boolean,
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
    const direction = getTxnDirection(txn)
    const isPlus = !flipSign ? direction === 'receive' : direction === 'send'
    let sign = direction ? (isPlus ? `+` : `-`) : ''
    let formattedAmount: string
    // amount may be zero for onchain pending receives or for pending stabilitypool withdrawals
    // If fiat amounts should be shown and historical info is present, use it:
    if (showFiatTxnAmounts && txn.txDateFiatInfo) {
        const historicalRate = txn.txDateFiatInfo.btcToFiatHundredths / 100
        const btc = amountUtils.msatToBtc(amount)
        // Format the fiat value using the historical rate
        formattedAmount =
            amountUtils
                .btcToFiat(btc, historicalRate)
                .toFixed(FIAT_MAX_DECIMAL_PLACES) +
            ` ${txn.txDateFiatInfo.fiatCode}`
    } else {
        // Fallback: use the default conversion based on MSats
        const { formattedPrimaryAmount } = makeFormattedAmountsFromMSats(
            amount,
            'none',
        )
        formattedAmount = formattedPrimaryAmount

        if (showFiatTxnAmounts) {
            if (txn.kind === 'spWithdraw') {
                if (txn.state && 'estimated_withdrawal_cents' in txn.state) {
                    const estimatedWithdrawalCents = Number(
                        txn.state.estimated_withdrawal_cents,
                    ) as UsdCents
                    formattedAmount = convertCentsToFormattedFiat(
                        estimatedWithdrawalCents,
                        'none',
                    )
                }
            } else if (txn.kind === 'spDeposit') {
                if (txn.state && 'initial_amount_cents' in txn.state) {
                    const initialAmountCents = Number(
                        txn.state.initial_amount_cents,
                    ) as UsdCents
                    formattedAmount = convertCentsToFormattedFiat(
                        initialAmountCents,
                        'none',
                    )
                }
            }
        }
    }

    // Adjust for special cases
    if (
        txn.kind === 'onchainDeposit' &&
        txn.state?.type === 'waitingForTransaction'
    ) {
        sign = `~`
        formattedAmount = ''
    }
    // LN pay and receive states can be canceled and should not show a sign
    if (
        (txn.kind === 'lnPay' || txn.kind === 'lnReceive') &&
        txn.state?.type === 'canceled'
    ) {
        sign = ''
    }

    return `${sign}${formattedAmount}`
}

export const makeTxnStatusText = (
    t: TFunction,
    txn: TransactionListEntry,
): string => {
    // there should always be a state, but return unknown just in case
    if (!txn.state) return t('words.unknown')

    const direction = getTxnDirection(txn)
    switch (direction) {
        case TransactionDirection.send:
            if (txn.kind === 'lnPay') {
                switch (txn.state?.type) {
                    case 'created':
                    case 'funded':
                    case 'awaitingChange':
                        return t('words.pending')
                    case 'waitingForRefund':
                        return t('phrases.refund-pending')
                    case 'canceled':
                    case 'failed':
                        return t('words.failed')
                    case 'refunded':
                        return t('words.refunded')
                    case 'success':
                    default:
                        return t('words.sent')
                }
            } else if (txn.kind === 'onchainWithdraw') {
                switch (txn.state?.type) {
                    case 'succeeded':
                        return t('words.sent')
                    case 'failed':
                        return t('words.failed')
                    default:
                        return t('words.pending')
                }
            } else if (txn.kind === 'oobSend') {
                switch (txn.state?.type) {
                    // TODO: created txns can still be canceled or refunded within 3 days
                    // ... figure out how to communicate this to user
                    case 'created':
                    case 'success':
                        return t('words.sent')
                    // if a cancel fails it must have been claimed by recipient aka sent successfully
                    case 'userCanceledFailure':
                        return t('words.sent')
                    case 'refunded':
                        return t('words.refunded')
                    case 'userCanceledSuccess':
                        return t('words.canceled')
                    case 'userCanceledProcessing':
                        return t('words.pending')
                    default:
                        return ''
                }
            } else if (txn.kind === 'spDeposit') {
                switch (txn.state?.type) {
                    case 'pendingDeposit':
                        return t('words.pending')
                    case 'completeDeposit':
                        return t('words.deposit')
                    default:
                        return t('words.deposit')
                }
            } else {
                return t('words.sent')
            }
        case TransactionDirection.receive:
            if (txn.kind === 'lnReceive') {
                switch (txn.state?.type) {
                    case 'created':
                    case 'waitingForPayment':
                    case 'funded':
                    case 'awaitingFunds':
                        return t('words.pending')
                    case 'canceled':
                        return t('words.expired')
                    case 'claimed':
                        return t('words.received')
                    default:
                        return t('words.pending')
                }
            } else if (txn.kind === 'onchainDeposit') {
                switch (txn.state?.type) {
                    case 'waitingForTransaction':
                        return t('phrases.address-created')
                    case 'waitingForConfirmation':
                    case 'confirmed':
                        return t('words.pending')
                    case 'claimed':
                        return t('phrases.received-bitcoin')
                    case 'failed':
                        return t('words.failed')
                    default:
                        return t('words.pending')
                }
            } else if (txn.kind === 'spWithdraw') {
                switch (txn.state?.type) {
                    case 'pendingWithdrawal':
                        return t('words.pending')
                    default:
                        return t('words.withdrawal')
                }
            } else if (txn.kind === 'oobReceive') {
                switch (txn.state?.type) {
                    case 'created':
                    case 'issuing':
                        return t('words.pending')
                    case 'done':
                        return t('words.complete')
                    case 'failed':
                        return t('words.failed')
                    default:
                        return ''
                }
            } else {
                return t('words.received')
            }
        default:
            return ''
    }
}

export const makeTxnStatusBadge = (
    txn: TransactionListEntry,
): TransactionStatusBadge => {
    let badge: TransactionStatusBadge

    const direction = getTxnDirection(txn)
    switch (direction) {
        case TransactionDirection.send:
            badge = 'outgoing'
            if (txn.kind === 'lnPay') {
                switch (txn.state?.type) {
                    case 'created':
                    case 'funded':
                    case 'awaitingChange':
                    case 'waitingForRefund':
                        badge = 'pending'
                        break
                    case 'canceled':
                    case 'refunded':
                    case 'failed':
                        badge = 'failed'
                        break
                    case 'success':
                    default:
                        badge = 'outgoing'
                        break
                }
            } else if (txn.kind === 'onchainWithdraw') {
                switch (txn.state?.type) {
                    case 'failed':
                        badge = 'failed'
                        break
                    default:
                        badge = 'outgoing'
                        break
                }
            } else if (txn.kind === 'oobSend') {
                switch (txn.state?.type) {
                    case 'created':
                    case 'userCanceledFailure':
                    case 'success':
                        badge = 'outgoing'
                        break
                    case 'userCanceledSuccess':
                        badge = 'failed'
                        break
                    case 'refunded':
                        badge = 'failed'
                        break
                    case 'userCanceledProcessing':
                        badge = 'pending'
                        break
                    default:
                        break
                }
            } else if (txn.kind === 'spDeposit') {
                switch (txn.state?.type) {
                    case 'pendingDeposit':
                        badge = 'pending'
                        break
                    case 'completeDeposit':
                        badge = 'outgoing'
                        break
                    default:
                        break
                }
            }
            break
        case TransactionDirection.receive:
            badge = 'incoming'
            if (txn.kind === 'lnReceive') {
                switch (txn.state?.type) {
                    case 'claimed':
                        badge = 'incoming'
                        break
                    case 'canceled':
                        badge = 'expired'
                        break
                    case 'created':
                    case 'waitingForPayment':
                    case 'funded':
                    case 'awaitingFunds':
                    default:
                        badge = 'pending'
                        break
                }
            } else if (txn.kind === 'onchainDeposit') {
                switch (txn.state?.type) {
                    case 'claimed':
                        badge = 'incoming'
                        break
                    case 'failed':
                        badge = 'failed'
                        break
                    case 'waitingForTransaction':
                    case 'waitingForConfirmation':
                    case 'confirmed':
                    default:
                        badge = 'pending'
                        break
                }
            } else if (txn.kind === 'spWithdraw') {
                switch (txn.state?.type) {
                    case 'completeWithdrawal':
                        badge = 'incoming'
                        break
                    case 'pendingWithdrawal':
                    default:
                        badge = 'pending'
                        break
                }
            } else if (txn.kind === 'oobReceive') {
                switch (txn.state?.type) {
                    case 'done':
                        badge = 'incoming'
                        break
                    case 'failed':
                        badge = 'failed'
                        break
                    case 'created':
                    case 'issuing':
                    default:
                        badge = 'pending'
                        break
                }
            } else {
                badge = 'incoming'
            }
            break
        default:
            badge = 'incoming'
    }

    return badge
}

export const makeTxnFeeDetails = (
    t: TFunction,
    txn: TransactionListEntry,
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
    if (txn.kind === 'lnPay') {
        const lnFee = txn.lightning_fees ?? (0 as MSats)
        const { formattedPrimaryAmount, formattedSecondaryAmount } =
            makeFormattedAmountsFromMSats(lnFee)
        items.push({
            label: t('phrases.lightning-network'),
            formattedAmount: `${formattedPrimaryAmount} (${formattedSecondaryAmount})`,
        })
        totalFee += lnFee
    }

    // Handle Onchain Fee
    if (txn.kind === 'onchainWithdraw') {
        const onchainFee = txn.onchain_fees ?? (0 as MSats)
        const { formattedPrimaryAmount, formattedSecondaryAmount } =
            makeFormattedAmountsFromMSats(onchainFee as MSats)
        items.push({
            label: t('phrases.network-fee'),
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
    txn: TransactionListEntry,
    currency: SupportedCurrency | undefined = SupportedCurrency.USD,
    showFiatTxnAmounts: boolean,
    makeFormattedAmountsFromMSats: (amt: MSats) => FormattedAmounts,
    convertCentsToFormattedFiat: (amt: UsdCents) => string,
) => {
    const items: DetailItem[] = []
    const { formattedFiat, formattedSats } = makeFormattedAmountsFromMSats(
        txn.amount,
    )

    const txnTypeText = makeTxnTypeText(txn, t)

    items.push({
        label: t('words.type'),
        value: txnTypeText,
    })
    items.push({
        label: t('words.status'),
        value: makeTxnStatusText(t, txn),
    })
    items.push({
        label: t('words.time'),
        value: dateUtils.formatTimestamp(txn.createdAt, 'MMM dd yyyy, h:mmaaa'),
    })

    // shows the value of ecash sent in/out of stabilitypool at today's price
    // in local currency (historical value at time of txn shows elsewhere)
    if (
        (txn.kind === 'spWithdraw' || txn.kind === 'spDeposit') &&
        txn.state?.type !== 'pendingWithdrawal'
    ) {
        items.push({
            label: t('feature.stabilitypool.current-value'),
            value: formattedFiat,
        })
        // TODO: remove these once we refactor to use txn.txDateFiatInfo instead
        // Show additional item for historical deposit/withdrawal value if SATS-first setting is on
        if (showFiatTxnAmounts === false && txn.state) {
            if ('estimated_withdrawal_cents' in txn.state) {
                const estimatedWithdrawalCents = Number(
                    txn.state.estimated_withdrawal_cents,
                ) as UsdCents
                const formattedAmount = convertCentsToFormattedFiat(
                    estimatedWithdrawalCents,
                )
                items.push({
                    label: t('feature.stabilitypool.withdrawal-value'),
                    value: formattedAmount,
                })
            } else if ('initial_amount_cents' in txn.state) {
                const initialAmountCents = Number(
                    txn.state.initial_amount_cents,
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

    if (
        (txn.kind === 'lnReceive' || txn.kind === 'lnPay') &&
        'ln_invoice' in txn
    ) {
        items.push({
            label: t('phrases.lightning-request'),
            value: txn.ln_invoice,
            copiedMessage: t('phrases.copied-lightning-request'),
            copyable: true,
            truncated: true,
        })
    }
    // show the preimage for successful lightning payments
    if (
        txn.kind === 'lnPay' &&
        txn.state?.type === 'success' &&
        'preimage' in txn.state
    ) {
        items.push({
            label: t('words.preimage'),
            value: txn.state.preimage,
            copiedMessage: t('phrases.copied-to-clipboard'),
            copyable: true,
            truncated: true,
        })
    }

    if (
        (txn.kind === 'onchainDeposit' || txn.kind === 'onchainWithdraw') &&
        'onchain_address' in txn
    ) {
        items.push({
            label:
                txn.state?.type === 'waitingForTransaction'
                    ? t('words.address')
                    : t('words.to'),
            value: txn.onchain_address,
            copiedMessage: t('phrases.copied-bitcoin-address'),
            copyable: true,
            truncated: true,
        })
    }
    if (
        (txn.kind === 'onchainDeposit' || txn.kind === 'onchainWithdraw') &&
        'onchain_txid' in txn
    ) {
        items.push({
            label: t('phrases.transaction-id'),
            value: txn.onchain_txid,
            copiedMessage: t('phrases.copied-transaction-id'),
            copyable: true,
            truncated: true,
        })
    }

    // indicate stabilitypool deposits / withdrawals
    if (txn.kind === 'spDeposit') {
        items.push({
            label: t('feature.stabilitypool.deposit-to'),
            value: t('feature.stabilitypool.currency-balance', {
                currency,
            }),
        })
    } else if (txn.kind === 'spWithdraw') {
        items.push({
            label: t('feature.stabilitypool.withdrawal-from'),
            value: t('feature.stabilitypool.currency-balance', {
                currency,
            }),
        })
    }

    // Hide BTC Equivalent item when amount is zero or SATS-first setting is on
    if (txn.amount !== 0 && showFiatTxnAmounts) {
        items.push({
            label: t('phrases.bitcoin-equivalent'),
            value: formattedSats,
        })
    }

    return items
}

export const makeStabilityTxnDetailTitleText = (
    t: TFunction,
    txn: TransactionListEntry,
) => {
    return txn.kind === 'spDeposit'
        ? t('feature.stabilitypool.you-deposited')
        : t('feature.stabilitypool.you-withdrew')
}

export const makeStabilityTxnDetailItems = (
    t: TFunction,
    txn: TransactionListEntry,
    makeFormattedAmountsFromMSats: (amt: MSats) => FormattedAmounts,
) => {
    const items: DetailItem[] = []
    const { formattedSats } = makeFormattedAmountsFromMSats(txn.amount)

    // Hide BTC Equivalent item when amount is zero or SATS-first setting is on
    if (txn.amount !== 0) {
        items.push({
            label:
                txn.kind === 'spDeposit'
                    ? t('feature.stabilitypool.deposit-amount')
                    : t('feature.stabilitypool.withdrawal-amount'),
            value: formattedSats,
        })
    }

    items.push({
        label: t('words.status'),
        value: makeTxnStatusText(t, txn),
    })

    items.push({
        label: t('words.time'),
        value: dateUtils.formatTimestamp(txn.createdAt, 'MMM dd yyyy, h:mmaaa'),
    })

    return items
}

export const makeStabilityTxnFeeDetails = (
    t: TFunction,
    txn: TransactionListEntry,
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
        txn.kind === 'spDeposit' &&
        txn.state?.type === 'completeDeposit' &&
        'fees_paid_so_far' in txn.state
    ) {
        const feesPaidSoFar = txn.state.fees_paid_so_far ?? (0 as MSats)
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

export const makeReceiveSuccessMessage = (
    t: TFunction,
    tx: ReceiveSuccessData,
    status: 'success' | 'pending',
) => {
    if (status === 'pending') {
        return {
            message: t('feature.receive.payment-received-pending'),
            subtext: t('feature.receive.payment-received-pending-subtext'),
        }
    } else if ('onchain_address' in tx) {
        return { message: t('feature.receive.pending-transaction') }
    } else {
        return {
            message: t('feature.receive.you-received'),
        }
    }
}

// Maps status badges to amount states
export const TransactionAmountStateMap = {
    incoming: 'settled',
    outgoing: 'settled',
    pending: 'pending',
    expired: 'failed',
    failed: 'failed',
} satisfies Record<TransactionStatusBadge, TransactionAmountState>

export const makeTransactionAmountState = (txn: TransactionListEntry) => {
    const badge = makeTxnStatusBadge(txn)
    return TransactionAmountStateMap[badge] satisfies TransactionAmountState
}
