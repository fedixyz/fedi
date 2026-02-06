import { TFunction } from 'i18next'

import { FeeItem } from '../hooks/transactions'
import {
    MSats,
    SupportedCurrency,
    TransactionStatusBadge,
    TransactionDirection,
    UsdCents,
    TransactionAmountState,
    TransactionListEntry,
    SelectableCurrency,
    MultispendTransactionListEntry,
    MatrixRoomMember,
    Sats,
    MultispendActiveInvitation,
    MultispendFinalized,
} from '../types'
import { AmountSymbolPosition, FormattedAmounts } from '../types/amount'
import { FiatFXInfo, RpcTransaction } from '../types/bindings'
import amountUtils from './AmountUtils'
import dateUtils from './DateUtils'
import { getCurrencyCode } from './currency'
import {
    getMultispendInvite,
    isMultispendDepositEvent,
    isMultispendWithdrawalEvent,
    isMultispendWithdrawalRejected,
    makeNameWithSuffix,
} from './matrix'

export interface DetailItem {
    label: string
    value: string
    truncated?: boolean
    copyable?: boolean
    copiedMessage?: string
}

export const getTxnDirection = (
    txn: TransactionListEntry,
): TransactionDirection => {
    switch (txn.kind) {
        case 'lnPay':
        case 'onchainWithdraw':
        case 'oobSend':
        case 'spDeposit':
        case 'sPV2Deposit':
        case 'sPV2TransferOut':
        case 'multispendWithdrawal':
            return TransactionDirection.send
        default:
            txn.kind satisfies
                | 'lnReceive'
                | 'lnRecurringdReceive'
                | 'onchainDeposit'
                | 'oobReceive'
                | 'spWithdraw'
                | 'sPV2Withdrawal'
                | 'sPV2TransferIn'
                | 'multispendDeposit'
            return TransactionDirection.receive
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
        case 'lnRecurringdReceive':
            return t('words.lnurl')
        case 'spDeposit':
        case 'spWithdraw':
        case 'sPV2Deposit':
        case 'sPV2Withdrawal':
            return t('feature.stabilitypool.stable-balance')
        case 'sPV2TransferIn':
        case 'sPV2TransferOut':
            return isMultispendTransfer(txn)
                ? t('words.multispend')
                : t('feature.stabilitypool.stable-balance')
        case 'oobSend':
        case 'oobReceive':
            return t('words.ecash')
        case 'multispendDeposit':
            return t('words.deposit')
        case 'multispendWithdrawal':
            return t('words.withdrawal')
        default:
            txn satisfies never
            return t('words.unknown')
    }
}

export const makeTxnDetailTitleText = (
    t: TFunction,
    txn: TransactionListEntry,
): string => {
    // there should always be a state, but return unknown just in case
    if (!txn.state) return t('words.unknown')

    switch (txn.kind) {
        case 'lnPay':
        case 'oobSend':
        case 'onchainWithdraw':
            return t('feature.send.you-sent')
        case 'spDeposit':
        case 'sPV2Deposit':
            return t('feature.stabilitypool.you-deposited')
        case 'spWithdraw':
        case 'sPV2Withdrawal':
            return t('feature.stabilitypool.you-withdrew')
        case 'oobReceive':
            return t('feature.receive.you-received')
        case 'lnReceive':
        case 'lnRecurringdReceive':
            switch (txn.state.type) {
                case 'claimed':
                    return t('feature.receive.you-received')
                case 'canceled':
                    return t('words.expired')
                default:
                    txn.state.type satisfies
                        | 'created'
                        | 'funded'
                        | 'awaitingFunds'
                        | 'waitingForPayment'
                    return t('phrases.receive-pending')
            }
        case 'onchainDeposit':
            switch (txn.state.type) {
                case 'waitingForTransaction':
                    return t('phrases.address-created')
                case 'claimed':
                    return t('feature.receive.you-received')
                case 'failed':
                    return t('words.failed')
                default:
                    txn.state.type satisfies
                        | 'confirmed'
                        | 'waitingForConfirmation'
                    return t('phrases.receive-pending')
            }
        case 'sPV2TransferIn':
            switch (txn.state.type) {
                case 'completedTransfer':
                    switch (txn.state.kind) {
                        case 'multispend':
                            return t('feature.stabilitypool.you-withdrew')
                        default:
                            txn.state.kind satisfies 'unknown'
                            return t('feature.receive.you-received')
                    }
                default:
                    txn.state.type satisfies 'dataNotInCache'
                    return t('feature.receive.you-received')
            }
        case 'sPV2TransferOut':
            switch (txn.state.type) {
                case 'completedTransfer':
                    switch (txn.state.kind) {
                        case 'multispend':
                            return t('feature.stabilitypool.you-deposited')
                        default:
                            txn.state.kind satisfies
                                | 'unknown'
                                | 'spTransferUi'
                                | 'matrixSpTransfer'
                            return t('feature.send.you-sent')
                    }
                default:
                    txn.state.type satisfies 'dataNotInCache'
                    return t('feature.send.you-sent')
            }
        case 'multispendDeposit':
            return t('feature.stabilitypool.you-deposited')
        case 'multispendWithdrawal':
            return t('feature.stabilitypool.you-withdrew')
        default:
            txn satisfies never
            return t('words.unknown')
    }
}

const makeTxnSign = (txn: TransactionListEntry, flipSign: boolean): string => {
    const direction = getTxnDirection(txn)
    const isTransfer =
        txn.kind === 'sPV2TransferIn' || txn.kind === 'sPV2TransferOut'
    const isPlus = !(flipSign && !isTransfer)
        ? direction === 'receive'
        : direction === 'send'
    let s = direction ? (isPlus ? `+` : `-`) : ''

    // Adjust for special cases
    if (
        txn.kind === 'onchainDeposit' &&
        txn.state?.type === 'waitingForTransaction'
    ) {
        s = `~`
    }
    // LN pay and receive states can be canceled and should not show a sign
    if (
        (txn.kind === 'lnPay' ||
            txn.kind === 'lnReceive' ||
            txn.kind === 'lnRecurringdReceive') &&
        txn.state?.type === 'canceled'
    ) {
        s = ''
    }

    return s
}

export const makeTxnAmountText = (
    txn: TransactionListEntry,
    txnDisplay: 'sats' | 'fiat',
    // we use the opposite signs on the stabilitypool txn list
    flipSign: boolean,
    includeCurrency: boolean,
    preferredCurrency: string,
    makeFormattedAmountsFromMSats: (
        amt: MSats,
        symbolPosition?: AmountSymbolPosition,
    ) => FormattedAmounts,
    convertCentsToFormattedFiat: (
        amt: UsdCents,
        symbolPosition?: AmountSymbolPosition,
    ) => string,
    convertSatsToFormattedFiat: (
        amt: Sats,
        symbolPosition?: AmountSymbolPosition,
        txDateFiatInfo?: FiatFXInfo,
    ) => string,
): string => {
    const { amount } = txn
    const { formattedSats } = makeFormattedAmountsFromMSats(amount, 'end')
    const [amt, satsSymbol] = formattedSats.split(' ')
    const sign = makeTxnSign(txn, flipSign)
    let formattedAmount: string = amt
    let currency = txnDisplay === 'fiat' ? preferredCurrency : satsSymbol

    if (
        txn.kind === 'onchainDeposit' &&
        txn.state?.type === 'waitingForTransaction'
    ) {
        formattedAmount = ''
    }

    if (txnDisplay === 'fiat') {
        // If fiat amounts should be shown and historical info is present, use it:
        if (txn.txDateFiatInfo) {
            const sats = amountUtils.msatToSat(txn.amount)
            // Use the historical exchange rate from txDateFiatInfo:
            formattedAmount = convertSatsToFormattedFiat(
                sats,
                'none',
                txn.txDateFiatInfo,
            )
            currency = txn.txDateFiatInfo.fiatCode
        } else {
            const { formattedFiat } = makeFormattedAmountsFromMSats(
                amount,
                'none',
            )
            formattedAmount = formattedFiat

            if (txn.kind === 'spWithdraw' && txn.state) {
                const estimatedWithdrawalCents = Number(
                    txn.state.estimated_withdrawal_cents,
                ) as UsdCents
                formattedAmount = convertCentsToFormattedFiat(
                    estimatedWithdrawalCents,
                    'none',
                )
            } else if (
                txn.kind === 'sPV2Withdrawal' &&
                (txn.state.type === 'pendingWithdrawal' ||
                    txn.state.type === 'completedWithdrawal')
            ) {
                // TODO: validate this unit is correct
                const fiatAmount = Number(txn.state.fiat_amount) as UsdCents
                formattedAmount = convertCentsToFormattedFiat(
                    fiatAmount,
                    'none',
                )
            } else if (
                txn.kind === 'spDeposit' &&
                txn.state.type === 'completeDeposit'
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
                (txn.state.type === 'pendingDeposit' ||
                    txn.state.type === 'completedDeposit')
            ) {
                // TODO: validate this unit is correct
                const fiatAmount = Number(txn.state.fiat_amount) as UsdCents
                formattedAmount = convertCentsToFormattedFiat(
                    fiatAmount,
                    'none',
                )
            } else if (
                (txn.kind === 'sPV2TransferIn' ||
                    txn.kind === 'sPV2TransferOut') &&
                txn.state.type === 'completedTransfer'
            ) {
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
        formattedAmount = ''
    }

    return `${sign}${formattedAmount}${includeCurrency ? ` ${currency}` : ''}`
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
                    // TODO+TEST: Cover test cases for failedDeposit and dataNotInCache
                    default:
                        return t('words.deposit')
                }
            } else if (
                txn.kind === 'sPV2TransferOut' &&
                isMultispendTransfer(txn)
            ) {
                return t('words.deposit')
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
            } else if (txn.kind === 'lnRecurringdReceive') {
                switch (txn.state?.type) {
                    case 'waitingForPayment':
                    case 'funded':
                    case 'awaitingFunds':
                        // TODO: fix bug in fedimint where payments get stuck
                        // in the created state despite being settled.
                        // case 'created':
                        return t('words.pending')
                    case 'canceled':
                        return t('words.expired')
                    // TODO+TEST: Figure out which 'bug' this is in reference to + remove?
                    case 'created': // Remove this once bug is fixed
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
                        return t('words.received')
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
                    // TODO+TEST: Cover test cases for failedWithdrawal
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
                // TODO+TEST: Cover test cases for other multispend transactions
            } else if (
                txn.kind === 'sPV2TransferIn' &&
                isMultispendTransfer(txn)
            ) {
                return t('words.withdrawal')
            } else {
                // TODO+TEST: We should probably not fall back to a success state
                return t('words.received')
            }
        default:
            // TODO+TEST: we should probably not fall back to an empty string
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
                    // TODO+TEST: Handle `failedDeposit` state
                    default:
                        break
                }
            } else if (txn.kind === 'sPV2TransferOut') {
                // TODO+TEST: Handle `dataNotInCache` state and different kinds (sp transfer ui, multispend, etc)
                badge = 'outgoing'
                break
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
            } else if (txn.kind === 'lnRecurringdReceive') {
                switch (txn.state?.type) {
                    case 'claimed':
                    case 'created': // Remove this once bug is fixed
                        // TODO+TEST: Identify what "bug" refers to and set to "pending" if the bug is fixed
                        badge = 'incoming'
                        break
                    case 'canceled':
                        badge = 'expired'
                        break
                    // TODO: fix bug in fedimint where payments get stuck
                    // in the created state despite being settled.
                    // case 'created':
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
                    // TODO+TEST: Handle `failedWithdrawal` state
                    case 'pendingWithdrawal':
                    default:
                        badge = 'pending'
                        break
                }
            } else if (txn.kind === 'sPV2TransferIn') {
                badge = 'incoming'
                break
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

    if (
        txn.kind === 'multispendDeposit' ||
        txn.kind === 'multispendWithdrawal'
    ) {
        if (isMultispendDepositEvent(txn.state)) {
            badge = 'incoming'
        } else if (isMultispendWithdrawalEvent(txn.state)) {
            const txStatus =
                txn.state.event.withdrawalRequest.txSubmissionStatus
            if (txStatus === 'unknown') {
                badge = 'pending'
            } else if ('accepted' in txStatus) {
                badge = 'outgoing'
            } else if ('rejected' in txStatus) {
                badge = 'failed'
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
    txnDisplay: 'sats' | 'fiat',
    makeFormattedAmountsFromMSats: (amt: MSats) => FormattedAmounts,
    convertCentsToFormattedFiat: (amt: UsdCents) => string,
) => {
    const items: DetailItem[] = []
    const { formattedFiat } = makeFormattedAmountsFromMSats(txn.amount)

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
        if (txnDisplay === 'sats' && txn.state) {
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
        (txn.kind === 'lnReceive' ||
            txn.kind === 'lnPay' ||
            // TODO+TEST: lnRecurringdReceive does not have an ln_invoice field
            txn.kind === 'lnRecurringdReceive') &&
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
    if (txn.kind === 'onchainDeposit' || txn.kind === 'onchainWithdraw') {
        if (txn.state && 'txid' in txn.state) {
            items.push({
                label: t('phrases.transaction-id'),
                value: txn.state.txid,
                copiedMessage: t('phrases.copied-transaction-id'),
                copyable: true,
                truncated: true,
            })
        }
        if (txn.state && 'error' in txn.state) {
            items.push({
                label: t('words.reason'),
                value: txn.state.error,
            })
        }
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

    return items
}

// TODO+TEST: Consider using within `makeTxnDetailTitleText`?
// Can remain as its own function but worth unifying to avoid the `words.unknown` fallback
export const makeStabilityTxnDetailTitleText = (
    t: TFunction,
    // TODO+TEST: Consider using a type only including stability transactions to avoid the `words.unknown` fallback
    txn: TransactionListEntry,
) => {
    if (txn.kind === 'spDeposit' || txn.kind === 'sPV2Deposit') {
        return t('feature.stabilitypool.you-deposited')
    } else if (txn.kind === 'sPV2TransferOut') {
        return isMultispendTransfer(txn)
            ? t('feature.stabilitypool.you-deposited')
            : t('feature.send.you-sent')
    }

    if (txn.kind === 'sPV2Withdrawal' || txn.kind === 'spWithdraw') {
        return t('feature.stabilitypool.you-withdrew')
    } else if (txn.kind === 'sPV2TransferIn') {
        return isMultispendTransfer(txn)
            ? t('feature.stabilitypool.you-withdrew')
            : t('feature.receive.you-received')
    }
    return t('words.unknown')
}

// TODO+TEST: Consider merging/using this from makeTxnDetailItems as it takes the same inputs and a lot of logic seems duplicated
export const makeStabilityTxnDetailItems = (
    t: TFunction,
    txn: TransactionListEntry,
    makeFormattedAmountsFromMSats: (amt: MSats) => FormattedAmounts,
) => {
    const items: DetailItem[] = []
    const { formattedSats } = makeFormattedAmountsFromMSats(txn.amount)

    // Hide BTC Equivalent item when amount is zero or SATS-first setting is on
    if (txn.amount !== 0) {
        if (txn.kind === 'spDeposit' || txn.kind === 'sPV2Deposit') {
            items.push({
                label: t('feature.stabilitypool.deposit-amount'),
                value: formattedSats,
            })
            // treat only multispend transfers as deposits.
        } else if (txn.kind === 'sPV2TransferIn') {
            if (isMultispendTransfer(txn)) {
                items.push({
                    label: t('feature.stabilitypool.deposit-amount'),
                    value: formattedSats,
                })
            } else {
                items.push({
                    label: t('feature.stabilitypool.transfer-amount'),
                    value: formattedSats,
                })
            }
        } else if (txn.kind === 'spWithdraw' || txn.kind === 'sPV2Withdrawal') {
            items.push({
                label: t('feature.stabilitypool.withdrawal-amount'),
                value: formattedSats,
            })
        } else if (txn.kind === 'sPV2TransferOut') {
            if (isMultispendTransfer(txn)) {
                items.push({
                    label: t('feature.stabilitypool.withdrawal-amount'),
                    value: formattedSats,
                })
            } else {
                items.push({
                    label: t('feature.stabilitypool.transfer-amount'),
                    value: formattedSats,
                })
            }
        }
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

export const makeMultispendTxnStatusText = (
    t: TFunction,
    txn: MultispendTransactionListEntry,
    multispendStatus:
        | MultispendActiveInvitation
        | MultispendFinalized
        | undefined,
    // allows for minor tweaks to txn status when exporting to CSV
    // for major changes, please create a new makeMultispendTxnCsvStatusText function
    csvExport?: boolean,
): string => {
    if (
        // there should always be a state, but return unknown just in case
        !txn.state ||
        !multispendStatus ||
        // group should always be finalized at this point
        multispendStatus.status !== 'finalized'
    )
        return t('words.unknown')

    // TODO+TEST: Perhaps using `is Type` assertion functions would be better than `in txn.event`
    if (isMultispendDepositEvent(txn.state))
        return csvExport ? t('words.complete') : t('words.deposit')
    if (isMultispendWithdrawalEvent(txn.state)) {
        const txStatus = txn.state.event.withdrawalRequest.txSubmissionStatus

        if (txStatus === 'unknown') return t('words.pending')
        if ('accepted' in txStatus)
            return csvExport ? t('words.complete') : t('words.withdrawal')
        if ('rejected' in txStatus) return t('words.failed')

        const invitation = getMultispendInvite(multispendStatus)

        // finalized multispends should always have an invitation
        if (!invitation) return t('words.unknown')

        if (isMultispendWithdrawalRejected(txn.state, multispendStatus))
            return t('words.failed')

        return t('words.pending')
    }
    return t('words.unknown')
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

    // TODO+TEST: Inconsistent time format compared to other *TxnDetailItems functions
    items.push({
        label: t('words.time'),
        value: dateUtils.formatTimestamp(
            Number((txn.time / 1000).toFixed(0)),
            'MMM dd yyyy, h:mmaaa',
        ),
    })

    if (isMultispendDepositEvent(txn.state)) {
        const deposit = txn.state.event.depositNotification
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

    if (isMultispendWithdrawalEvent(txn.state)) {
        const withdrawalRequest = txn.state.event.withdrawalRequest
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

// temporary type helper until RpcTransaction and RpcTransactionListEntry are reconciled bridge-side
export const coerceTxn = (txn: RpcTransaction): TransactionListEntry => {
    return {
        ...txn,
        createdAt: txn.outcomeTime || 0,
    }
}

export const isMultispendTransfer = (txn: TransactionListEntry) => {
    return (
        (txn.kind === 'sPV2TransferOut' || txn.kind === 'sPV2TransferIn') &&
        txn.state.type === 'completedTransfer' &&
        txn.state.kind === 'multispend'
    )
}

export function shouldShowAskFedi(txn: TransactionListEntry): boolean {
    const direction = getTxnDirection(txn)

    switch (direction) {
        /* ------------------------------------------------------------------
         *  SEND-side flows
         * ------------------------------------------------------------------ */
        case TransactionDirection.send: {
            if (txn.kind === 'lnPay') {
                switch (txn.state?.type) {
                    case 'created':
                    case 'funded':
                    case 'awaitingChange':
                    case 'waitingForRefund':
                    case 'canceled':
                    case 'failed':
                    case 'refunded':
                        return true
                    // TODO+TEST: Should we hide the button for if `txn.state.type` is undefined?
                    // We should either use a whitelist of success states or just handle all states to avoid confusion
                    default:
                        return false
                }
            }

            if (txn.kind === 'onchainWithdraw') {
                switch (txn.state?.type) {
                    case 'succeeded':
                        return false
                    case 'failed':
                    default:
                        return true
                }
            }

            if (txn.kind === 'oobSend') {
                switch (txn.state?.type) {
                    case 'userCanceledSuccess':
                    case 'userCanceledProcessing':
                    case 'refunded':
                        return true
                    // TODO+TEST: we shouldn't hide the button if `txn.state.type` is undefined
                    default:
                        return false
                }
            }

            if (txn.kind === 'spDeposit' || txn.kind === 'sPV2Deposit') {
                switch (txn.state?.type) {
                    case 'pendingDeposit':
                    case 'failedDeposit':
                        return true
                    // TODO+TEST: Need to handle `dataNotInCache` states and show the "Ask Fedi" button for those
                    default:
                        return false
                }
            }

            return false
        }

        /* ------------------------------------------------------------------
         *  RECEIVE-side flows
         * ------------------------------------------------------------------ */
        case TransactionDirection.receive: {
            if (txn.kind === 'lnReceive') {
                switch (txn.state?.type) {
                    case 'canceled':
                    case 'waitingForPayment':
                    case 'created':
                    case 'funded':
                    case 'awaitingFunds':
                        return true
                    default:
                        return false
                }
            } else if (txn.kind === 'lnRecurringdReceive') {
                switch (txn.state?.type) {
                    case 'canceled':
                    case 'waitingForPayment':
                    case 'funded':
                    case 'awaitingFunds':
                        // case 'created':
                        // TODO: fix bug in fedimint where payments get stuck
                        // in the created state despite being settled.
                        return true
                    default:
                        return false
                }
            }

            if (txn.kind === 'onchainDeposit') {
                switch (txn.state?.type) {
                    case 'waitingForConfirmation':
                    case 'waitingForTransaction':
                    case 'confirmed':
                    case 'failed':
                        return true
                    default:
                        return false
                }
            }

            if (txn.kind === 'spWithdraw' || txn.kind === 'sPV2Withdrawal') {
                switch (txn.state?.type) {
                    case 'dataNotInCache':
                    case 'pendingWithdrawal':
                    case 'failedWithdrawal':
                        return true
                    default:
                        return false
                }
            }

            if (txn.kind === 'oobReceive') {
                switch (txn.state?.type) {
                    case 'created':
                    case 'issuing':
                    case 'failed':
                        return true
                    default:
                        return false
                }
            }

            // Fallback – any other receive kind
            return false
        }

        //  Unknown / unexpected direction
        default:
            return false
    }
}
