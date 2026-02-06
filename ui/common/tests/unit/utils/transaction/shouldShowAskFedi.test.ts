import { shouldShowAskFedi } from '../../../../utils/transaction'
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

describe('shouldShowAskFedi', () => {
    it('[lightning payment] should hide the "Ask Fedi" button for a successful lightning transaction', () => {
        const lnPay = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('success'),
        })

        expect(shouldShowAskFedi(lnPay)).toBe(false)
    })

    it('[lightning send] should show the "Ask Fedi" button for a non-successful lightning transaction', () => {
        const created = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('created'),
        })
        const funded = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('funded'),
        })
        const awaitingChange = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('awaitingChange'),
        })
        const waitingForRefund = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('waitingForRefund'),
        })
        const refunded = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('refunded'),
        })
        const failed = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('failed'),
        })
        const cancelled = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('canceled'),
        })

        expect(shouldShowAskFedi(created)).toBe(true)
        expect(shouldShowAskFedi(funded)).toBe(true)
        expect(shouldShowAskFedi(awaitingChange)).toBe(true)
        expect(shouldShowAskFedi(waitingForRefund)).toBe(true)
        expect(shouldShowAskFedi(refunded)).toBe(true)
        expect(shouldShowAskFedi(failed)).toBe(true)
        expect(shouldShowAskFedi(cancelled)).toBe(true)
    })

    it('[onchain withdraw] should hide the "Ask Fedi" button for a successful onchain withdrawal', () => {
        const onchainWithdraw = makeTestTxnEntry('onchainWithdraw', {
            state: makeTestOnchainWithdrawState('succeeded'),
        })

        expect(shouldShowAskFedi(onchainWithdraw)).toBe(false)
    })

    it('[onchain withdraw] should show the "Ask Fedi" button for a non-successful onchain withdrawal', () => {
        const created = makeTestTxnEntry('onchainWithdraw', {
            state: makeTestOnchainWithdrawState('created'),
        })
        const failed = makeTestTxnEntry('onchainWithdraw', {
            state: makeTestOnchainWithdrawState('failed'),
        })

        expect(shouldShowAskFedi(created)).toBe(true)
        expect(shouldShowAskFedi(failed)).toBe(true)
    })

    it('[ecash send] should hide the "Ask Fedi" button for a successful ecash send', () => {
        const success = makeTestTxnEntry('oobSend', {
            state: makeTestOOBSpendState('success'),
        })
        const userCanceledFailure = makeTestTxnEntry('oobSend', {
            state: makeTestOOBSpendState('userCanceledFailure'),
        })
        const created = makeTestTxnEntry('oobSend', {
            state: makeTestOOBSpendState('created'),
        })

        expect(shouldShowAskFedi(success)).toBe(false)
        expect(shouldShowAskFedi(created)).toBe(false)
        // userCanceledFailure means that the funds were already claimed by the recipient and can no longer be cancelled
        // in other words, a success
        expect(shouldShowAskFedi(userCanceledFailure)).toBe(false)
    })

    it('[ecash send] should show the "Ask Fedi" button for a non-successful ecash send', () => {
        const userCanceledSuccess = makeTestTxnEntry('oobSend', {
            state: makeTestOOBSpendState('userCanceledSuccess'),
        })
        const userCanceledProcessing = makeTestTxnEntry('oobSend', {
            state: makeTestOOBSpendState('userCanceledProcessing'),
        })
        const refunded = makeTestTxnEntry('oobSend', {
            state: makeTestOOBSpendState('refunded'),
        })

        expect(shouldShowAskFedi(userCanceledSuccess)).toBe(true)
        expect(shouldShowAskFedi(userCanceledProcessing)).toBe(true)
        expect(shouldShowAskFedi(refunded)).toBe(true)
    })

    it('[stabilitypool deposit] should hide the "Ask Fedi" button for a successful stabilitypool deposit', () => {
        const spDeposit = makeTestTxnEntry('spDeposit', {
            state: makeTestSPDepositState('completeDeposit'),
        })
        const sPV2Deposit = makeTestTxnEntry('sPV2Deposit', {
            state: makeTestSPV2DepositState('completedDeposit'),
        })

        expect(shouldShowAskFedi(spDeposit)).toBe(false)
        expect(shouldShowAskFedi(sPV2Deposit)).toBe(false)
    })

    it('[stabilitypool deposit] should show the "Ask Fedi" button for a non-successful stabilitypool deposit', () => {
        const pendingDeposit = makeTestTxnEntry('spDeposit', {
            state: makeTestSPDepositState('pendingDeposit'),
        })
        const pendingV2Deposit = makeTestTxnEntry('sPV2Deposit', {
            state: makeTestSPV2DepositState('pendingDeposit'),
        })
        const failedV2 = makeTestTxnEntry('sPV2Deposit', {
            state: makeTestSPV2DepositState('failedDeposit'),
        })
        const notInCacheV2 = makeTestTxnEntry('sPV2Deposit', {
            state: makeTestSPV2DepositState('dataNotInCache'),
        })
        const notInCache = makeTestTxnEntry('spDeposit', {
            state: makeTestSPDepositState('dataNotInCache'),
        })

        expect(shouldShowAskFedi(pendingDeposit)).toBe(true)
        expect(shouldShowAskFedi(pendingV2Deposit)).toBe(true)
        expect(shouldShowAskFedi(failedV2)).toBe(true)
        // TODO:TEST: This should NOT be the case
        expect(shouldShowAskFedi(notInCache)).toBe(false)
        expect(shouldShowAskFedi(notInCacheV2)).toBe(false)
    })

    it('[lightning receive] should hide the "Ask Fedi" button for a successful lightning receive', () => {
        const lnReceive = makeTestTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('claimed'),
        })

        expect(shouldShowAskFedi(lnReceive)).toBe(false)
    })

    it('[lightning receive] should show the "Ask Fedi" button for a non-successful lightning receive', () => {
        const created = makeTestTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('created'),
        })
        const waitingForPayment = makeTestTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('waitingForPayment'),
        })
        const funded = makeTestTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('funded'),
        })
        const awaitingFunds = makeTestTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('awaitingFunds'),
        })
        const cancelled = makeTestTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('canceled'),
        })

        expect(shouldShowAskFedi(created)).toBe(true)
        expect(shouldShowAskFedi(waitingForPayment)).toBe(true)
        expect(shouldShowAskFedi(funded)).toBe(true)
        expect(shouldShowAskFedi(awaitingFunds)).toBe(true)
        expect(shouldShowAskFedi(cancelled)).toBe(true)
    })

    it('[onchain deposit] should hide the "Ask Fedi" button for a successful onchain deposit', () => {
        const onchainDeposit = makeTestTxnEntry('onchainDeposit', {
            state: makeTestOnchainDepositState('claimed'),
        })

        expect(shouldShowAskFedi(onchainDeposit)).toBe(false)
    })

    it('[onchain deposit] should show the "Ask Fedi" button for a non-successful onchain deposit', () => {
        const waitingForConfirmation = makeTestTxnEntry('onchainDeposit', {
            state: makeTestOnchainDepositState('waitingForConfirmation'),
        })
        const waitingForTransaction = makeTestTxnEntry('onchainDeposit', {
            state: makeTestOnchainDepositState('waitingForTransaction'),
        })
        const confirmed = makeTestTxnEntry('onchainDeposit', {
            state: makeTestOnchainDepositState('confirmed'),
        })
        const failed = makeTestTxnEntry('onchainDeposit', {
            state: makeTestOnchainDepositState('failed'),
        })

        expect(shouldShowAskFedi(waitingForConfirmation)).toBe(true)
        expect(shouldShowAskFedi(waitingForTransaction)).toBe(true)
        expect(shouldShowAskFedi(confirmed)).toBe(true)
        expect(shouldShowAskFedi(failed)).toBe(true)
    })

    it('[stabilitypool withdrawal] should hide the "Ask Fedi" button for a successful stabilitypool withdrawal', () => {
        const spWithdraw = makeTestTxnEntry('spWithdraw', {
            state: makeTestSPWithdrawalState('completeWithdrawal'),
        })
        const sPV2Withdrawal = makeTestTxnEntry('sPV2Withdrawal', {
            state: makeTestSPV2WithdrawalState('completedWithdrawal'),
        })

        expect(shouldShowAskFedi(spWithdraw)).toBe(false)
        expect(shouldShowAskFedi(sPV2Withdrawal)).toBe(false)
    })

    it('[stabilitypool withdrawal] should show the "Ask Fedi" button for a non-successful stabilitypool withdrawal', () => {
        const pendingWithdrawal = makeTestTxnEntry('spWithdraw', {
            state: makeTestSPWithdrawalState('pendingWithdrawal'),
        })
        const pendingV2Withdrawal = makeTestTxnEntry('sPV2Withdrawal', {
            state: makeTestSPV2WithdrawalState('pendingWithdrawal'),
        })
        const failedV2 = makeTestTxnEntry('sPV2Withdrawal', {
            state: makeTestSPV2WithdrawalState('failedWithdrawal'),
        })
        const notInCacheV2 = makeTestTxnEntry('sPV2Withdrawal', {
            state: makeTestSPV2WithdrawalState('dataNotInCache'),
        })

        expect(shouldShowAskFedi(pendingWithdrawal)).toBe(true)
        expect(shouldShowAskFedi(pendingV2Withdrawal)).toBe(true)
        expect(shouldShowAskFedi(failedV2)).toBe(true)
        expect(shouldShowAskFedi(notInCacheV2)).toBe(true)
    })

    it('[ecash receive] should hide the "Ask Fedi" button for a successful ecash receive', () => {
        const oobReceive = makeTestTxnEntry('oobReceive', {
            state: makeTestOOBReissueState('done'),
        })

        expect(shouldShowAskFedi(oobReceive)).toBe(false)
    })

    it('[ecash receive] should show the "Ask Fedi" button for a non-successful ecash receive', () => {
        const created = makeTestTxnEntry('oobReceive', {
            state: makeTestOOBReissueState('created'),
        })
        const issuing = makeTestTxnEntry('oobReceive', {
            state: makeTestOOBReissueState('issuing'),
        })
        const failed = makeTestTxnEntry('oobReceive', {
            state: makeTestOOBReissueState('failed'),
        })

        expect(shouldShowAskFedi(created)).toBe(true)
        expect(shouldShowAskFedi(issuing)).toBe(true)
        expect(shouldShowAskFedi(failed)).toBe(true)
    })
})
