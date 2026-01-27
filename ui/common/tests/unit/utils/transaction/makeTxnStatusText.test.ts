import { t } from 'i18next'

import { makeTxnStatusText } from '../../../../utils/transaction'
import {
    makeTestLnPayState,
    makeTestLnReceiveState,
    makeTestOnchainDepositState,
    makeTestOnchainWithdrawState,
    makeTestOOBReissueState,
    makeTestOOBSpendState,
    makeTestRpcTxnEntry,
    makeTestSPDepositState,
    makeTestSPV2DepositState,
    makeTestSPV2WithdrawalState,
    makeTestSPWithdrawalState,
} from '../../../utils/transaction'

describe('makeTxnStatusText', () => {
    describe('lightning', () => {
        it('lnPay', () => {
            const lnPayCreated = makeTestRpcTxnEntry('lnPay', {
                state: makeTestLnPayState('created'),
            })
            const lnPayFunded = makeTestRpcTxnEntry('lnPay', {
                state: makeTestLnPayState('funded'),
            })
            const lnPayAwaitingChange = makeTestRpcTxnEntry('lnPay', {
                state: makeTestLnPayState('awaitingChange'),
            })

            expect(makeTxnStatusText(t, lnPayCreated)).toBe(t('words.pending'))
            expect(makeTxnStatusText(t, lnPayFunded)).toBe(t('words.pending'))
            expect(makeTxnStatusText(t, lnPayAwaitingChange)).toBe(
                t('words.pending'),
            )

            const lnPayWaitingForRefund = makeTestRpcTxnEntry('lnPay', {
                state: makeTestLnPayState('waitingForRefund'),
            })

            expect(makeTxnStatusText(t, lnPayWaitingForRefund)).toBe(
                t('phrases.refund-pending'),
            )

            const lnPayCanceled = makeTestRpcTxnEntry('lnPay', {
                state: makeTestLnPayState('canceled'),
            })
            const lnPayFailed = makeTestRpcTxnEntry('lnPay', {
                state: makeTestLnPayState('failed'),
            })

            expect(makeTxnStatusText(t, lnPayCanceled)).toBe(t('words.failed'))
            expect(makeTxnStatusText(t, lnPayFailed)).toBe(t('words.failed'))

            const lnPayRefunded = makeTestRpcTxnEntry('lnPay', {
                state: makeTestLnPayState('refunded'),
            })

            expect(makeTxnStatusText(t, lnPayRefunded)).toBe(
                t('words.refunded'),
            )

            const lnPaySuccess = makeTestRpcTxnEntry('lnPay', {
                state: makeTestLnPayState('success'),
            })

            expect(makeTxnStatusText(t, lnPaySuccess)).toBe(t('words.sent'))
        })

        it('lnReceive', () => {
            const lnReceiveCreated = makeTestRpcTxnEntry('lnReceive', {
                state: makeTestLnReceiveState('created'),
            })
            const lnReceiveWaitingForPayment = makeTestRpcTxnEntry(
                'lnReceive',
                {
                    state: makeTestLnReceiveState('waitingForPayment'),
                },
            )
            const lnReceiveFunded = makeTestRpcTxnEntry('lnReceive', {
                state: makeTestLnReceiveState('funded'),
            })
            const lnReceiveAwaitingFunds = makeTestRpcTxnEntry('lnReceive', {
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

            const lnReceiveCanceled = makeTestRpcTxnEntry('lnReceive', {
                state: makeTestLnReceiveState('canceled'),
            })

            expect(makeTxnStatusText(t, lnReceiveCanceled)).toBe(
                t('words.expired'),
            )

            const lnReceiveClaimed = makeTestRpcTxnEntry('lnReceive', {
                state: makeTestLnReceiveState('claimed'),
            })

            expect(makeTxnStatusText(t, lnReceiveClaimed)).toBe(
                t('feature.receive.you-received'),
            )
        })
    })

    describe('onchain', () => {
        it('onchainWithdraw', () => {
            const onchainWithdrawSucceeded = makeTestRpcTxnEntry(
                'onchainWithdraw',
                {
                    state: makeTestOnchainWithdrawState('succeeded'),
                },
            )
            const onchainWithdrawFailed = makeTestRpcTxnEntry(
                'onchainWithdraw',
                {
                    state: makeTestOnchainWithdrawState('failed'),
                },
            )
            const onchainWithdrawCreated = makeTestRpcTxnEntry(
                'onchainWithdraw',
                {
                    state: makeTestOnchainWithdrawState('created'),
                },
            )

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
            const onchainDepositWaitingForTransaction = makeTestRpcTxnEntry(
                'onchainDeposit',
                {
                    state: makeTestOnchainDepositState('waitingForTransaction'),
                },
            )
            const onchainDepositWaitingForConfirmation = makeTestRpcTxnEntry(
                'onchainDeposit',
                {
                    state: makeTestOnchainDepositState(
                        'waitingForConfirmation',
                    ),
                },
            )
            const onchainDepositClaimed = makeTestRpcTxnEntry(
                'onchainDeposit',
                {
                    state: makeTestOnchainDepositState('claimed'),
                },
            )
            const onchainDepositFailed = makeTestRpcTxnEntry('onchainDeposit', {
                state: makeTestOnchainDepositState('failed'),
            })

            expect(
                makeTxnStatusText(t, onchainDepositWaitingForTransaction),
            ).toBe(t('phrases.address-created'))
            expect(
                makeTxnStatusText(t, onchainDepositWaitingForConfirmation),
            ).toBe(t('phrases.address-created'))
            expect(makeTxnStatusText(t, onchainDepositClaimed)).toBe(
                t('feature.receive.you-received'),
            )
            expect(makeTxnStatusText(t, onchainDepositFailed)).toBe(
                t('words.failed'),
            )
        })
    })

    describe('ecash', () => {
        it('oobSend', () => {
            const oobSendCreated = makeTestRpcTxnEntry('oobSend', {
                state: makeTestOOBSpendState('created'),
            })
            const oobSuccess = makeTestRpcTxnEntry('oobSend', {
                state: makeTestOOBSpendState('success'),
            })
            const oobUserCanceledFailure = makeTestRpcTxnEntry('oobSend', {
                state: makeTestOOBSpendState('userCanceledFailure'),
            })

            expect(makeTxnStatusText(t, oobSendCreated)).toBe(t('words.sent'))
            expect(makeTxnStatusText(t, oobSuccess)).toBe(t('words.sent'))
            expect(makeTxnStatusText(t, oobUserCanceledFailure)).toBe(
                t('words.sent'),
            )

            const oobRefunded = makeTestRpcTxnEntry('oobSend', {
                state: makeTestOOBSpendState('refunded'),
            })
            const oobCanceled = makeTestRpcTxnEntry('oobSend', {
                state: makeTestOOBSpendState('userCanceledSuccess'),
            })
            const oobUserCanceledProcessing = makeTestRpcTxnEntry('oobSend', {
                state: makeTestOOBSpendState('userCanceledProcessing'),
            })

            expect(makeTxnStatusText(t, oobRefunded)).toBe(t('words.refunded'))
            expect(makeTxnStatusText(t, oobCanceled)).toBe(t('words.canceled'))
            expect(makeTxnStatusText(t, oobUserCanceledProcessing)).toBe(
                t('words.pending'),
            )
        })

        it('oobReceive', () => {
            const oobReceiveCreated = makeTestRpcTxnEntry('oobReceive', {
                state: makeTestOOBReissueState('created'),
            })
            const oobReceiveIssuing = makeTestRpcTxnEntry('oobReceive', {
                state: makeTestOOBReissueState('issuing'),
            })
            const oobReceiveDone = makeTestRpcTxnEntry('oobReceive', {
                state: makeTestOOBReissueState('done'),
            })
            const oobReceiveFailed = makeTestRpcTxnEntry('oobReceive', {
                state: makeTestOOBReissueState('failed'),
            })

            expect(makeTxnStatusText(t, oobReceiveCreated)).toBe(
                t('words.pending'),
            )
            expect(makeTxnStatusText(t, oobReceiveIssuing)).toBe(
                t('words.pending'),
            )
            expect(makeTxnStatusText(t, oobReceiveDone)).toBe(
                t('feature.receive.you-received'),
            )
            expect(makeTxnStatusText(t, oobReceiveFailed)).toBe(
                t('words.failed'),
            )
        })
    })

    describe('lnurl', () => {
        it('lnRecurringdReceive', () => {
            const lnurlWaitingForPayment = makeTestRpcTxnEntry(
                'lnRecurringdReceive',
                {
                    state: makeTestLnReceiveState('waitingForPayment'),
                },
            )
            const lnurlFunded = makeTestRpcTxnEntry('lnRecurringdReceive', {
                state: makeTestLnReceiveState('funded'),
            })
            const lnurlAwaitingFunds = makeTestRpcTxnEntry(
                'lnRecurringdReceive',
                {
                    state: makeTestLnReceiveState('awaitingFunds'),
                },
            )

            expect(makeTxnStatusText(t, lnurlWaitingForPayment)).toBe(
                t('words.pending'),
            )
            expect(makeTxnStatusText(t, lnurlFunded)).toBe(t('words.pending'))
            expect(makeTxnStatusText(t, lnurlAwaitingFunds)).toBe(
                t('words.pending'),
            )

            const lnurlCanceled = makeTestRpcTxnEntry('lnRecurringdReceive', {
                state: makeTestLnReceiveState('canceled'),
            })

            expect(makeTxnStatusText(t, lnurlCanceled)).toBe(t('words.expired'))

            const lnurlCreated = makeTestRpcTxnEntry('lnRecurringdReceive', {
                state: makeTestLnReceiveState('created'),
            })
            const lnurlClaimed = makeTestRpcTxnEntry('lnRecurringdReceive', {
                state: makeTestLnReceiveState('claimed'),
            })

            // TODO:TEST: This should NOT be the case - Locate bugged state and update if fixed
            expect(makeTxnStatusText(t, lnurlCreated)).toBe(t('words.received'))
            expect(makeTxnStatusText(t, lnurlClaimed)).toBe(t('words.received'))
        })
    })

    describe('stabilitypool', () => {
        it('spDeposit', () => {
            const spDepositPending = makeTestRpcTxnEntry('spDeposit', {
                state: makeTestSPDepositState('pendingDeposit'),
            })

            expect(makeTxnStatusText(t, spDepositPending)).toBe(
                t('words.pending'),
            )

            const spDepositComplete = makeTestRpcTxnEntry('spDeposit', {
                state: makeTestSPDepositState('completeDeposit'),
            })
            const spDepositDataNotInCache = makeTestRpcTxnEntry('spDeposit', {
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
            const spv2DepositPending = makeTestRpcTxnEntry('sPV2Deposit', {
                state: makeTestSPV2DepositState('pendingDeposit'),
            })

            expect(makeTxnStatusText(t, spv2DepositPending)).toBe(
                t('words.pending'),
            )

            const spv2DepositComplete = makeTestRpcTxnEntry('sPV2Deposit', {
                state: makeTestSPV2DepositState('completedDeposit'),
            })
            const spv2DepositFailed = makeTestRpcTxnEntry('sPV2Deposit', {
                state: makeTestSPV2DepositState('failedDeposit'),
            })
            const spv2DepositDataNotInCache = makeTestRpcTxnEntry(
                'sPV2Deposit',
                {
                    state: makeTestSPV2DepositState('dataNotInCache'),
                },
            )

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
            const spWithdrawPending = makeTestRpcTxnEntry('spWithdraw', {
                state: makeTestSPWithdrawalState('pendingWithdrawal'),
            })
            const spWithdrawComplete = makeTestRpcTxnEntry('spWithdraw', {
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
            const spv2WithdrawalPending = makeTestRpcTxnEntry(
                'sPV2Withdrawal',
                {
                    state: makeTestSPV2WithdrawalState('pendingWithdrawal'),
                },
            )
            const spv2WithdrawalFailed = makeTestRpcTxnEntry('sPV2Withdrawal', {
                state: makeTestSPV2WithdrawalState('failedWithdrawal'),
            })
            const spv2WithdrawalComplete = makeTestRpcTxnEntry(
                'sPV2Withdrawal',
                {
                    state: makeTestSPV2WithdrawalState('completedWithdrawal'),
                },
            )
            const spv2WithdrawalDataNotInCache = makeTestRpcTxnEntry(
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
            const spv2TransferInPending = makeTestRpcTxnEntry('sPV2TransferIn')

            expect(makeTxnStatusText(t, spv2TransferInPending)).toBe(
                t('words.pending'),
            )
        })

        it('sPV2TransferOut', () => {
            const spv2TransferOutPending =
                makeTestRpcTxnEntry('sPV2TransferOut')

            expect(makeTxnStatusText(t, spv2TransferOutPending)).toBe(
                t('words.received'),
            )
        })
    })
})
