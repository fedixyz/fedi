import { makeTxnTypeText } from '../../../../utils/transaction'
import { createMockT } from '../../../utils/setup'
import { makeTestTxnEntry } from '../../../utils/transaction'

describe('makeTxnTypeText', () => {
    const t = createMockT()

    it('[onchain] should return the correct transaction type', () => {
        const onchainDeposit = makeTestTxnEntry('onchainDeposit')
        const onchainWithdraw = makeTestTxnEntry('onchainWithdraw')

        expect(makeTxnTypeText(onchainDeposit, t)).toBe(t('words.onchain'))
        expect(makeTxnTypeText(onchainWithdraw, t)).toBe(t('words.onchain'))
    })

    it('[lightning] should return the correct transaction type', () => {
        const lnPay = makeTestTxnEntry('lnPay')
        const lnReceive = makeTestTxnEntry('lnReceive')

        expect(makeTxnTypeText(lnPay, t)).toBe(t('words.lightning'))
        expect(makeTxnTypeText(lnReceive, t)).toBe(t('words.lightning'))
    })

    it('[ecash] should return the correct transaction type', () => {
        const oobSend = makeTestTxnEntry('oobSend')
        const oobReceive = makeTestTxnEntry('oobReceive')

        expect(makeTxnTypeText(oobSend, t)).toBe(t('words.ecash'))
        expect(makeTxnTypeText(oobReceive, t)).toBe(t('words.ecash'))
    })

    it('[lnurl] should return the correct transaction type', () => {
        const lnRecurringdReceive = makeTestTxnEntry('lnRecurringdReceive')

        expect(makeTxnTypeText(lnRecurringdReceive, t)).toBe(t('words.lnurl'))
    })

    it('[stable balance] should return the correct transaction type', () => {
        const spDeposit = makeTestTxnEntry('spDeposit')
        const sPV2Deposit = makeTestTxnEntry('sPV2Deposit')
        const spWithdraw = makeTestTxnEntry('spWithdraw')
        const sPV2Withdrawal = makeTestTxnEntry('sPV2Withdrawal')
        const sPV2TransferOut = makeTestTxnEntry('sPV2TransferOut')
        const sPV2TransferIn = makeTestTxnEntry('sPV2TransferIn')

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
        const multispendDeposit = makeTestTxnEntry('multispendDeposit')
        const multispendWithdrawal = makeTestTxnEntry('multispendWithdrawal')

        expect(makeTxnTypeText(multispendDeposit, t)).toBe(t('words.deposit'))
        expect(makeTxnTypeText(multispendWithdrawal, t)).toBe(
            t('words.withdrawal'),
        )
    })
})
