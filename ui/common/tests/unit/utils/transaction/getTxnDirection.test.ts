import { TransactionDirection, TransactionListEntry } from '../../../../types'
import { RpcTransactionListEntry } from '../../../../types/bindings'
import { getTxnDirection } from '../../../../utils/transaction'
import { makeTestRpcTxnEntry } from '../../../utils/transaction'

describe('getTxnDirection', () => {
    it('should correctly determine the direction of a transaction based on its kind', () => {
        // A `Record` is being used here since it ensures that all cases are covered
        const expectedDirections: Record<
            // TODO:TEST: Cover test cases for multispend transactions
            Exclude<TransactionListEntry['kind'], 'multispend'>,
            TransactionDirection
        > = {
            lnPay: TransactionDirection.send,
            onchainWithdraw: TransactionDirection.send,
            oobSend: TransactionDirection.send,
            spDeposit: TransactionDirection.send,
            sPV2Deposit: TransactionDirection.send,
            sPV2TransferOut: TransactionDirection.send,
            lnReceive: TransactionDirection.receive,
            lnRecurringdReceive: TransactionDirection.receive,
            onchainDeposit: TransactionDirection.receive,
            oobReceive: TransactionDirection.receive,
            spWithdraw: TransactionDirection.receive,
            sPV2Withdrawal: TransactionDirection.receive,
            sPV2TransferIn: TransactionDirection.receive,
        }

        const entries = Object.entries(expectedDirections) as Array<
            [RpcTransactionListEntry['kind'], TransactionDirection]
        >

        for (const [kind, direction] of entries) {
            const txn = makeTestRpcTxnEntry(kind)
            const dir = getTxnDirection(txn)
            expect(dir).toBe(direction)
        }
    })
})
