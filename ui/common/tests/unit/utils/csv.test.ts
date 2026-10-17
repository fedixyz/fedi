import {
    MSats,
    MultispendFinalized,
    MultispendTransactionListEntry,
    SupportedCurrency,
    UsdCents,
} from '../../../types'
import { MultispendGroupKind } from '../../../types/bindings'
import { makeMultispendTransactionHistoryCSV } from '../../../utils/csv'
import { mockRoomMembers } from '../../mock-data/matrix-event'
import { createMockT } from '../../utils/setup'
import {
    makeTestTxnEntry,
    makeTestWithdrawRequestWithApprovals,
    TEST_EVENT_ID,
    TEST_TXID,
} from '../../utils/transaction'

describe('makeMultispendTransactionHistoryCSV', () => {
    const t = createMockT()
    const convertCentsToFormattedFiat = (cents: UsdCents) =>
        (cents / 100).toFixed(2)

    const makeFinalizedGroup = (
        kind: MultispendGroupKind,
    ): MultispendFinalized => ({
        status: 'finalized',
        invite_event_id: TEST_EVENT_ID,
        finalized_group: {
            kind,
            invitation: {
                signers: [],
                threshold: 0,
                federationInviteCode: 'fed1',
                federationName: '',
            },
            proposer: mockRoomMembers[0].id,
            pubkeys: {},
            federationId: 'fed-1',
        },
    })

    const makeDeposit = (
        amount: { btcAmount: MSats } | { fiatAmount: UsdCents },
    ) =>
        makeTestTxnEntry('multispendDeposit', {
            createdAt: 0,
            state: {
                event: {
                    depositNotification: {
                        user: mockRoomMembers[0].id,
                        ...amount,
                        txid: TEST_TXID,
                        description: '',
                    },
                },
                eventId: TEST_EVENT_ID,
                time: 0,
                counter: 0,
            },
        }) as MultispendTransactionListEntry

    const makeWithdrawal = (kind: MultispendGroupKind, amount: number) =>
        makeTestTxnEntry('multispendWithdrawal', {
            createdAt: 1,
            state: {
                event: {
                    withdrawalRequest: {
                        ...makeTestWithdrawRequestWithApprovals(
                            'accepted',
                            amount,
                            kind,
                        ),
                        sender: mockRoomMembers[0].id,
                    },
                },
                eventId: TEST_EVENT_ID,
                time: 1,
                counter: 1,
            },
        }) as MultispendTransactionListEntry

    const parseCSV = (csv: string) => {
        const [header, ...rows] = csv.split('\r\n')
        return [
            header.split(','),
            ...rows.map(row => row.slice(1, -1).split('","')),
        ]
    }

    it('exports sats for a bitcoin group', () => {
        const csv = makeMultispendTransactionHistoryCSV(
            [
                makeDeposit({ btcAmount: 1_000_000 as MSats }),
                makeWithdrawal('btc', 2_000_000),
            ],
            convertCentsToFormattedFiat,
            t,
            SupportedCurrency.EUR,
            makeFinalizedGroup('btc'),
            mockRoomMembers,
        )

        const [header, deposit, withdrawal] = parseCSV(csv)
        const satsIndex = header.indexOf('Amount (sats)')
        expect(satsIndex).toBeGreaterThan(-1)
        expect(header).not.toContain('Amount (USD)')
        expect(header).not.toContain('Amount (EUR)')
        expect(deposit[satsIndex]).toBe('1000')
        expect(withdrawal[satsIndex]).toBe('2000')
    })

    it('keeps the fiat columns for a stable balance group', () => {
        const csv = makeMultispendTransactionHistoryCSV(
            [
                makeDeposit({ fiatAmount: 1250 as UsdCents }),
                makeWithdrawal('fiat', 500),
            ],
            convertCentsToFormattedFiat,
            t,
            SupportedCurrency.EUR,
            makeFinalizedGroup('fiat'),
            mockRoomMembers,
        )

        const [header, deposit, withdrawal] = parseCSV(csv)
        expect(header).not.toContain('Amount (sats)')
        const usdIndex = header.indexOf('Amount (USD)')
        const eurIndex = header.indexOf('Amount (EUR)')
        expect(usdIndex).toBeGreaterThan(-1)
        expect(eurIndex).toBeGreaterThan(-1)
        expect(deposit[usdIndex]).toBe('12.50')
        expect(deposit[eurIndex]).toBe('12.50')
        expect(withdrawal[usdIndex]).toBe('5.00')
        expect(withdrawal[eurIndex]).toBe('5.00')
    })
})
