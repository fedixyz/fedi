import { makeTxnStatusBadge } from '../../../../utils/transaction'
import {
    makeTestLnPayState,
    makeTestLnReceiveState,
    makeTestOnchainDepositState,
    makeTestOnchainWithdrawState,
    makeTestOOBReissueState,
    makeTestOOBSpendState,
    makeTestTxnEntry,
    makeTestSPDepositState,
    makeTestSPV2DepositState,
    makeTestSPV2TransferInState,
    makeTestSPV2TransferOutState,
    makeTestSPV2WithdrawalState,
    makeTestSPWithdrawalState,
    makeTestMultispendWithdrawalEventData,
} from '../../../utils/transaction'

describe('makeTxnStatusBadge', () => {
    it('should return "incoming" for completed transactions', () => {
        const lnReceiveClaimed = makeTestTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('claimed'),
        })
        const lnurlClaimed = makeTestTxnEntry('lnRecurringdReceive', {
            state: makeTestLnReceiveState('claimed'),
        })
        const onchainDepositClaimed = makeTestTxnEntry('onchainDeposit', {
            state: makeTestOnchainDepositState('claimed'),
        })
        const spWithdrawComplete = makeTestTxnEntry('spWithdraw', {
            state: makeTestSPWithdrawalState('completeWithdrawal'),
        })
        const spv2WithdrawCompleted = makeTestTxnEntry('sPV2Withdrawal', {
            state: makeTestSPV2WithdrawalState('completedWithdrawal'),
        })
        const oobReceiveDone = makeTestTxnEntry('oobReceive', {
            state: makeTestOOBReissueState('done'),
        })
        const spv2TransferInMultispend = makeTestTxnEntry('sPV2TransferIn', {
            state: makeTestSPV2TransferInState(
                'completedTransfer',
                'multispend',
            ),
        })
        const multispendDeposit = makeTestTxnEntry('multispendDeposit')
        const lnurlCreated = makeTestTxnEntry('lnRecurringdReceive', {
            state: makeTestLnReceiveState('created'),
        })

        expect(makeTxnStatusBadge(lnReceiveClaimed)).toBe('incoming')
        expect(makeTxnStatusBadge(lnurlClaimed)).toBe('incoming')
        expect(makeTxnStatusBadge(onchainDepositClaimed)).toBe('incoming')
        expect(makeTxnStatusBadge(spWithdrawComplete)).toBe('incoming')
        expect(makeTxnStatusBadge(spv2WithdrawCompleted)).toBe('incoming')
        expect(makeTxnStatusBadge(spv2TransferInMultispend)).toBe('incoming')
        expect(makeTxnStatusBadge(oobReceiveDone)).toBe('incoming')
        expect(makeTxnStatusBadge(multispendDeposit)).toBe('incoming')
        // TODO:TEST: This should NOT be the case - Set to "pending" if bug is fixed
        expect(makeTxnStatusBadge(lnurlCreated)).toBe('incoming')
    })

    it('should return "outgoing" for sent transactions', () => {
        const lnPaySuccess = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('success'),
        })
        const onchainWithdrawSucceeded = makeTestTxnEntry('onchainWithdraw', {
            state: makeTestOnchainWithdrawState('succeeded'),
        })
        const oobSendSuccess = makeTestTxnEntry('oobSend', {
            state: makeTestOOBSpendState('success'),
        })
        const oobSendCreated = makeTestTxnEntry('oobSend', {
            state: makeTestOOBSpendState('created'),
        })
        const oobSendCanceledFailure = makeTestTxnEntry('oobSend', {
            state: makeTestOOBSpendState('userCanceledFailure'),
        })
        const spDepositComplete = makeTestTxnEntry('spDeposit', {
            state: makeTestSPDepositState('completeDeposit'),
        })
        const spv2DepositCompleted = makeTestTxnEntry('sPV2Deposit', {
            state: makeTestSPV2DepositState('completedDeposit'),
        })
        const spv2TransferOutSpTransferUi = makeTestTxnEntry(
            'sPV2TransferOut',
            {
                state: makeTestSPV2TransferOutState(
                    'completedTransfer',
                    'spTransferUi',
                ),
            },
        )
        const spv2TransferOutMultispend = makeTestTxnEntry('sPV2TransferOut', {
            state: makeTestSPV2TransferOutState(
                'completedTransfer',
                'spTransferUi',
            ),
        })
        const spv2TransferOutMatrix = makeTestTxnEntry('sPV2TransferOut', {
            state: makeTestSPV2TransferOutState(
                'completedTransfer',
                'spTransferUi',
            ),
        })
        const multispendWithdrawAccepted = makeTestTxnEntry(
            'multispendWithdrawal',
            {
                state: makeTestMultispendWithdrawalEventData('accepted'),
            },
        )

        expect(makeTxnStatusBadge(lnPaySuccess)).toBe('outgoing')
        expect(makeTxnStatusBadge(onchainWithdrawSucceeded)).toBe('outgoing')
        expect(makeTxnStatusBadge(oobSendSuccess)).toBe('outgoing')
        expect(makeTxnStatusBadge(oobSendCreated)).toBe('outgoing')
        expect(makeTxnStatusBadge(oobSendCanceledFailure)).toBe('outgoing')
        expect(makeTxnStatusBadge(spDepositComplete)).toBe('outgoing')
        expect(makeTxnStatusBadge(spv2DepositCompleted)).toBe('outgoing')
        expect(makeTxnStatusBadge(spv2TransferOutSpTransferUi)).toBe('outgoing')
        expect(makeTxnStatusBadge(spv2TransferOutMultispend)).toBe('outgoing')
        expect(makeTxnStatusBadge(spv2TransferOutMatrix)).toBe('outgoing')
        expect(makeTxnStatusBadge(multispendWithdrawAccepted)).toBe('outgoing')
    })

    it('should return "pending" for pending transactions', () => {
        const lnPayCreated = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('created'),
        })
        const lnPayFunded = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('funded'),
        })
        const lnPayAwaitingChange = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('awaitingChange'),
        })
        const lnPayWaitingForRefund = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('waitingForRefund'),
        })
        const onchainWithdrawCreated = makeTestTxnEntry('onchainWithdraw', {
            state: makeTestOnchainWithdrawState('created'),
        })
        const oobSendUserCanceledProcessing = makeTestTxnEntry('oobSend', {
            state: makeTestOOBSpendState('userCanceledProcessing'),
        })
        const spDepositPending = makeTestTxnEntry('spDeposit', {
            state: makeTestSPDepositState('pendingDeposit'),
        })
        const spDepositDataNotInCache = makeTestTxnEntry('spDeposit', {
            state: makeTestSPDepositState('dataNotInCache'),
        })
        const spv2DepositPending = makeTestTxnEntry('sPV2Deposit', {
            state: makeTestSPV2DepositState('pendingDeposit'),
        })
        const spv2DepositDataNotInCache = makeTestTxnEntry('sPV2Deposit', {
            state: makeTestSPV2DepositState('dataNotInCache'),
        })
        const lnReceiveCreated = makeTestTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('created'),
        })
        const lnReceiveWaitingForPayment = makeTestTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('waitingForPayment'),
        })
        const lnReceiveFunded = makeTestTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('funded'),
        })
        const lnReceiveAwaitingFunds = makeTestTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('awaitingFunds'),
        })
        const lnurlWaitingForPayment = makeTestTxnEntry('lnRecurringdReceive', {
            state: makeTestLnReceiveState('waitingForPayment'),
        })
        const lnurlFunded = makeTestTxnEntry('lnRecurringdReceive', {
            state: makeTestLnReceiveState('funded'),
        })
        const lnurlAwaitingFunds = makeTestTxnEntry('lnRecurringdReceive', {
            state: makeTestLnReceiveState('awaitingFunds'),
        })
        const onchainDepositWaitingForTransaction = makeTestTxnEntry(
            'onchainDeposit',
            {
                state: makeTestOnchainDepositState('waitingForTransaction'),
            },
        )
        const onchainDepositWaitingForConfirmation = makeTestTxnEntry(
            'onchainDeposit',
            {
                state: makeTestOnchainDepositState('waitingForConfirmation'),
            },
        )
        const onchainDepositClaimed = makeTestTxnEntry('onchainDeposit', {
            state: makeTestOnchainDepositState('confirmed'),
        })
        const spWithdrawPending = makeTestTxnEntry('spWithdraw', {
            state: makeTestSPWithdrawalState('pendingWithdrawal'),
        })
        const spv2WithdrawalPending = makeTestTxnEntry('sPV2Withdrawal', {
            state: makeTestSPV2WithdrawalState('pendingWithdrawal'),
        })
        const spv2TransferOutDataNotInCache = makeTestTxnEntry(
            'sPV2TransferOut',
            {
                state: makeTestSPV2TransferOutState(
                    'dataNotInCache',
                    'unknown',
                ),
            },
        )
        const spv2TransferInDataNotInCache = makeTestTxnEntry(
            'sPV2TransferIn',
            {
                state: makeTestSPV2TransferInState('dataNotInCache', 'unknown'),
            },
        )
        const oobReceiveCreated = makeTestTxnEntry('oobReceive', {
            state: makeTestOOBReissueState('created'),
        })
        const oobReceiveIssuing = makeTestTxnEntry('oobReceive', {
            state: makeTestOOBReissueState('issuing'),
        })
        const multispendWithdrawalUnknown = makeTestTxnEntry(
            'multispendWithdrawal',
            {
                state: makeTestMultispendWithdrawalEventData('unknown'),
            },
        )

        expect(makeTxnStatusBadge(multispendWithdrawalUnknown)).toBe('pending')
        expect(makeTxnStatusBadge(lnPayCreated)).toBe('pending')
        expect(makeTxnStatusBadge(lnPayFunded)).toBe('pending')
        expect(makeTxnStatusBadge(lnPayAwaitingChange)).toBe('pending')
        expect(makeTxnStatusBadge(lnPayWaitingForRefund)).toBe('pending')
        expect(makeTxnStatusBadge(onchainWithdrawCreated)).toBe('pending')
        expect(makeTxnStatusBadge(oobSendUserCanceledProcessing)).toBe(
            'pending',
        )
        expect(makeTxnStatusBadge(spDepositPending)).toBe('pending')
        expect(makeTxnStatusBadge(spv2DepositPending)).toBe('pending')
        expect(makeTxnStatusBadge(lnReceiveCreated)).toBe('pending')
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
        expect(makeTxnStatusBadge(spv2TransferOutDataNotInCache)).toBe(
            'pending',
        )
        expect(makeTxnStatusBadge(spv2TransferInDataNotInCache)).toBe('pending')
        expect(makeTxnStatusBadge(spDepositDataNotInCache)).toBe('pending')
        expect(makeTxnStatusBadge(spv2DepositDataNotInCache)).toBe('pending')
    })

    it('should return "failed" for failed transactions', () => {
        const lnPayFailed = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('failed'),
        })
        const lnPayRefunded = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('refunded'),
        })
        const onchainWithdrawFailed = makeTestTxnEntry('onchainWithdraw', {
            state: makeTestOnchainWithdrawState('failed'),
        })
        const oobSendCanceled = makeTestTxnEntry('oobSend', {
            state: makeTestOOBSpendState('userCanceledSuccess'),
        })
        const oobSendRefunded = makeTestTxnEntry('oobSend', {
            state: makeTestOOBSpendState('refunded'),
        })
        const spv2DepositFailed = makeTestTxnEntry('sPV2Deposit', {
            state: makeTestSPV2DepositState('failedDeposit'),
        })
        const spv2TransferOutCompletedUnknown = makeTestTxnEntry(
            'sPV2TransferOut',
            {
                state: makeTestSPV2TransferOutState(
                    'completedTransfer',
                    'unknown',
                ),
            },
        )
        const onchainDepositFailed = makeTestTxnEntry('onchainDeposit', {
            state: makeTestOnchainDepositState('failed'),
        })
        const spv2WithdrawalFailed = makeTestTxnEntry('sPV2Withdrawal', {
            state: makeTestSPV2WithdrawalState('failedWithdrawal'),
        })
        const spv2TransferInUnknown = makeTestTxnEntry('sPV2TransferIn', {
            state: makeTestSPV2TransferInState('completedTransfer', 'unknown'),
        })
        const oobReceiveFailed = makeTestTxnEntry('oobReceive', {
            state: makeTestOOBReissueState('failed'),
        })
        const multispendWithdrawFailed = makeTestTxnEntry(
            'multispendWithdrawal',
            {
                state: makeTestMultispendWithdrawalEventData('rejected'),
            },
        )

        expect(makeTxnStatusBadge(lnPayFailed)).toBe('failed')
        expect(makeTxnStatusBadge(lnPayRefunded)).toBe('failed')
        expect(makeTxnStatusBadge(onchainWithdrawFailed)).toBe('failed')
        expect(makeTxnStatusBadge(oobSendCanceled)).toBe('failed')
        expect(makeTxnStatusBadge(oobSendRefunded)).toBe('failed')
        expect(makeTxnStatusBadge(onchainDepositFailed)).toBe('failed')
        expect(makeTxnStatusBadge(oobReceiveFailed)).toBe('failed')
        expect(makeTxnStatusBadge(multispendWithdrawFailed)).toBe('failed')
        expect(makeTxnStatusBadge(spv2DepositFailed)).toBe('failed')
        expect(makeTxnStatusBadge(spv2WithdrawalFailed)).toBe('failed')
        expect(makeTxnStatusBadge(spv2TransferInUnknown)).toBe('failed')
        expect(makeTxnStatusBadge(spv2TransferOutCompletedUnknown)).toBe(
            'failed',
        )
    })

    it('should return "expired" for expired transactions', () => {
        const lnPayCanceled = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('canceled'),
        })
        const lnReceiveCanceled = makeTestTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('canceled'),
        })
        const lnRecurringdReceiveCanceled = makeTestTxnEntry(
            'lnRecurringdReceive',
            {
                state: makeTestLnReceiveState('canceled'),
            },
        )

        expect(makeTxnStatusBadge(lnPayCanceled)).toBe('expired')
        expect(makeTxnStatusBadge(lnReceiveCanceled)).toBe('expired')
        expect(makeTxnStatusBadge(lnRecurringdReceiveCanceled)).toBe('expired')
    })
})
