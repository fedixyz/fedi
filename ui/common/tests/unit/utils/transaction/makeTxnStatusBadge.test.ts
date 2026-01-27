import { makeTxnStatusBadge } from '../../../../utils/transaction'
import {
    makeTestLnPayState,
    makeTestLnReceiveState,
    makeTestMultispendTxnEntry,
    makeTestMultispendWithdrawRequest,
    makeTestOnchainDepositState,
    makeTestOnchainWithdrawState,
    makeTestOOBReissueState,
    makeTestOOBSpendState,
    makeTestRpcTxnEntry,
    makeTestSPDepositState,
    makeTestSPV2DepositState,
    makeTestSPV2TransferOutState,
    makeTestSPV2WithdrawalState,
    makeTestSPWithdrawalState,
} from '../../../utils/transaction'

describe('makeTxnStatusBadge', () => {
    it('should return "incoming" for completed transactions', () => {
        const lnReceiveClaimed = makeTestRpcTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('claimed'),
        })
        const lnurlClaimed = makeTestRpcTxnEntry('lnRecurringdReceive', {
            state: makeTestLnReceiveState('claimed'),
        })
        const onchainDepositClaimed = makeTestRpcTxnEntry('onchainDeposit', {
            state: makeTestOnchainDepositState('claimed'),
        })
        const spWithdrawComplete = makeTestRpcTxnEntry('spWithdraw', {
            state: makeTestSPWithdrawalState('completeWithdrawal'),
        })
        const spv2WithdrawCompleted = makeTestRpcTxnEntry('sPV2Withdrawal', {
            state: makeTestSPV2WithdrawalState('completedWithdrawal'),
        })
        const oobReceiveDone = makeTestRpcTxnEntry('oobReceive', {
            state: makeTestOOBReissueState('done'),
        })
        const multispendDeposit = makeTestMultispendTxnEntry('deposit')
        const lnurlCreated = makeTestRpcTxnEntry('lnRecurringdReceive', {
            state: makeTestLnReceiveState('created'),
        })

        expect(makeTxnStatusBadge(lnReceiveClaimed)).toBe('incoming')
        expect(makeTxnStatusBadge(lnurlClaimed)).toBe('incoming')
        expect(makeTxnStatusBadge(onchainDepositClaimed)).toBe('incoming')
        expect(makeTxnStatusBadge(spWithdrawComplete)).toBe('incoming')
        expect(makeTxnStatusBadge(spv2WithdrawCompleted)).toBe('incoming')
        expect(makeTxnStatusBadge(oobReceiveDone)).toBe('incoming')
        expect(makeTxnStatusBadge(multispendDeposit)).toBe('incoming')
        // TODO:TEST: This should NOT be the case - Set to "pending" if bug is fixed
        expect(makeTxnStatusBadge(lnurlCreated)).toBe('incoming')
    })

    it('should return "outgoing" for sent transactions', () => {
        const lnPaySuccess = makeTestRpcTxnEntry('lnPay', {
            state: makeTestLnPayState('success'),
        })
        const onchainWithdrawSucceeded = makeTestRpcTxnEntry(
            'onchainWithdraw',
            {
                state: makeTestOnchainWithdrawState('succeeded'),
            },
        )
        const oobSendSuccess = makeTestRpcTxnEntry('oobSend', {
            state: makeTestOOBSpendState('success'),
        })
        const oobSendCreated = makeTestRpcTxnEntry('oobSend', {
            state: makeTestOOBSpendState('created'),
        })
        const oobSendCanceledFailure = makeTestRpcTxnEntry('oobSend', {
            state: makeTestOOBSpendState('userCanceledFailure'),
        })
        const spDepositComplete = makeTestRpcTxnEntry('spDeposit', {
            state: makeTestSPDepositState('completeDeposit'),
        })
        const spv2DepositCompleted = makeTestRpcTxnEntry('sPV2Deposit', {
            state: makeTestSPV2DepositState('completedDeposit'),
        })
        const spv2TransferOut = makeTestRpcTxnEntry('sPV2TransferOut', {
            state: makeTestSPV2TransferOutState(
                'completedTransfer',
                'spTransferUi',
            ),
        })
        const multispendWithdrawAccepted = makeTestMultispendTxnEntry(
            'withdrawal',
            {
                event: {
                    withdrawalRequest:
                        makeTestMultispendWithdrawRequest('accepted'),
                },
            },
        )
        const spv2TransferOutDataNotInCache = makeTestRpcTxnEntry(
            'sPV2TransferOut',
            {
                state: makeTestSPV2TransferOutState(
                    'dataNotInCache',
                    'spTransferUi',
                ),
            },
        )

        expect(makeTxnStatusBadge(lnPaySuccess)).toBe('outgoing')
        expect(makeTxnStatusBadge(onchainWithdrawSucceeded)).toBe('outgoing')
        expect(makeTxnStatusBadge(oobSendSuccess)).toBe('outgoing')
        expect(makeTxnStatusBadge(oobSendCreated)).toBe('outgoing')
        expect(makeTxnStatusBadge(oobSendCanceledFailure)).toBe('outgoing')
        expect(makeTxnStatusBadge(spDepositComplete)).toBe('outgoing')
        expect(makeTxnStatusBadge(spv2DepositCompleted)).toBe('outgoing')
        expect(makeTxnStatusBadge(spv2TransferOut)).toBe('outgoing')
        expect(makeTxnStatusBadge(multispendWithdrawAccepted)).toBe('outgoing')
        // TODO:TEST: This should NOT be the case - Set to "pending" if bug is fixed
        expect(makeTxnStatusBadge(spv2TransferOutDataNotInCache)).toBe(
            'outgoing',
        )
    })

    it('should return "pending" for pending transactions', () => {
        const lnPayCreated = makeTestRpcTxnEntry('lnPay', {
            state: makeTestLnPayState('created'),
        })
        const lnPayFunded = makeTestRpcTxnEntry('lnPay', {
            state: makeTestLnPayState('funded'),
        })
        const lnPayAwaitingChange = makeTestRpcTxnEntry('lnPay', {
            state: makeTestLnPayState('awaitingChange'),
        })
        const lnPayWaitingForRefund = makeTestRpcTxnEntry('lnPay', {
            state: makeTestLnPayState('waitingForRefund'),
        })
        const oobSendUserCanceledProcessing = makeTestRpcTxnEntry('oobSend', {
            state: makeTestOOBSpendState('userCanceledProcessing'),
        })
        const spDepositPending = makeTestRpcTxnEntry('spDeposit', {
            state: makeTestSPDepositState('pendingDeposit'),
        })
        const spv2DepositPending = makeTestRpcTxnEntry('sPV2Deposit', {
            state: makeTestSPV2DepositState('pendingDeposit'),
        })
        const lnReceivePending = makeTestRpcTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('created'),
        })
        const lnReceiveWaitingForPayment = makeTestRpcTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('waitingForPayment'),
        })
        const lnReceiveFunded = makeTestRpcTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('funded'),
        })
        const lnReceiveAwaitingFunds = makeTestRpcTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('awaitingFunds'),
        })
        const lnurlWaitingForPayment = makeTestRpcTxnEntry(
            'lnRecurringdReceive',
            {
                state: makeTestLnReceiveState('waitingForPayment'),
            },
        )
        const lnurlFunded = makeTestRpcTxnEntry('lnRecurringdReceive', {
            state: makeTestLnReceiveState('funded'),
        })
        const lnurlAwaitingFunds = makeTestRpcTxnEntry('lnRecurringdReceive', {
            state: makeTestLnReceiveState('awaitingFunds'),
        })
        const onchainDepositWaitingForTransaction = makeTestRpcTxnEntry(
            'onchainDeposit',
            {
                state: makeTestOnchainDepositState('waitingForTransaction'),
            },
        )
        const onchainDepositWaitingForConfirmation = makeTestRpcTxnEntry(
            'onchainDeposit',
            {
                state: makeTestOnchainDepositState('waitingForConfirmation'),
            },
        )
        const onchainDepositClaimed = makeTestRpcTxnEntry('onchainDeposit', {
            state: makeTestOnchainDepositState('confirmed'),
        })
        const spWithdrawPending = makeTestRpcTxnEntry('spWithdraw', {
            state: makeTestSPWithdrawalState('pendingWithdrawal'),
        })
        const spv2WithdrawalPending = makeTestRpcTxnEntry('sPV2Withdrawal', {
            state: makeTestSPV2WithdrawalState('pendingWithdrawal'),
        })
        const oobReceiveCreated = makeTestRpcTxnEntry('oobReceive', {
            state: makeTestOOBReissueState('created'),
        })
        const oobReceiveIssuing = makeTestRpcTxnEntry('oobReceive', {
            state: makeTestOOBReissueState('issuing'),
        })
        const multispendWithdrawalUnknown = makeTestMultispendTxnEntry(
            'withdrawal',
            {
                event: {
                    withdrawalRequest:
                        makeTestMultispendWithdrawRequest('unknown'),
                },
            },
        )

        expect(makeTxnStatusBadge(lnPayCreated)).toBe('pending')
        expect(makeTxnStatusBadge(lnPayFunded)).toBe('pending')
        expect(makeTxnStatusBadge(lnPayAwaitingChange)).toBe('pending')
        expect(makeTxnStatusBadge(lnPayWaitingForRefund)).toBe('pending')
        expect(makeTxnStatusBadge(oobSendUserCanceledProcessing)).toBe(
            'pending',
        )
        expect(makeTxnStatusBadge(spDepositPending)).toBe('pending')
        expect(makeTxnStatusBadge(spv2DepositPending)).toBe('pending')
        expect(makeTxnStatusBadge(lnReceivePending)).toBe('pending')
        expect(makeTxnStatusBadge(lnReceiveWaitingForPayment)).toBe('pending')
        expect(makeTxnStatusBadge(lnReceiveFunded)).toBe('pending')
        expect(makeTxnStatusBadge(lnReceiveAwaitingFunds)).toBe('pending')
        expect(makeTxnStatusBadge(lnurlWaitingForPayment)).toBe('pending')
        expect(makeTxnStatusBadge(lnurlFunded)).toBe('pending')
        expect(makeTxnStatusBadge(lnurlAwaitingFunds)).toBe('pending')
        expect(makeTxnStatusBadge(onchainDepositWaitingForTransaction)).toBe(
            'pending',
        )
        expect(makeTxnStatusBadge(onchainDepositWaitingForConfirmation)).toBe(
            'pending',
        )
        expect(makeTxnStatusBadge(onchainDepositClaimed)).toBe('pending')
        expect(makeTxnStatusBadge(spWithdrawPending)).toBe('pending')
        expect(makeTxnStatusBadge(spv2WithdrawalPending)).toBe('pending')
        expect(makeTxnStatusBadge(oobReceiveCreated)).toBe('pending')
        expect(makeTxnStatusBadge(oobReceiveIssuing)).toBe('pending')
        expect(makeTxnStatusBadge(multispendWithdrawalUnknown)).toBe('pending')
    })

    it('should return "failed" for failed transactions', () => {
        const lnPayCanceled = makeTestRpcTxnEntry('lnPay', {
            state: makeTestLnPayState('canceled'),
        })
        const lnPayFailed = makeTestRpcTxnEntry('lnPay', {
            state: makeTestLnPayState('failed'),
        })
        const lnPayRefunded = makeTestRpcTxnEntry('lnPay', {
            state: makeTestLnPayState('refunded'),
        })
        const onchainWithdrawFailed = makeTestRpcTxnEntry('onchainWithdraw', {
            state: makeTestOnchainWithdrawState('failed'),
        })
        const oobSendCanceled = makeTestRpcTxnEntry('oobSend', {
            state: makeTestOOBSpendState('userCanceledSuccess'),
        })
        const oobSendRefunded = makeTestRpcTxnEntry('oobSend', {
            state: makeTestOOBSpendState('refunded'),
        })
        const onchainDepositFailed = makeTestRpcTxnEntry('onchainDeposit', {
            state: makeTestOnchainDepositState('failed'),
        })
        const oobReceiveFailed = makeTestRpcTxnEntry('oobReceive', {
            state: makeTestOOBReissueState('failed'),
        })
        const multispendWithdrawFailed = makeTestMultispendTxnEntry(
            'withdrawal',
            {
                event: {
                    withdrawalRequest:
                        makeTestMultispendWithdrawRequest('rejected'),
                },
            },
        )

        expect(makeTxnStatusBadge(lnPayCanceled)).toBe('failed')
        expect(makeTxnStatusBadge(lnPayFailed)).toBe('failed')
        expect(makeTxnStatusBadge(lnPayRefunded)).toBe('failed')
        expect(makeTxnStatusBadge(onchainWithdrawFailed)).toBe('failed')
        expect(makeTxnStatusBadge(oobSendCanceled)).toBe('failed')
        expect(makeTxnStatusBadge(oobSendRefunded)).toBe('failed')
        expect(makeTxnStatusBadge(onchainDepositFailed)).toBe('failed')
        expect(makeTxnStatusBadge(oobReceiveFailed)).toBe('failed')
        expect(makeTxnStatusBadge(multispendWithdrawFailed)).toBe('failed')
    })

    it('should return "expired" for expired transactions', () => {
        const lnReceiveCanceled = makeTestRpcTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('canceled'),
        })
        const lnurlCanceled = makeTestRpcTxnEntry('lnRecurringdReceive', {
            state: makeTestLnReceiveState('canceled'),
        })

        expect(makeTxnStatusBadge(lnReceiveCanceled)).toBe('expired')
        expect(makeTxnStatusBadge(lnurlCanceled)).toBe('expired')
    })
})
