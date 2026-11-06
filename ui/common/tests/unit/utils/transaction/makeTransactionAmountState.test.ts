import { MSats, TransactionListEntry } from '@fedi/common/types'

import { makeTransactionAmountState } from '../../../../utils/transaction'
import { makeTestTxnEntry } from '../../../utils/transaction'

describe('makeTransactionAmountState', () => {
    const refundedPay = (federationFee: MSats | null) =>
        makeTestTxnEntry('lnPay', {
            amount: (federationFee ?? 252_750) as MSats,
            federationFee,
            state: { type: 'refunded', gateway_error: 'error' },
        })

    it.each<[string, TransactionListEntry, string]>([
        ['an attempt that cost money', refundedPay(4_608 as MSats), 'settled'],
        ['an attempt that cost nothing', refundedPay(0 as MSats), 'failed'],
        ['an attempt without fee data', refundedPay(null), 'failed'],
        [
            'the debit of a cancelled send',
            makeTestTxnEntry('oobSend', {
                amount: 64_135 as MSats,
                federationFee: 0 as MSats,
                state: { type: 'userCanceledSuccess' },
            }),
            'settled',
        ],
    ])('shows %s as %s', (_, txn, expected) => {
        expect(makeTransactionAmountState(txn)).toBe(expected)
    })
})
