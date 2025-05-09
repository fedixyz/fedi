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
    SelectableCurrency,
    MultispendTransactionListEntry,
    MatrixRoomMember,
} from '../types'
import {
    StabilityPoolWithdrawalEvent,
    StabilityPoolDepositEvent,
    RpcAmount,
    RpcStabilityPoolAccountInfo,
    RpcLockedSeek,
    SPv2WithdrawalEvent,
} from '../types/bindings'
import { StabilityPoolState } from '../types/wallet'
import amountUtils, { FIAT_MAX_DECIMAL_PLACES } from './AmountUtils'
import dateUtils from './DateUtils'
import { getCurrencyCode } from './currency'
import { FedimintBridge } from './fedimint'
import { makeLog } from './log'
import { makeNameWithSuffix } from './matrix'

const log = makeLog('common/utils/wallet')

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
        case 'sPV2Deposit':
            return TransactionDirection.send
        case 'lnReceive':
        case 'onchainDeposit':
        case 'oobReceive':
        case 'spWithdraw':
        case 'sPV2Withdrawal':
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
        case 'sPV2Deposit':
        case 'sPV2Withdrawal':
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
    } else if (txn.kind === 'spWithdraw' || txn.kind === 'sPV2Withdrawal') {
        switch (txn.state?.type) {
            case 'pendingWithdrawal':
                return t('phrases.receive-pending')
            case 'completeWithdrawal':
            case 'completedWithdrawal':
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
            if (
                txn.kind === 'spWithdraw' &&
                txn.state &&
                'estimated_withdrawal_cents' in txn.state
            ) {
                const estimatedWithdrawalCents = Number(
                    txn.state.estimated_withdrawal_cents,
                ) as UsdCents
                formattedAmount = convertCentsToFormattedFiat(
                    estimatedWithdrawalCents,
                    'none',
                )
            } else if (
                txn.kind === 'sPV2Withdrawal' &&
                txn.state &&
                'fiat_amount' in txn.state
            ) {
                // TODO: validate this unit is correct
                const fiatAmount = Number(txn.state.fiat_amount) as UsdCents
                formattedAmount = convertCentsToFormattedFiat(
                    fiatAmount,
                    'none',
                )
            } else if (
                txn.kind === 'spDeposit' &&
                txn.state &&
                'initial_amount_cents' in txn.state
            ) {
                const initialAmountCents = Number(
                    txn.state.initial_amount_cents,
                ) as UsdCents
                formattedAmount = convertCentsToFormattedFiat(
                    initialAmountCents,
                    'none',
                )
            } else if (
                txn.kind === 'sPV2Deposit' &&
                txn.state &&
                'fiat_amount' in txn.state
            ) {
                // TODO: validate this unit is correct
                const fiatAmount = Number(txn.state.fiat_amount) as UsdCents
                formattedAmount = convertCentsToFormattedFiat(
                    fiatAmount,
                    'none',
                )
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
            } else if (txn.kind === 'spDeposit' || txn.kind === 'sPV2Deposit') {
                switch (txn.state?.type) {
                    case 'pendingDeposit':
                        return t('words.pending')
                    case 'completeDeposit':
                    case 'completedDeposit':
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
            } else if (
                txn.kind === 'spWithdraw' ||
                txn.kind === 'sPV2Withdrawal'
            ) {
                switch (txn.state?.type) {
                    // TODO: Currently there's case where a withdrawal can get stuck in pending.
                    // This should be alleviated by 1. using withdrawalAll when dust is left
                    // and 2. preventing the user from submitting all failure cases OR the bridge
                    // distinguishing between failed and dataNotInCache.
                    case 'dataNotInCache':
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
            } else if (txn.kind === 'spDeposit' || txn.kind === 'sPV2Deposit') {
                switch (txn.state?.type) {
                    case 'pendingDeposit':
                        badge = 'pending'
                        break
                    case 'completeDeposit':
                    case 'completedDeposit':
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
            } else if (
                txn.kind === 'spWithdraw' ||
                txn.kind === 'sPV2Withdrawal'
            ) {
                switch (txn.state?.type) {
                    case 'completeWithdrawal':
                    case 'completedWithdrawal':
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
    if (txn.kind === 'multispend') {
        if (txn.state === 'invalid') return 'failed'
        if ('depositNotification' in txn.event) {
            badge = 'incoming'
        } else if ('withdrawalRequest' in txn.event) {
            const withdrawalRequest = txn.event.withdrawalRequest
            if (withdrawalRequest.completed) {
                badge = 'outgoing'
            } else {
                badge = 'pending'
            }
        } else {
            badge = 'pending'
        }
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
    currency: SelectableCurrency | undefined = SupportedCurrency.USD,
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
        txn.kind === 'spWithdraw' ||
        txn.kind === 'spDeposit' ||
        txn.kind === 'sPV2Withdrawal' ||
        txn.kind === 'sPV2Deposit'
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
    if (txn.kind === 'spDeposit' || txn.kind === 'sPV2Deposit') {
        items.push({
            label: t('feature.stabilitypool.deposit-to'),
            value: t('feature.stabilitypool.currency-balance', {
                currency: getCurrencyCode(currency),
            }),
        })
    } else if (txn.kind === 'spWithdraw' || txn.kind === 'sPV2Withdrawal') {
        items.push({
            label: t('feature.stabilitypool.withdrawal-from'),
            value: t('feature.stabilitypool.currency-balance', {
                currency: getCurrencyCode(currency),
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
    return txn.kind === 'spDeposit' || txn.kind === 'sPV2Deposit'
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
                txn.kind === 'spDeposit' || txn.kind === 'sPV2Deposit'
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
        (txn.kind === 'spDeposit' || txn.kind === 'sPV2Deposit') &&
        (txn.state?.type === 'completeDeposit' ||
            txn.state?.type === 'completedDeposit') &&
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

export const makeMultispendTxnDetailItems = (
    t: TFunction,
    txn: MultispendTransactionListEntry,
    roomMembers: MatrixRoomMember[],
    convertCentsToFormattedFiat: (amt: UsdCents) => string,
) => {
    const items: DetailItem[] = []

    items.push({
        label: t('words.type'),
        value: t('words.multispend'),
    })

    items.push({
        label: t('words.time'),
        value: dateUtils.formatTimestamp(
            Number((txn.time / 1000).toFixed(0)),
            'MMM dd yyyy, h:mmaaa',
        ),
    })

    if (txn.state === 'deposit') {
        const deposit = txn.event.depositNotification
        const matchingMember = roomMembers.find(m => m.id === deposit.user)
        if (matchingMember?.displayName) {
            items.push({
                label: t('words.depositor'),
                value: makeNameWithSuffix(matchingMember),
            })
        }
        if (deposit.fiatAmount) {
            items.push({
                label: t('words.amount'),
                value: convertCentsToFormattedFiat(
                    deposit.fiatAmount as UsdCents,
                ),
            })
        }
    }

    if (txn.state === 'withdrawal') {
        const withdrawalRequest = txn.event.withdrawalRequest
        const matchingMember = roomMembers.find(
            m => m.id === withdrawalRequest.sender,
        )
        if (matchingMember?.displayName) {
            items.push({
                label: t('words.withdrawer'),
                value: makeNameWithSuffix(matchingMember),
            })
        }
        if (withdrawalRequest.request.transfer_amount) {
            items.push({
                label: t('words.amount'),
                value: convertCentsToFormattedFiat(
                    withdrawalRequest.request.transfer_amount as UsdCents,
                ),
            })
        }
    }

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

// Calculate the actual amount to withdraw given a requested amount
export const calculateStabilityPoolWithdrawal = (
    amount: MSats,
    btcUsdExchangeRate: number,
    totalLockedCents: UsdCents,
    totalStagedMsats: MSats,
    stableBalanceCents: UsdCents,
) => {
    // if we have enough pending balance to cover the withdrawal
    // no need to calculate basis points on stable balance
    if (amount <= totalStagedMsats) {
        log.info(
            `withdrawing ${amount} msats from ${totalStagedMsats} staged msats`,
        )
        // if there is a sub-1sat difference in staged seeks remaining, should be safe to just use the full pending balance to sweep the msats in with the withdrawal
        const unlockedAmount =
            totalStagedMsats - amount < 1000 ? totalStagedMsats : amount
        return { lockedBps: 0, unlockedAmount }
    } else {
        // if there is more to withdraw, unlock the full pending balance
        // and calculate what portion of the stable balance
        // is needed to fulfill the withdrawal amount
        const unlockedAmount = totalStagedMsats
        const remainingWithdrawal = Number((amount - unlockedAmount).toFixed(2))
        log.info(
            `need to withdraw ${remainingWithdrawal} msats from locked balance`,
        )
        const remainingWithdrawalUsd = amountUtils.msatToFiat(
            remainingWithdrawal as MSats,
            btcUsdExchangeRate,
        )
        const remainingWithdrawalCents = remainingWithdrawalUsd * 100
        log.info('remainingWithdrawalCents', remainingWithdrawalCents)

        // ensure this is max 10_000, which represents 100% of the locked balance
        const lockedBps = Math.min(
            Number(
                (
                    (remainingWithdrawalCents * 10_000) /
                    totalLockedCents
                ).toFixed(0),
            ),
            10_000,
        )

        // TODO: remove this? do we need any sweep conditions here at all?
        // If there is <=1 cent leftover after this withdrawal
        // just withdraw the full 10k basis points on the locked balance
        // const centsAfterWithdrawal: UsdCents = (stableBalanceCents -
        //     remainingWithdrawalCents) as UsdCents
        // console.debug('centsAfterWithdrawal', centsAfterWithdrawal)
        // lockedBps =
        //     centsAfterWithdrawal <= 1
        //         ? 10000
        //         : Number(
        //               (
        //                   Number(
        //                       (remainingWithdrawalCents * 10000).toFixed(0),
        //                   ) / totalLockedCents
        //               ).toFixed(0),
        //           )

        log.info('decreaseStableBalance', {
            lockedBps,
            unlockedAmount,
            totalStagedMsats,
            stableBalanceCents,
        })
        return { lockedBps, unlockedAmount }
    }
}

export const calculateStabilityPoolWithdrawalV2 = (
    amountCents: UsdCents,
    totalBalanceCents: UsdCents,
) => {
    // If there is <= 3 (a few) cents leftover after this withdrawal
    // just withdraw the full 10k basis points on the locked balance
    const centsAfterWithdrawal = (totalBalanceCents - amountCents) as UsdCents
    if (centsAfterWithdrawal <= 3) {
        return { withdrawAll: true, amountCents: 0 as UsdCents }
    } else {
        return { withdrawAll: false, amountCents }
    }
}

export const handleStabilityPoolWithdrawal = async (
    lockedBps: number,
    unlockedAmount: MSats,
    fedimint: FedimintBridge,
    federationId: string,
) => {
    const operationId = await fedimint.stabilityPoolWithdraw(
        lockedBps,
        unlockedAmount,
        federationId,
    )
    return new Promise<StabilityPoolWithdrawalEvent>((resolve, reject) => {
        const unsubscribeOperation = fedimint.addListener(
            'stabilityPoolWithdrawal',
            (event: StabilityPoolWithdrawalEvent) => {
                if (
                    event.federationId !== federationId ||
                    event.operationId !== operationId
                ) {
                    return
                }
                log.info(
                    'StabilityPoolWithdrawalEvent.state',
                    event.operationId,
                    event.state,
                )
                // Withdrawals may return the success state quickly if 100% of it was covered from stagedSeeks
                // Otherwise, cancellationAccepted is the appropriate state to resolve
                if (
                    event.state === 'success' ||
                    event.state === 'cancellationAccepted'
                ) {
                    unsubscribeOperation()
                    resolve(event)
                } else if (
                    typeof event.state === 'object' &&
                    ('txRejected' in event.state ||
                        'cancellationSubmissionFailure' in event.state)
                ) {
                    unsubscribeOperation()
                    reject('Transaction rejected')
                }
            },
        )
    })
}

export const handleSpv2Withdrawal = async (
    amount: UsdCents,
    fedimint: FedimintBridge,
    federationId: string,
    withdrawAll = false,
) => {
    log.info('Withdrawal', {
        withdrawAll,
        amount,
    })
    const operationId = withdrawAll
        ? await fedimint.spv2WithdrawAll(federationId)
        : await fedimint.spv2Withdraw(federationId, amount)

    log.info('Withdrawal', { operationId })
    return new Promise<SPv2WithdrawalEvent>((resolve, reject) => {
        const unsubscribeOperation = fedimint.addListener(
            'spv2Withdrawal',
            (event: SPv2WithdrawalEvent) => {
                if (
                    event.federationId !== federationId ||
                    event.operationId !== operationId
                ) {
                    return
                }
                log.info(
                    'SPv2WithdrawalEvent.state',
                    event.operationId,
                    event.state,
                )
                // Withdrawals may return the success state quickly if 100% of it was covered from stagedSeeks
                // Otherwise, cancellationAccepted is the appropriate state to resolve
                if (
                    event.state === 'unlockTxAccepted' ||
                    (typeof event.state === 'object' &&
                        'unlockTxAccepted' in event.state)
                ) {
                    unsubscribeOperation()
                    resolve(event)
                } else if (
                    typeof event.state === 'object' &&
                    ('unlockTxRejected' in event.state ||
                        'unlockProcessingError' in event.state ||
                        'withdrawalTxRejected' in event.state)
                ) {
                    unsubscribeOperation()
                    reject('Transaction rejected')
                }
            },
        )
    })
}

export const calculateStabilityPoolDeposit = (
    amount: RpcAmount,
    ecashBalance: MSats,
    maxAllowedFeeRate: number,
): MSats => {
    // Add some fee padding to resist downside price leakage while deposits confirm
    // arbitrarily we just add the estimated fees for the first 10 cycles
    const maxFeeRateFraction = Number(
        (maxAllowedFeeRate / 1_000_000_000).toFixed(9),
    )
    const maxFirstCycleFee = Number((amount * maxFeeRateFraction).toFixed(0))

    // Min leakage padding of 1 sat or first 10 cycle fees
    const leakagePadding = Math.max(
        1000,
        Number((10 * maxFirstCycleFee).toFixed(0)),
    )

    const amountPlusPadding = Number((amount + leakagePadding).toFixed(0))

    // Make sure total with fee padding doesn't exceed ecash balance
    const amountToDeposit = Math.min(ecashBalance, amountPlusPadding) as MSats

    // When depositing, the fedi fee is added to the deposit amount

    log.info('calculateStabilityPoolDeposit', {
        amount,
        ecashBalance,
        maxAllowedFeeRate,
        leakagePadding,
        amountToDeposit,
    })

    return amountToDeposit
}

export const handleStabilityPoolDeposit = async (
    amount: MSats,
    fedimint: FedimintBridge,
    federationId: string,
): Promise<StabilityPoolDepositEvent> => {
    const operationId = await fedimint.stabilityPoolDepositToSeek(
        amount,
        federationId,
    )

    return new Promise<StabilityPoolDepositEvent>((resolve, reject) => {
        const unsubscribeOperation = fedimint.addListener(
            'stabilityPoolDeposit',
            (event: StabilityPoolDepositEvent) => {
                if (
                    event.federationId === federationId &&
                    event.operationId === operationId
                ) {
                    log.info(
                        'StabilityPoolDepositEvent.state',
                        event.operationId,
                        event.state,
                    )
                    if (event.state === 'txAccepted') {
                        unsubscribeOperation()
                        resolve(event)
                    } else if (
                        typeof event.state === 'object' &&
                        'txRejected' in event.state
                    ) {
                        unsubscribeOperation()
                        reject('Transaction rejected')
                    }
                }
            },
        )
    })
}

export const handleSpv2Deposit = async (
    amount: MSats,
    fedimint: FedimintBridge,
    federationId: string,
): Promise<StabilityPoolDepositEvent> => {
    const operationId = await fedimint.spv2DepositToSeek(amount, federationId)

    return new Promise<StabilityPoolDepositEvent>((resolve, reject) => {
        const unsubscribeOperation = fedimint.addListener(
            'spv2Deposit',
            (event: StabilityPoolDepositEvent) => {
                if (
                    event.federationId === federationId &&
                    event.operationId === operationId
                ) {
                    log.info(
                        'spv2DepositEvent.state',
                        event.operationId,
                        event.state,
                    )
                    if (event.state === 'txAccepted') {
                        unsubscribeOperation()
                        resolve(event)
                    } else if (
                        typeof event.state === 'object' &&
                        'txRejected' in event.state
                    ) {
                        unsubscribeOperation()
                        reject('Transaction rejected')
                    }
                }
            },
        )
    })
}

/** reorganize SPv1 AccountInfo to match the shape of SPv2 */
export const coerceLegacyAccountInfo = (
    accountInfo: RpcStabilityPoolAccountInfo,
    // price in cents
    price: number,
): StabilityPoolState => {
    // SPv2 aggregates stagedSeeks into a combined stagedBalance
    const stagedBalance = accountInfo.stagedSeeks.reduce(
        (result, ss) => Number((result + ss).toFixed(0)),
        0,
    ) as MSats

    // SPv2 aggregates lockedSeeks into a combined lockedBalance
    const lockedBalance = accountInfo.lockedSeeks.reduce(
        (result: number, ls: RpcLockedSeek) => {
            const { currCycleBeginningLockedAmount } = ls
            return result + currCycleBeginningLockedAmount
        },
        0,
    ) as MSats

    const lockedBalanceCents = (lockedBalance * price) / 10 ** 11
    const pendingUnlockRequestCents = Math.floor(
        (lockedBalanceCents * (accountInfo.stagedCancellation ?? 0)) / 10000,
    )

    return {
        currCycleStartPrice: price,
        stagedBalance,
        lockedBalance,
        idleBalance: accountInfo.idleBalance,
        // Cents
        pendingUnlockRequest: pendingUnlockRequestCents,
    }
}
