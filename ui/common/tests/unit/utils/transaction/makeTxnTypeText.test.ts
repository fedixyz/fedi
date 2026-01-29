import { makeTxnTypeText } from '../../../../utils/transaction'
import { createMockT } from '../../../utils/setup'
import {
    makeTestMultispendTxnEntry,
    makeTestRpcTxnEntry,
} from '../../../utils/transaction'

describe('makeTxnTypeText', () => {
    const t = createMockT()

    it('[onchain] should return the correct transaction type', () => {
        const onchainDeposit = makeTestRpcTxnEntry('onchainDeposit')
        const onchainWithdraw = makeTestRpcTxnEntry('onchainWithdraw')

        expect(makeTxnTypeText(onchainDeposit, t)).toBe(t('words.onchain'))
        expect(makeTxnTypeText(onchainWithdraw, t)).toBe(t('words.onchain'))
    })

    it('[lightning] should return the correct transaction type', () => {
        const lnPay = makeTestRpcTxnEntry('lnPay')
        const lnReceive = makeTestRpcTxnEntry('lnReceive')

        expect(makeTxnTypeText(lnPay, t)).toBe(t('words.lightning'))
        expect(makeTxnTypeText(lnReceive, t)).toBe(t('words.lightning'))
    })

    it('[ecash] should return the correct transaction type', () => {
        const oobSend = makeTestRpcTxnEntry('oobSend')
        const oobReceive = makeTestRpcTxnEntry('oobReceive')

        expect(makeTxnTypeText(oobSend, t)).toBe(t('words.ecash'))
        expect(makeTxnTypeText(oobReceive, t)).toBe(t('words.ecash'))
    })

    it('[lnurl] should return the correct transaction type', () => {
        const lnRecurringdReceive = makeTestRpcTxnEntry('lnRecurringdReceive')

        expect(makeTxnTypeText(lnRecurringdReceive, t)).toBe(t('words.lnurl'))
    })

    it('[stable balance] should return the correct transaction type', () => {
        const spDeposit = makeTestRpcTxnEntry('spDeposit')
        const sPV2Deposit = makeTestRpcTxnEntry('sPV2Deposit')
        const spWithdraw = makeTestRpcTxnEntry('spWithdraw')
        const sPV2Withdrawal = makeTestRpcTxnEntry('sPV2Withdrawal')
        const sPV2TransferOut = makeTestRpcTxnEntry('sPV2TransferOut')
        const sPV2TransferIn = makeTestRpcTxnEntry('sPV2TransferIn')

        expect(makeTxnTypeText(spDeposit, t)).toBe(
            t('feature.stabilitypool.stable-balance'),
        )
        expect(makeTxnTypeText(sPV2Deposit, t)).toBe(
            t('feature.stabilitypool.stable-balance'),
        )
        expect(makeTxnTypeText(spWithdraw, t)).toBe(
            t('feature.stabilitypool.stable-balance'),
        )
        expect(makeTxnTypeText(sPV2Withdrawal, t)).toBe(
            t('feature.stabilitypool.stable-balance'),
        )
        expect(makeTxnTypeText(sPV2TransferOut, t)).toBe(
            t('feature.stabilitypool.stable-balance'),
        )
        expect(makeTxnTypeText(sPV2TransferIn, t)).toBe(t('words.multispend'))
    })

    it('[multispend] should return the correct transaction type', () => {
        const multispendDeposit = makeTestMultispendTxnEntry('deposit')
        const multispendWithdrawal = makeTestMultispendTxnEntry('withdrawal')
        const multispendGroupInvitation =
            makeTestMultispendTxnEntry('groupInvitation')
        const multispendInvalid = makeTestMultispendTxnEntry('invalid')

        expect(makeTxnTypeText(multispendDeposit, t)).toBe(t('words.deposit'))
        expect(makeTxnTypeText(multispendWithdrawal, t)).toBe(
            t('words.withdrawal'),
        )
        expect(makeTxnTypeText(multispendGroupInvitation, t)).toBe(
            t('words.unknown'),
        )
        expect(makeTxnTypeText(multispendInvalid, t)).toBe(t('words.unknown'))
    })
})
