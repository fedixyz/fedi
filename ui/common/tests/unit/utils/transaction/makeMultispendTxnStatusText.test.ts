import { t } from 'i18next'

import {
    MultispendActiveInvitation,
    MultispendFinalized,
} from '../../../../types'
import { makeMultispendTxnStatusText } from '../../../../utils/transaction'
import {
    makeTestGroupInvitationWithKeys,
    makeTestMultispendTxnEntry,
    makeTestMultispendWithdrawRequest,
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
    it('should display the correct status for a multispend transaction', () => {
        const deposit = makeTestMultispendTxnEntry('deposit')
        const withdrawalPending = makeTestMultispendTxnEntry('withdrawal', {
            event: {
                withdrawalRequest: makeTestMultispendWithdrawRequest('unknown'),
            },
        })
        const withdrawalAccepted = makeTestMultispendTxnEntry('withdrawal', {
            event: {
                withdrawalRequest:
                    makeTestMultispendWithdrawRequest('accepted'),
            },
        })
        const withdrawalRejected = makeTestMultispendTxnEntry('withdrawal', {
            event: {
                withdrawalRequest:
                    makeTestMultispendWithdrawRequest('rejected'),
            },
        })

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
        const deposit = makeTestMultispendTxnEntry('deposit')
        const withdrawalPending = makeTestMultispendTxnEntry('withdrawal', {
            event: {
                withdrawalRequest: makeTestMultispendWithdrawRequest('unknown'),
            },
        })
        const withdrawalAccepted = makeTestMultispendTxnEntry('withdrawal', {
            event: {
                withdrawalRequest:
                    makeTestMultispendWithdrawRequest('accepted'),
            },
        })
        const withdrawalRejected = makeTestMultispendTxnEntry('withdrawal', {
            event: {
                withdrawalRequest:
                    makeTestMultispendWithdrawRequest('rejected'),
            },
        })

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
        const txn = makeTestMultispendTxnEntry('deposit')
        const statusText = makeMultispendTxnStatusText(
            t,
            txn,
            multispendActiveInvitationStatus,
        )

        expect(statusText).toBe(t('words.unknown'))
    })
})
