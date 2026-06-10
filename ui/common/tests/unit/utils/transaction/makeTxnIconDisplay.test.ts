import { makeTxnIconDisplay } from '../../../../utils/transaction'
import {
    makeTestSPV2TransferOutState,
    makeTestTxnEntry,
} from '../../../utils/transaction'

describe('makeTxnIconDisplay', () => {
    it('returns lightning icons for lightning transactions', () => {
        expect(makeTxnIconDisplay(makeTestTxnEntry('lnPay'))).toEqual({
            icon: 'LightningCircle',
            color: 'bitcoin',
        })
        expect(makeTxnIconDisplay(makeTestTxnEntry('lnReceive'))).toEqual({
            icon: 'LightningCircle',
            color: 'bitcoin',
        })
        expect(
            makeTxnIconDisplay(makeTestTxnEntry('lnRecurringdReceive')),
        ).toEqual({
            icon: 'LightningCircle',
            color: 'bitcoin',
        })
    })

    it('returns ecash icons for out-of-band ecash transactions', () => {
        expect(makeTxnIconDisplay(makeTestTxnEntry('oobSend'))).toEqual({
            icon: 'ChatPaymentCircle',
            color: 'bitcoin',
        })
        expect(makeTxnIconDisplay(makeTestTxnEntry('oobReceive'))).toEqual({
            icon: 'ChatPaymentCircle',
            color: 'bitcoin',
        })
    })

    it('returns on-chain icons for on-chain transactions', () => {
        expect(makeTxnIconDisplay(makeTestTxnEntry('onchainDeposit'))).toEqual({
            icon: 'OnChainCircle',
            color: 'bitcoin',
        })
        expect(makeTxnIconDisplay(makeTestTxnEntry('onchainWithdraw'))).toEqual(
            {
                icon: 'OnChainCircle',
                color: 'bitcoin',
            },
        )
    })

    it('returns stable balance icons for stable balance transactions', () => {
        expect(makeTxnIconDisplay(makeTestTxnEntry('spDeposit'))).toEqual({
            icon: 'DollarCircle',
            color: 'stable',
        })
        expect(makeTxnIconDisplay(makeTestTxnEntry('spWithdraw'))).toEqual({
            icon: 'DollarCircle',
            color: 'stable',
        })
        expect(makeTxnIconDisplay(makeTestTxnEntry('sPV2Deposit'))).toEqual({
            icon: 'DollarCircle',
            color: 'stable',
        })
        expect(makeTxnIconDisplay(makeTestTxnEntry('sPV2Withdrawal'))).toEqual({
            icon: 'DollarCircle',
            color: 'stable',
        })
    })

    it('returns multispend icons for multispend stable transfers', () => {
        const txn = makeTestTxnEntry('sPV2TransferOut', {
            state: makeTestSPV2TransferOutState(
                'completedTransfer',
                'multispend',
            ),
        })

        expect(makeTxnIconDisplay(txn)).toEqual({
            icon: 'MultispendGroupCircle',
            color: 'stable',
        })
    })

    it('returns bitcoin icons for guardian remittance withdrawals', () => {
        const txn = makeTestTxnEntry('sPV2Withdrawal', {
            guardian_remittance: true,
        })

        expect(makeTxnIconDisplay(txn)).toEqual({
            icon: 'BitcoinCircle',
            color: 'bitcoin',
        })
    })
})
