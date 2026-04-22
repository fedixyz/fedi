import type { MSats } from '../../../types'
import {
    formatGuardianFeeModuleLabel,
    makeGuardianFeeDetailItems,
    makeGuardianFeeDetailProps,
    makeGuardianFeeFormattedAmounts,
    makeGuardianFeeHistoryRows,
    makeGuardianFeeHistoryRowDisplay,
} from '../../../utils/guardianFees'
import { createMockT } from '../../utils/setup'

const makeFormattedAmountsFromMSats = (amount: MSats) => {
    const sats = Number(amount) / 1000

    return {
        formattedFiat: `$${sats}`,
        formattedSats: `${sats} SATS`,
        formattedUsd: `$${sats}`,
        formattedPrimaryAmount: `$${sats}`,
        formattedSecondaryAmount: `${sats} SATS`,
    }
}

describe('guardianFees utils', () => {
    const t = createMockT({
        'words.lightning': 'Lightning',
        'words.ecash': 'Ecash',
        'words.onchain': 'On-chain',
        'feature.guardian-fees.daily-fees-earned': 'Daily fees earned',
        'feature.settings.guardian-fees': 'Guardian fees',
        'feature.stabilitypool.stable-balance': 'Stable Balance',
        'phrases.total-fees': 'Total Fees',
    })

    it('should map day buckets to history rows keyed by day', () => {
        const rows = makeGuardianFeeHistoryRows([
            {
                dayKey: '2026-04-22',
                totalAmountRemitted: 10_000 as MSats,
                remittanceCount: 1,
                moduleTotals: [],
            },
        ])

        expect(rows).toEqual([
            {
                id: '2026-04-22',
                dayKey: '2026-04-22',
                totalAmountRemitted: 10_000,
                remittanceCount: 1,
                moduleTotals: [],
            },
        ])
    })

    it('should format known and fallback module labels', () => {
        expect(formatGuardianFeeModuleLabel('ln', t)).toBe('Lightning')
        expect(formatGuardianFeeModuleLabel('mint', t)).toBe('Ecash')
        expect(formatGuardianFeeModuleLabel('wallet', t)).toBe('On-chain')
        expect(formatGuardianFeeModuleLabel('some_custom_module', t)).toBe(
            'some custom module',
        )
    })

    it('should format row display and module detail values', () => {
        const row = makeGuardianFeeHistoryRows([
            {
                dayKey: '2026-04-22',
                totalAmountRemitted: 40_000 as MSats,
                remittanceCount: 2,
                moduleTotals: [
                    { module: 'ln', totalAmount: 10_000 as MSats },
                    { module: 'wallet', totalAmount: 30_000 as MSats },
                ],
            },
        ])[0]

        expect(
            makeGuardianFeeHistoryRowDisplay(
                row,
                t,
                makeFormattedAmountsFromMSats,
            ),
        ).toEqual({
            title: 'Daily fees earned',
            subtitle: '2026-04-22',
            amount: '$40',
            secondaryAmount: '40 SATS',
            timestamp: null,
            amountState: 'settled',
        })
        expect(
            makeGuardianFeeFormattedAmounts(
                row.totalAmountRemitted as MSats,
                makeFormattedAmountsFromMSats,
            ),
        ).toMatchObject({
            formattedPrimaryAmount: '$40',
            formattedSecondaryAmount: '40 SATS',
        })
        expect(
            makeGuardianFeeDetailItems(row, t, makeFormattedAmountsFromMSats),
        ).toEqual([
            { label: 'Lightning', value: '$10 (10 SATS)' },
            { label: 'On-chain', value: '$30 (30 SATS)' },
            { label: 'Total Fees', value: '$40 (40 SATS)' },
        ])
        expect(
            makeGuardianFeeDetailProps(row, t, makeFormattedAmountsFromMSats),
        ).toEqual({
            title: 'Daily fees earned',
            amount: '$40',
            secondaryAmount: '40 SATS',
            items: [
                { label: 'Lightning', value: '$10 (10 SATS)' },
                { label: 'On-chain', value: '$30 (30 SATS)' },
                { label: 'Total Fees', value: '$40 (40 SATS)' },
            ],
        })
    })
})
