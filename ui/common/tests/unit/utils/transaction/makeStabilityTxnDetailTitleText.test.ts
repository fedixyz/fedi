import { makeStabilityTxnDetailTitleText } from '../../../../utils/transaction'
import { createMockT } from '../../../utils/setup'
import {
    makeTestMultispendTxnEntry,
    makeTestRpcTxnEntry,
} from '../../../utils/transaction'

describe('makeStabilityTxnDetailTitleText', () => {
    const t = createMockT()

    it('should display the correct title for sp deposits', () => {
        const spDeposit = makeTestRpcTxnEntry('spDeposit')
        const sPV2Deposit = makeTestRpcTxnEntry('sPV2Deposit')

        expect(makeStabilityTxnDetailTitleText(t, spDeposit)).toBe(
            t('feature.stabilitypool.you-deposited'),
        )
        expect(makeStabilityTxnDetailTitleText(t, sPV2Deposit)).toBe(
            t('feature.stabilitypool.you-deposited'),
        )
    })

    it('should display the correct title for sp withdrawals', () => {
        const spWithdraw = makeTestRpcTxnEntry('spWithdraw')
        const sPV2Withdrawal = makeTestRpcTxnEntry('sPV2Withdrawal')

        expect(makeStabilityTxnDetailTitleText(t, spWithdraw)).toBe(
            t('feature.stabilitypool.you-withdrew'),
        )
        expect(makeStabilityTxnDetailTitleText(t, sPV2Withdrawal)).toBe(
            t('feature.stabilitypool.you-withdrew'),
        )
    })

    it('should display the correct title for sPV2TransferOut transactions', () => {
        const sPV2TransferOut = makeTestRpcTxnEntry('sPV2TransferOut')

        expect(makeStabilityTxnDetailTitleText(t, sPV2TransferOut)).toBe(
            t('feature.send.you-sent'),
        )
    })

    it('should display the correct title for sPV2TransferIn transactions', () => {
        const sPV2TransferIn = makeTestRpcTxnEntry('sPV2TransferIn')

        expect(makeStabilityTxnDetailTitleText(t, sPV2TransferIn)).toBe(
            t('feature.stabilitypool.you-withdrew'),
        )
    })

    it('should display "unknown" for multispend transactions that are not sPV2TransferOut or sPV2TransferIn', () => {
        const multispendDeposit = makeTestMultispendTxnEntry('deposit')
        const multispendWithdrawal = makeTestMultispendTxnEntry('withdrawal')

        expect(makeStabilityTxnDetailTitleText(t, multispendDeposit)).toBe(
            t('words.unknown'),
        )
        expect(makeStabilityTxnDetailTitleText(t, multispendWithdrawal)).toBe(
            t('words.unknown'),
        )
    })

    it('should display "unknown" for non-stabilitypool transactions', () => {
        const onchainDeposit = makeTestRpcTxnEntry('onchainDeposit')
        const lnReceive = makeTestRpcTxnEntry('lnReceive')

        expect(makeStabilityTxnDetailTitleText(t, onchainDeposit)).toBe(
            t('words.unknown'),
        )
        expect(makeStabilityTxnDetailTitleText(t, lnReceive)).toBe(
            t('words.unknown'),
        )
    })
})
