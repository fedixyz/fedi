import { setupStore } from '@fedi/common/redux'
import {
    selectStabilityTransactionHistory,
    selectTransactions,
} from '@fedi/common/redux/transactions'

import { makeTestTxnEntry } from '../../utils/transaction'

describe('transactions selectors', () => {
    it('should exclude guardian remittance withdrawals from stable balance history', () => {
        const federationId = 'fedimint-id'
        const stableWithdrawal = makeTestTxnEntry('sPV2Withdrawal', {
            id: 'stable-withdrawal',
        })
        const guardianWithdrawal = makeTestTxnEntry('sPV2Withdrawal', {
            id: 'guardian-withdrawal',
            guardian_remittance: true,
        })
        const deposit = makeTestTxnEntry('sPV2Deposit', {
            id: 'stable-deposit',
        })

        const store = setupStore({
            transactions: {
                [federationId]: {
                    transactions: [
                        stableWithdrawal,
                        guardianWithdrawal,
                        deposit,
                    ],
                },
            },
        })

        expect(
            selectStabilityTransactionHistory(store.getState(), federationId),
        ).toEqual([stableWithdrawal, deposit])
        expect(selectTransactions(store.getState(), federationId)).toEqual([
            stableWithdrawal,
            guardianWithdrawal,
            deposit,
        ])
    })
})
