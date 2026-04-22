import type { TFunction } from 'i18next'

import type { MSats } from '../types'
import type { AmountSymbolPosition, FormattedAmounts } from '../types/amount'
import type { RpcGuardianRemittanceDayBucket } from '../types/bindings'

type FormatMSats = (
    amount: MSats,
    symbolPosition?: AmountSymbolPosition,
    useBtcThreshold?: boolean,
) => FormattedAmounts

export type GuardianFeeHistoryRow = RpcGuardianRemittanceDayBucket & {
    id: string
}

export type GuardianFeeHistoryRowDisplay = {
    title: string
    subtitle: string
    amount: string
    secondaryAmount: string
    timestamp: null
    amountState: 'settled'
}

export const formatGuardianFeeModuleLabel = (module: string, t: TFunction) => {
    switch (module) {
        case 'ln':
            return t('words.lightning')
        case 'mint':
            return t('words.ecash')
        case 'wallet':
            return t('words.onchain')
        case 'multi_sig_stability_pool':
        case 'stability_pool':
            return t('feature.stabilitypool.stable-balance')
        default:
            return module.replace(/_/g, ' ')
    }
}

export const makeGuardianFeeHistoryRows = (
    dayBuckets: Array<RpcGuardianRemittanceDayBucket>,
): GuardianFeeHistoryRow[] =>
    dayBuckets.map(bucket => ({
        ...bucket,
        id: bucket.dayKey,
    }))

export const makeGuardianFeeFormattedAmounts = (
    amount: MSats,
    makeFormattedAmountsFromMSats: FormatMSats,
) => makeFormattedAmountsFromMSats(amount, 'end')

export const makeGuardianFeeHistoryRowDisplay = (
    row: GuardianFeeHistoryRow,
    t: TFunction,
    makeFormattedAmountsFromMSats: FormatMSats,
): GuardianFeeHistoryRowDisplay => {
    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeGuardianFeeFormattedAmounts(
            row.totalAmountRemitted as MSats,
            makeFormattedAmountsFromMSats,
        )

    return {
        title: t('feature.guardian-fees.daily-fees-earned'),
        subtitle: row.dayKey,
        amount: formattedPrimaryAmount,
        secondaryAmount: formattedSecondaryAmount,
        timestamp: null,
        amountState: 'settled',
    }
}

export const makeGuardianFeeDetailItems = (
    row: GuardianFeeHistoryRow,
    t: TFunction,
    makeFormattedAmountsFromMSats: FormatMSats,
) => {
    const items = row.moduleTotals.map(moduleTotal => {
        const { formattedPrimaryAmount, formattedSecondaryAmount } =
            makeGuardianFeeFormattedAmounts(
                moduleTotal.totalAmount as MSats,
                makeFormattedAmountsFromMSats,
            )

        return {
            label: formatGuardianFeeModuleLabel(moduleTotal.module, t),
            value: `${formattedPrimaryAmount} (${formattedSecondaryAmount})`,
        }
    })

    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeGuardianFeeFormattedAmounts(
            row.totalAmountRemitted as MSats,
            makeFormattedAmountsFromMSats,
        )
    items.push({
        label: t('phrases.total-fees'),
        value: `${formattedPrimaryAmount} (${formattedSecondaryAmount})`,
    })

    return items
}

export const makeGuardianFeeDetailProps = (
    row: GuardianFeeHistoryRow,
    t: TFunction,
    makeFormattedAmountsFromMSats: FormatMSats,
) => {
    const display = makeGuardianFeeHistoryRowDisplay(
        row,
        t,
        makeFormattedAmountsFromMSats,
    )

    return {
        title: display.title,
        amount: display.amount,
        secondaryAmount: display.secondaryAmount,
        items: makeGuardianFeeDetailItems(
            row,
            t,
            makeFormattedAmountsFromMSats,
        ),
    }
}
