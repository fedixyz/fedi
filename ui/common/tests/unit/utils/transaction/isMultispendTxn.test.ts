import { isMultispendTxn } from '../../../../utils/transaction'
import {
    makeTestMultispendTxnEntry,
    makeTestRpcTxnEntry,
    makeTestSPV2TransferInState,
    makeTestSPV2TransferOutState,
} from '../../../utils/transaction'

describe('isMultispendTxn', () => {
    // TODO:TEST: Unskip test once isMultispendTxn is properly implemented
    it.skip('should properly determine multispend transactions', () => {
        const deposit = makeTestMultispendTxnEntry('deposit')
        const withdrawal = makeTestMultispendTxnEntry('withdrawal')

        expect(isMultispendTxn(deposit)).toBe(true)
        expect(isMultispendTxn(withdrawal)).toBe(true)
    })

    it('should properly determine multispend transactions as sPV2TransferOut and sPV2TransferIn', () => {
        const sPV2TransferOut = makeTestRpcTxnEntry('sPV2TransferOut', {
            state: makeTestSPV2TransferOutState(
                'completedTransfer',
                'multispend',
            ),
        })
        const sPV2TransferIn = makeTestRpcTxnEntry('sPV2TransferIn', {
            state: makeTestSPV2TransferInState(
                'completedTransfer',
                'multispend',
            ),
        })

        expect(isMultispendTxn(sPV2TransferOut)).toBe(true)
        expect(isMultispendTxn(sPV2TransferIn)).toBe(true)
    })
})
