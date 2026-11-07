import { MSats, TransactionListEntry } from '../../../../types'
import {
    makeStabilityTxnDetailItems,
    makeStabilityTxnDetailTitleText,
    makeTxnDetailItems,
    makeTxnDetailTitleText,
    makeTxnStatusText,
} from '../../../../utils/transaction'
import { createMockT } from '../../../utils/setup'
import {
    makeTestSPV2WithdrawalState,
    makeTestTxnEntry,
} from '../../../utils/transaction'

describe('a withdrawal the sweeper initiated', () => {
    const t = createMockT()
    const makeAmounts = () =>
        ({ formattedSats: '500 SATS' }) as unknown as Parameters<
            typeof makeStabilityTxnDetailItems
        >[2] extends (amount: MSats) => infer R
            ? R
            : never
    const withdrawal = (sweeper_initiated: boolean): TransactionListEntry =>
        makeTestTxnEntry('sPV2Withdrawal', {
            amount: 500_000 as MSats,
            state: makeTestSPV2WithdrawalState('completedWithdrawal'),
            sweeper_initiated,
        })

    it('should read differently from a withdrawal the user asked for', () => {
        const swept = withdrawal(true)
        const asked = withdrawal(false)

        expect(makeTxnDetailTitleText(t, swept)).toBe(
            t('feature.stabilitypool.swept'),
        )
        expect(makeTxnDetailTitleText(t, asked)).toBe(
            t('feature.stabilitypool.you-withdrew'),
        )
        expect(makeStabilityTxnDetailTitleText(t, swept)).toBe(
            t('feature.stabilitypool.swept'),
        )
        expect(makeStabilityTxnDetailTitleText(t, asked)).toBe(
            t('feature.stabilitypool.you-withdrew'),
        )
        expect(makeTxnStatusText(t, swept)).toBe(
            t('feature.stabilitypool.swept'),
        )
        expect(makeTxnStatusText(t, asked)).toBe(t('words.withdrawal'))
    })

    it('should still read as pending until the sweep completes', () => {
        const pending = makeTestTxnEntry('sPV2Withdrawal', {
            state: makeTestSPV2WithdrawalState('pendingWithdrawal'),
            sweeper_initiated: true,
        })

        expect(makeTxnStatusText(t, pending)).toBe(t('words.pending'))
    })

    it('should explain why only when the sweeper did it', () => {
        const reason = {
            label: t('words.reason'),
            value: t('feature.stabilitypool.swept-reason'),
        }

        expect(
            makeStabilityTxnDetailItems(t, withdrawal(true), makeAmounts),
        ).toContainEqual(reason)
        expect(
            makeStabilityTxnDetailItems(t, withdrawal(false), makeAmounts),
        ).not.toContainEqual(reason)

        const makeDetailItems = (txn: TransactionListEntry) =>
            makeTxnDetailItems(
                t,
                txn,
                undefined,
                'sats',
                makeAmounts,
                () => '0.00 USD',
            )
        expect(makeDetailItems(withdrawal(true))).toContainEqual(reason)
        expect(makeDetailItems(withdrawal(false))).not.toContainEqual(reason)
    })
})
