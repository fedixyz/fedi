import { makeTxnStatusText } from '../../../../utils/transaction'
import { createMockT } from '../../../utils/setup'
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
    makeTestSPV2WithdrawalState,
    makeTestSPWithdrawalState,
} from '../../../utils/transaction'

describe('makeTxnStatusText', () => {
    const t = createMockT()

    describe('lightning', () => {
        it('lnPay', () => {
            const lnPayCreated = makeTestTxnEntry('lnPay', {
                state: makeTestLnPayState('created'),
            })
            const lnPayFunded = makeTestTxnEntry('lnPay', {
                state: makeTestLnPayState('funded'),
            })
            const lnPayAwaitingChange = makeTestTxnEntry('lnPay', {
                state: makeTestLnPayState('awaitingChange'),
            })

            expect(makeTxnStatusText(t, lnPayCreated)).toBe(t('words.pending'))
            expect(makeTxnStatusText(t, lnPayFunded)).toBe(t('words.pending'))
            expect(makeTxnStatusText(t, lnPayAwaitingChange)).toBe(
                t('words.pending'),
            )

            const lnPayWaitingForRefund = makeTestTxnEntry('lnPay', {
                state: makeTestLnPayState('waitingForRefund'),
            })

            expect(makeTxnStatusText(t, lnPayWaitingForRefund)).toBe(
                t('phrases.refund-pending'),
            )

            const lnPayCanceled = makeTestTxnEntry('lnPay', {
                state: makeTestLnPayState('canceled'),
            })
            const lnPayFailed = makeTestTxnEntry('lnPay', {
                state: makeTestLnPayState('failed'),
            })

            expect(makeTxnStatusText(t, lnPayCanceled)).toBe(t('words.failed'))
            expect(makeTxnStatusText(t, lnPayFailed)).toBe(t('words.failed'))

            const lnPayRefunded = makeTestTxnEntry('lnPay', {
                state: makeTestLnPayState('refunded'),
            })

            expect(makeTxnStatusText(t, lnPayRefunded)).toBe(
                t('words.refunded'),
            )

            const lnPaySuccess = makeTestTxnEntry('lnPay', {
                state: makeTestLnPayState('success'),
            })

            expect(makeTxnStatusText(t, lnPaySuccess)).toBe(t('words.sent'))
        })

        it('lnReceive', () => {
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

            expect(makeTxnStatusText(t, lnReceiveCreated)).toBe(
                t('words.pending'),
            )
            expect(makeTxnStatusText(t, lnReceiveWaitingForPayment)).toBe(
                t('words.pending'),
            )
            expect(makeTxnStatusText(t, lnReceiveFunded)).toBe(
                t('words.pending'),
            )
            expect(makeTxnStatusText(t, lnReceiveAwaitingFunds)).toBe(
                t('words.pending'),
            )

            const lnReceiveCanceled = makeTestTxnEntry('lnReceive', {
                state: makeTestLnReceiveState('canceled'),
            })

            expect(makeTxnStatusText(t, lnReceiveCanceled)).toBe(
                t('words.expired'),
            )

            const lnReceiveClaimed = makeTestTxnEntry('lnReceive', {
                state: makeTestLnReceiveState('claimed'),
            })

            expect(makeTxnStatusText(t, lnReceiveClaimed)).toBe(
                t('words.received'),
            )
        })
    })

    describe('onchain', () => {
        it('onchainWithdraw', () => {
            const onchainWithdrawSucceeded = makeTestTxnEntry(
                'onchainWithdraw',
                {
                    state: makeTestOnchainWithdrawState('succeeded'),
                },
            )
            const onchainWithdrawFailed = makeTestTxnEntry('onchainWithdraw', {
                state: makeTestOnchainWithdrawState('failed'),
            })
            const onchainWithdrawCreated = makeTestTxnEntry('onchainWithdraw', {
                state: makeTestOnchainWithdrawState('created'),
            })

            expect(makeTxnStatusText(t, onchainWithdrawSucceeded)).toBe(
                t('words.sent'),
            )
            expect(makeTxnStatusText(t, onchainWithdrawFailed)).toBe(
                t('words.failed'),
            )
            expect(makeTxnStatusText(t, onchainWithdrawCreated)).toBe(
                t('words.pending'),
            )
        })

        it('onchainDeposit', () => {
            const onchainDepositWaitingForTransaction = makeTestTxnEntry(
                'onchainDeposit',
                {
                    state: makeTestOnchainDepositState('waitingForTransaction'),
                },
            )
            const onchainDepositWaitingForConfirmation = makeTestTxnEntry(
                'onchainDeposit',
                {
                    state: makeTestOnchainDepositState(
                        'waitingForConfirmation',
                    ),
                },
            )
            const onchainDepositClaimed = makeTestTxnEntry('onchainDeposit', {
                state: makeTestOnchainDepositState('claimed'),
            })
            const onchainDepositFailed = makeTestTxnEntry('onchainDeposit', {
                state: makeTestOnchainDepositState('failed'),
            })

            expect(
                makeTxnStatusText(t, onchainDepositWaitingForTransaction),
            ).toBe(t('phrases.address-created'))
            expect(
                makeTxnStatusText(t, onchainDepositWaitingForConfirmation),
            ).toBe(t('words.pending'))
            expect(makeTxnStatusText(t, onchainDepositClaimed)).toBe(
                t('words.received'),
            )
            expect(makeTxnStatusText(t, onchainDepositFailed)).toBe(
                t('words.failed'),
            )
        })
    })

    describe('ecash', () => {
        it('oobSend', () => {
            const oobSendCreated = makeTestTxnEntry('oobSend', {
                state: makeTestOOBSpendState('created'),
            })
            const oobSuccess = makeTestTxnEntry('oobSend', {
                state: makeTestOOBSpendState('success'),
            })
            const oobUserCanceledFailure = makeTestTxnEntry('oobSend', {
                state: makeTestOOBSpendState('userCanceledFailure'),
            })

            expect(makeTxnStatusText(t, oobSendCreated)).toBe(t('words.sent'))
            expect(makeTxnStatusText(t, oobSuccess)).toBe(t('words.sent'))
            expect(makeTxnStatusText(t, oobUserCanceledFailure)).toBe(
                t('words.sent'),
            )

            const oobRefunded = makeTestTxnEntry('oobSend', {
                state: makeTestOOBSpendState('refunded'),
            })
            const oobCanceled = makeTestTxnEntry('oobSend', {
                state: makeTestOOBSpendState('userCanceledSuccess'),
            })
            const oobUserCanceledProcessing = makeTestTxnEntry('oobSend', {
                state: makeTestOOBSpendState('userCanceledProcessing'),
            })

            expect(makeTxnStatusText(t, oobRefunded)).toBe(t('words.refunded'))
            expect(makeTxnStatusText(t, oobCanceled)).toBe(t('words.canceled'))
            expect(makeTxnStatusText(t, oobUserCanceledProcessing)).toBe(
                t('words.pending'),
            )
        })

        it('oobReceive', () => {
            const oobReceiveCreated = makeTestTxnEntry('oobReceive', {
                state: makeTestOOBReissueState('created'),
            })
            const oobReceiveIssuing = makeTestTxnEntry('oobReceive', {
                state: makeTestOOBReissueState('issuing'),
            })
            const oobReceiveDone = makeTestTxnEntry('oobReceive', {
                state: makeTestOOBReissueState('done'),
            })
            const oobReceiveFailed = makeTestTxnEntry('oobReceive', {
                state: makeTestOOBReissueState('failed'),
            })

            expect(makeTxnStatusText(t, oobReceiveCreated)).toBe(
                t('words.pending'),
            )
            expect(makeTxnStatusText(t, oobReceiveIssuing)).toBe(
                t('words.pending'),
            )
            expect(makeTxnStatusText(t, oobReceiveDone)).toBe(
                t('words.complete'),
            )
            expect(makeTxnStatusText(t, oobReceiveFailed)).toBe(
                t('words.failed'),
            )
        })
    })

    describe('lnurl', () => {
        it('lnRecurringdReceive', () => {
            const lnurlWaitingForPayment = makeTestTxnEntry(
                'lnRecurringdReceive',
                {
                    state: makeTestLnReceiveState('waitingForPayment'),
                },
            )
            const lnurlFunded = makeTestTxnEntry('lnRecurringdReceive', {
                state: makeTestLnReceiveState('funded'),
            })
            const lnurlAwaitingFunds = makeTestTxnEntry('lnRecurringdReceive', {
                state: makeTestLnReceiveState('awaitingFunds'),
            })

            expect(makeTxnStatusText(t, lnurlWaitingForPayment)).toBe(
                t('words.pending'),
            )
            expect(makeTxnStatusText(t, lnurlFunded)).toBe(t('words.pending'))
            expect(makeTxnStatusText(t, lnurlAwaitingFunds)).toBe(
                t('words.pending'),
            )

            const lnurlCanceled = makeTestTxnEntry('lnRecurringdReceive', {
                state: makeTestLnReceiveState('canceled'),
            })

            expect(makeTxnStatusText(t, lnurlCanceled)).toBe(t('words.expired'))

            const lnurlCreated = makeTestTxnEntry('lnRecurringdReceive', {
                state: makeTestLnReceiveState('created'),
            })
            const lnurlClaimed = makeTestTxnEntry('lnRecurringdReceive', {
                state: makeTestLnReceiveState('claimed'),
            })

            // TODO:TEST: This should NOT be the case - Locate bugged state and update if fixed
            expect(makeTxnStatusText(t, lnurlCreated)).toBe(t('words.received'))
            expect(makeTxnStatusText(t, lnurlClaimed)).toBe(t('words.received'))
        })
    })

    describe('stabilitypool', () => {
        it('spDeposit', () => {
            const spDepositPending = makeTestTxnEntry('spDeposit', {
                state: makeTestSPDepositState('pendingDeposit'),
            })

            expect(makeTxnStatusText(t, spDepositPending)).toBe(
                t('words.pending'),
            )

            const spDepositComplete = makeTestTxnEntry('spDeposit', {
                state: makeTestSPDepositState('completeDeposit'),
            })
            const spDepositDataNotInCache = makeTestTxnEntry('spDeposit', {
                state: makeTestSPDepositState('dataNotInCache'),
            })

            expect(makeTxnStatusText(t, spDepositComplete)).toBe(
                t('words.deposit'),
            )
            // TODO:TEST: This should NOT be the case
            expect(makeTxnStatusText(t, spDepositDataNotInCache)).toBe(
                t('words.deposit'),
            )
        })

        it('sPV2Deposit', () => {
            const spv2DepositPending = makeTestTxnEntry('sPV2Deposit', {
                state: makeTestSPV2DepositState('pendingDeposit'),
            })

            expect(makeTxnStatusText(t, spv2DepositPending)).toBe(
                t('words.pending'),
            )

            const spv2DepositComplete = makeTestTxnEntry('sPV2Deposit', {
                state: makeTestSPV2DepositState('completedDeposit'),
            })
            const spv2DepositFailed = makeTestTxnEntry('sPV2Deposit', {
                state: makeTestSPV2DepositState('failedDeposit'),
            })
            const spv2DepositDataNotInCache = makeTestTxnEntry('sPV2Deposit', {
                state: makeTestSPV2DepositState('dataNotInCache'),
            })

            expect(makeTxnStatusText(t, spv2DepositComplete)).toBe(
                t('words.deposit'),
            )
            // TODO:TEST: This should NOT be the case
            expect(makeTxnStatusText(t, spv2DepositFailed)).toBe(
                t('words.deposit'),
            )
            expect(makeTxnStatusText(t, spv2DepositDataNotInCache)).toBe(
                t('words.deposit'),
            )
        })

        it('spWithdraw', () => {
            const spWithdrawPending = makeTestTxnEntry('spWithdraw', {
                state: makeTestSPWithdrawalState('pendingWithdrawal'),
            })
            const spWithdrawComplete = makeTestTxnEntry('spWithdraw', {
                state: makeTestSPWithdrawalState('completeWithdrawal'),
            })

            expect(makeTxnStatusText(t, spWithdrawPending)).toBe(
                t('words.pending'),
            )
            expect(makeTxnStatusText(t, spWithdrawComplete)).toBe(
                t('words.withdrawal'),
            )
        })

        it('sPV2Withdrawal', () => {
            const spv2WithdrawalPending = makeTestTxnEntry('sPV2Withdrawal', {
                state: makeTestSPV2WithdrawalState('pendingWithdrawal'),
            })
            const spv2WithdrawalFailed = makeTestTxnEntry('sPV2Withdrawal', {
                state: makeTestSPV2WithdrawalState('failedWithdrawal'),
            })
            const spv2WithdrawalComplete = makeTestTxnEntry('sPV2Withdrawal', {
                state: makeTestSPV2WithdrawalState('completedWithdrawal'),
            })
            const spv2WithdrawalDataNotInCache = makeTestTxnEntry(
                'sPV2Withdrawal',
                {
                    state: makeTestSPV2WithdrawalState('dataNotInCache'),
                },
            )

            expect(makeTxnStatusText(t, spv2WithdrawalPending)).toBe(
                t('words.pending'),
            )
            expect(makeTxnStatusText(t, spv2WithdrawalComplete)).toBe(
                t('words.withdrawal'),
            )
            expect(makeTxnStatusText(t, spv2WithdrawalDataNotInCache)).toBe(
                t('words.pending'),
            )
            // TODO:TEST: This should NOT be the case - Need to properly handle failed state
            expect(makeTxnStatusText(t, spv2WithdrawalFailed)).toBe(
                t('words.withdrawal'),
            )
        })

        it('sPV2TransferIn', () => {
            const spv2TransferInPending = makeTestTxnEntry('sPV2TransferIn')

            expect(makeTxnStatusText(t, spv2TransferInPending)).toBe(
                t('words.withdrawal'),
            )
        })

        it('sPV2TransferOut', () => {
            const spv2TransferOutPending = makeTestTxnEntry('sPV2TransferOut')

            expect(makeTxnStatusText(t, spv2TransferOutPending)).toBe(
                t('words.sent'),
            )
        })
    })
})
