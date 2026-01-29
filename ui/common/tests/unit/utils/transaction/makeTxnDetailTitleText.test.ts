import { TransactionListEntry } from '../../../../types'
import { makeTxnDetailTitleText } from '../../../../utils/transaction'
import { createMockT } from '../../../utils/setup'
import {
    makeTestLnReceiveState,
    makeTestMultispendTxnEntry,
    makeTestOnchainDepositState,
    makeTestRpcTxnEntry,
    makeTestSPV2WithdrawalState,
    makeTestSPWithdrawalState,
} from '../../../utils/transaction'

describe('makeTxnDetailTitleText', () => {
    const t = createMockT()

    it('should return "unknown" for a transaction without a state', () => {
        const txn = {
            kind: 'unknown',
            state: null,
        } as unknown as TransactionListEntry
        const title = makeTxnDetailTitleText(t, txn)
        expect(title).toBe(t('words.unknown'))
    })

    it('should return "you-sent" for send transactions, "you-deposited" for stability deposits', () => {
        const normalTxn = makeTestRpcTxnEntry('lnPay')
        const spDepositTxn = makeTestRpcTxnEntry('spDeposit')

        expect(makeTxnDetailTitleText(t, normalTxn)).toBe(
            t('feature.send.you-sent'),
        )
        expect(makeTxnDetailTitleText(t, spDepositTxn)).toBe(
            t('feature.send.you-sent'),
        )
    })

    it('(lightning receive) should correctly determine the title based on the txn state', () => {
        const lnReceiveWaitingForPayment = makeTestRpcTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('waitingForPayment'),
        })
        const lnReceiveClaimed = makeTestRpcTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('claimed'),
        })
        const lnReceiveCanceled = makeTestRpcTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('canceled'),
        })
        const lnReceiveCreated = makeTestRpcTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('created'),
        })

        expect(makeTxnDetailTitleText(t, lnReceiveWaitingForPayment)).toBe(
            t('phrases.receive-pending'),
        )
        expect(makeTxnDetailTitleText(t, lnReceiveClaimed)).toBe(
            t('feature.receive.you-received'),
        )
        expect(makeTxnDetailTitleText(t, lnReceiveCanceled)).toBe(
            t('words.expired'),
        )
        expect(makeTxnDetailTitleText(t, lnReceiveCreated)).toBe(
            t('phrases.receive-pending'),
        )
    })

    it('(onchain deposit) should correctly determine the title based on the txn state', () => {
        const onchainWaitingForTransaction = makeTestRpcTxnEntry(
            'onchainDeposit',
            {
                state: makeTestOnchainDepositState('waitingForTransaction'),
            },
        )
        const onchainClaimed = makeTestRpcTxnEntry('onchainDeposit', {
            state: makeTestOnchainDepositState('claimed'),
        })
        const onchainPending = makeTestRpcTxnEntry('onchainDeposit', {
            state: makeTestOnchainDepositState('waitingForConfirmation'),
        })

        expect(makeTxnDetailTitleText(t, onchainWaitingForTransaction)).toBe(
            t('phrases.address-created'),
        )
        expect(makeTxnDetailTitleText(t, onchainClaimed)).toBe(
            t('feature.receive.you-received'),
        )
        expect(makeTxnDetailTitleText(t, onchainPending)).toBe(
            t('phrases.receive-pending'),
        )
    })

    it('(spv1 withdraw) should correctly determine the title based on the txn state', () => {
        const spWithdrawPending = makeTestRpcTxnEntry('spWithdraw', {
            state: makeTestSPWithdrawalState('pendingWithdrawal'),
        })
        const spWithdrawComplete = makeTestRpcTxnEntry('spWithdraw', {
            state: makeTestSPWithdrawalState('completeWithdrawal'),
        })

        expect(makeTxnDetailTitleText(t, spWithdrawPending)).toBe(
            t('phrases.receive-pending'),
        )
        expect(makeTxnDetailTitleText(t, spWithdrawComplete)).toBe(
            t('feature.receive.you-received'),
        )
    })

    it('(spv2 withdraw) should correctly determine the title based on the txn state', () => {
        const spWithdrawPending = makeTestRpcTxnEntry('sPV2Withdrawal', {
            state: makeTestSPV2WithdrawalState('pendingWithdrawal'),
        })
        const spWithdrawFailed = makeTestRpcTxnEntry('sPV2Withdrawal', {
            state: makeTestSPV2WithdrawalState('failedWithdrawal'),
        })
        const spWithdrawComplete = makeTestRpcTxnEntry('sPV2Withdrawal', {
            state: makeTestSPV2WithdrawalState('completedWithdrawal'),
        })
        const spDataNotInCache = makeTestRpcTxnEntry('sPV2Withdrawal', {
            state: makeTestSPV2WithdrawalState('dataNotInCache'),
        })

        expect(makeTxnDetailTitleText(t, spWithdrawPending)).toBe(
            t('phrases.receive-pending'),
        )
        expect(makeTxnDetailTitleText(t, spWithdrawComplete)).toBe(
            t('feature.receive.you-received'),
        )
        expect(makeTxnDetailTitleText(t, spDataNotInCache)).toBe(
            t('words.pending'),
        )
        expect(makeTxnDetailTitleText(t, spWithdrawFailed)).toBe(
            t('words.failed'),
        )
    })

    it('spV2 transfer in should say "you-received"', () => {
        const spTransferInPending = makeTestRpcTxnEntry('sPV2TransferIn')
        const multispendGroupInvitation =
            makeTestMultispendTxnEntry('groupInvitation')

        expect(makeTxnDetailTitleText(t, spTransferInPending)).toBe(
            t('feature.receive.you-received'),
        )
        expect(makeTxnDetailTitleText(t, multispendGroupInvitation)).toBe(
            t('words.unknown'),
        )
    })

    it('multispend deposits/withdrawals should be labeled, non-txns should be unknown', () => {
        const multispendDeposit = makeTestMultispendTxnEntry('deposit')
        const multispendWithdrawal = makeTestMultispendTxnEntry('withdrawal')
        const multispendGroupInvitation =
            makeTestMultispendTxnEntry('groupInvitation')
        const multispendInvalid = makeTestMultispendTxnEntry('invalid')

        expect(makeTxnDetailTitleText(t, multispendDeposit)).toBe(
            t('feature.stabilitypool.you-deposited'),
        )
        expect(makeTxnDetailTitleText(t, multispendWithdrawal)).toBe(
            t('feature.stabilitypool.you-withdrew'),
        )
        expect(makeTxnDetailTitleText(t, multispendGroupInvitation)).toBe(
            t('words.unknown'),
        )
        expect(makeTxnDetailTitleText(t, multispendInvalid)).toBe(
            t('words.unknown'),
        )
    })
})
