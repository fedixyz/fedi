import { isMultispendTransfer } from '../../../../utils/transaction'
import {
    makeTestTxnEntry,
    makeTestSPV2TransferInState,
    makeTestSPV2TransferOutState,
} from '../../../utils/transaction'

describe('isMultispendTxn', () => {
    it('should properly determine multispend transactions as sPV2TransferOut and sPV2TransferIn', () => {
        const sPV2TransferOut = makeTestTxnEntry('sPV2TransferOut', {
            state: makeTestSPV2TransferOutState(
                'completedTransfer',
                'multispend',
            ),
        })
        const sPV2TransferIn = makeTestTxnEntry('sPV2TransferIn', {
            state: makeTestSPV2TransferInState(
                'completedTransfer',
                'multispend',
            ),
        })

        expect(isMultispendTransfer(sPV2TransferOut)).toBe(true)
        expect(isMultispendTransfer(sPV2TransferIn)).toBe(true)
    })

    it('should return false for other transactions that are not multispend _transfers_', () => {
        const deposit = makeTestTxnEntry('multispendDeposit')
        const withdrawal = makeTestTxnEntry('multispendWithdrawal')

        expect(isMultispendTransfer(deposit)).toBe(false)
        expect(isMultispendTransfer(withdrawal)).toBe(false)
    })
})
