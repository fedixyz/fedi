import {
    MultispendActiveInvitation,
    MultispendFinalized,
    MultispendTransactionListEntry,
} from '../../../../types'
import { makeMultispendTxnStatusText } from '../../../../utils/transaction'
import { createMockT } from '../../../utils/setup'
import {
    makeTestGroupInvitationWithKeys,
    makeTestMultispendWithdrawalEventData,
    makeTestTxnEntry,
} from '../../../utils/transaction'

const multispendFinalizedStatus: MultispendFinalized = {
    status: 'finalized',
    invite_event_id: '123',
    finalized_group: makeTestGroupInvitationWithKeys(),
}

const multispendActiveInvitationStatus: MultispendActiveInvitation = {
    status: 'activeInvitation',
    active_invite_id: '123',
    state: makeTestGroupInvitationWithKeys(),
}

describe('makeMultispendTxnStatusText', () => {
    const t = createMockT()

    it('should display the correct status for a multispend transaction', () => {
        const deposit = makeTestTxnEntry(
            'multispendDeposit',
        ) as MultispendTransactionListEntry
        const withdrawalPending = makeTestTxnEntry('multispendWithdrawal', {
            state: makeTestMultispendWithdrawalEventData('unknown'),
        }) as MultispendTransactionListEntry
        const withdrawalAccepted = makeTestTxnEntry('multispendWithdrawal', {
            state: makeTestMultispendWithdrawalEventData('accepted'),
        }) as MultispendTransactionListEntry
        const withdrawalRejected = makeTestTxnEntry('multispendWithdrawal', {
            state: makeTestMultispendWithdrawalEventData('rejected'),
        }) as MultispendTransactionListEntry

        expect(
            makeMultispendTxnStatusText(t, deposit, multispendFinalizedStatus),
        ).toBe(t('words.deposit'))
        expect(
            makeMultispendTxnStatusText(
                t,
                withdrawalPending,
                multispendFinalizedStatus,
            ),
        ).toBe(t('words.pending'))
        expect(
            makeMultispendTxnStatusText(
                t,
                withdrawalAccepted,
                multispendFinalizedStatus,
            ),
        ).toBe(t('words.withdrawal'))
        expect(
            makeMultispendTxnStatusText(
                t,
                withdrawalRejected,
                multispendFinalizedStatus,
            ),
        ).toBe(t('words.failed'))
    })

    it('should display "complete" for completed txns instead of "withdrawal"/"deposit" if csvExport is enabled', () => {
        const deposit = makeTestTxnEntry(
            'multispendDeposit',
        ) as MultispendTransactionListEntry
        const withdrawalPending = makeTestTxnEntry('multispendWithdrawal', {
            state: makeTestMultispendWithdrawalEventData('unknown'),
        }) as MultispendTransactionListEntry
        const withdrawalAccepted = makeTestTxnEntry('multispendWithdrawal', {
            state: makeTestMultispendWithdrawalEventData('accepted'),
        }) as MultispendTransactionListEntry
        const withdrawalRejected = makeTestTxnEntry('multispendWithdrawal', {
            state: makeTestMultispendWithdrawalEventData('rejected'),
        }) as MultispendTransactionListEntry

        expect(
            makeMultispendTxnStatusText(
                t,
                deposit,
                multispendFinalizedStatus,
                true,
            ),
        ).toBe(t('words.complete'))
        expect(
            makeMultispendTxnStatusText(
                t,
                withdrawalPending,
                multispendFinalizedStatus,
                true,
            ),
        ).toBe(t('words.pending'))
        expect(
            makeMultispendTxnStatusText(
                t,
                withdrawalAccepted,
                multispendFinalizedStatus,
                true,
            ),
        ).toBe(t('words.complete'))
        expect(
            makeMultispendTxnStatusText(
                t,
                withdrawalRejected,
                multispendFinalizedStatus,
                true,
            ),
        ).toBe(t('words.failed'))
    })

    it('should return "unknown" for a non-finalized multispend status', () => {
        const txn = makeTestTxnEntry(
            'multispendDeposit',
        ) as MultispendTransactionListEntry
        const statusText = makeMultispendTxnStatusText(
            t,
            txn,
            multispendActiveInvitationStatus,
        )

        expect(statusText).toBe(t('words.unknown'))
    })
})
