import { TransactionListEntry } from '../../../../types'
import { makeTxnDetailTitleText } from '../../../../utils/transaction'
import { createMockT } from '../../../utils/setup'
import {
    makeTestLnReceiveState,
    makeTestMultispendTxnEntry,
    makeTestOnchainDepositState,
    makeTestRpcTxnEntry,
    makeTestSPV2TransferInState,
    makeTestSPV2TransferOutState,
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

    it('[lnPay, oobSend, onchainWithdraw] should return "you-sent"', () => {
        const lnPay = makeTestRpcTxnEntry('lnPay')
        const oobSend = makeTestRpcTxnEntry('oobSend')
        const onchainWithdraw = makeTestRpcTxnEntry('onchainWithdraw')

        expect(makeTxnDetailTitleText(t, lnPay)).toBe(
            t('feature.send.you-sent'),
        )
        expect(makeTxnDetailTitleText(t, oobSend)).toBe(
            t('feature.send.you-sent'),
        )
        expect(makeTxnDetailTitleText(t, onchainWithdraw)).toBe(
            t('feature.send.you-sent'),
        )
    })

    it('[lnReceive, lnRecurringdReceive] should correctly determine the title based on the txn state', () => {
        const lnReceiveClaimed = makeTestRpcTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('claimed'),
        })
        const lnReceiveCanceled = makeTestRpcTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('canceled'),
        })
        const lnReceiveCreated = makeTestRpcTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('created'),
        })
        const lnReceiveAwaitingFunds = makeTestRpcTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('awaitingFunds'),
        })
        const lnReceiveWaitingForPayment = makeTestRpcTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('waitingForPayment'),
        })
        const lnurlClaimed = makeTestRpcTxnEntry('lnRecurringdReceive', {
            state: makeTestLnReceiveState('claimed'),
        })
        const lnurlCanceled = makeTestRpcTxnEntry('lnRecurringdReceive', {
            state: makeTestLnReceiveState('canceled'),
        })
        const lnurlCreated = makeTestRpcTxnEntry('lnRecurringdReceive', {
            state: makeTestLnReceiveState('created'),
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

        expect(makeTxnDetailTitleText(t, lnReceiveClaimed)).toBe(
            t('feature.receive.you-received'),
        )
        expect(makeTxnDetailTitleText(t, lnurlClaimed)).toBe(
            t('feature.receive.you-received'),
        )
        expect(makeTxnDetailTitleText(t, lnReceiveCanceled)).toBe(
            t('words.expired'),
        )
        expect(makeTxnDetailTitleText(t, lnurlCanceled)).toBe(
            t('words.expired'),
        )
        expect(makeTxnDetailTitleText(t, lnReceiveCreated)).toBe(
            t('phrases.receive-pending'),
        )
        expect(makeTxnDetailTitleText(t, lnurlCreated)).toBe(
            t('phrases.receive-pending'),
        )
        expect(makeTxnDetailTitleText(t, lnurlWaitingForPayment)).toBe(
            t('phrases.receive-pending'),
        )
        expect(makeTxnDetailTitleText(t, lnurlFunded)).toBe(
            t('phrases.receive-pending'),
        )
        expect(makeTxnDetailTitleText(t, lnurlAwaitingFunds)).toBe(
            t('phrases.receive-pending'),
        )
        expect(makeTxnDetailTitleText(t, lnReceiveAwaitingFunds)).toBe(
            t('phrases.receive-pending'),
        )
        expect(makeTxnDetailTitleText(t, lnReceiveWaitingForPayment)).toBe(
            t('phrases.receive-pending'),
        )
    })

    it('[onchainDeposit] should correctly determine the title based on the txn state', () => {
        const onchainWaitingForTransaction = makeTestRpcTxnEntry(
            'onchainDeposit',
            {
                state: makeTestOnchainDepositState('waitingForTransaction'),
            },
        )
        const onchainClaimed = makeTestRpcTxnEntry('onchainDeposit', {
            state: makeTestOnchainDepositState('claimed'),
        })
        const onchainFailed = makeTestRpcTxnEntry('onchainDeposit', {
            state: makeTestOnchainDepositState('failed'),
        })
        const onchainWaitingForConfirmation = makeTestRpcTxnEntry(
            'onchainDeposit',
            {
                state: makeTestOnchainDepositState('waitingForConfirmation'),
            },
        )
        const onchainConfirmed = makeTestRpcTxnEntry('onchainDeposit', {
            state: makeTestOnchainDepositState('confirmed'),
        })

        expect(makeTxnDetailTitleText(t, onchainWaitingForTransaction)).toBe(
            t('phrases.address-created'),
        )
        expect(makeTxnDetailTitleText(t, onchainClaimed)).toBe(
            t('feature.receive.you-received'),
        )
        expect(makeTxnDetailTitleText(t, onchainWaitingForConfirmation)).toBe(
            t('phrases.receive-pending'),
        )
        expect(makeTxnDetailTitleText(t, onchainConfirmed)).toBe(
            t('phrases.receive-pending'),
        )
        expect(makeTxnDetailTitleText(t, onchainFailed)).toBe(t('words.failed'))
    })

    it('[spDeposit/spWithdraw/sPV2Deposit/sPV2Withdrawal] should correctly determine the title based on the txn state', () => {
        const spDeposit = makeTestRpcTxnEntry('spDeposit')
        const spWithdraw = makeTestRpcTxnEntry('spWithdraw')
        const sPV2Deposit = makeTestRpcTxnEntry('sPV2Deposit')
        const sPV2Withdrawal = makeTestRpcTxnEntry('sPV2Withdrawal')

        expect(makeTxnDetailTitleText(t, spDeposit)).toBe(
            t('feature.stabilitypool.you-deposited'),
        )
        expect(makeTxnDetailTitleText(t, spWithdraw)).toBe(
            t('feature.stabilitypool.you-withdrew'),
        )
        expect(makeTxnDetailTitleText(t, sPV2Deposit)).toBe(
            t('feature.stabilitypool.you-deposited'),
        )
        expect(makeTxnDetailTitleText(t, sPV2Withdrawal)).toBe(
            t('feature.stabilitypool.you-withdrew'),
        )
    })

    it('[sPV2TransferIn] should determine the title based on the txn state and kind', () => {
        const spv2TransferInCompleted = makeTestRpcTxnEntry('sPV2TransferIn', {
            state: makeTestSPV2TransferInState(
                'completedTransfer',
                'multispend',
            ),
        })
        const spv2TransferInCompletedUnknown = makeTestRpcTxnEntry(
            'sPV2TransferIn',
            {
                state: makeTestSPV2TransferInState(
                    'completedTransfer',
                    'unknown',
                ),
            },
        )
        const spv2TransferInDataNotInCache = makeTestRpcTxnEntry(
            'sPV2TransferIn',
            {
                state: makeTestSPV2TransferInState(
                    'dataNotInCache',
                    'multispend',
                ),
            },
        )

        expect(makeTxnDetailTitleText(t, spv2TransferInCompleted)).toBe(
            t('feature.stabilitypool.you-withdrew'),
        )
        expect(makeTxnDetailTitleText(t, spv2TransferInCompletedUnknown)).toBe(
            t('feature.receive.you-received'),
        )
        expect(makeTxnDetailTitleText(t, spv2TransferInDataNotInCache)).toBe(
            t('feature.receive.you-received'),
        )
    })

    it('[spv2TransferOut] should determine the title based on the txn state and kind', () => {
        const spv2TransferOutCompletedMultispend = makeTestRpcTxnEntry(
            'sPV2TransferOut',
            {
                state: makeTestSPV2TransferOutState(
                    'completedTransfer',
                    'multispend',
                ),
            },
        )
        const spv2TransferOutCompletedMatrixSpTransfer = makeTestRpcTxnEntry(
            'sPV2TransferOut',
            {
                state: makeTestSPV2TransferOutState(
                    'completedTransfer',
                    'matrixSpTransfer',
                ),
            },
        )
        const spv2TransferOutCompletedSpTransferUi = makeTestRpcTxnEntry(
            'sPV2TransferOut',
            {
                state: makeTestSPV2TransferOutState(
                    'completedTransfer',
                    'spTransferUi',
                ),
            },
        )
        const spv2TransferOutCompletedUnknown = makeTestRpcTxnEntry(
            'sPV2TransferOut',
            {
                state: makeTestSPV2TransferOutState(
                    'completedTransfer',
                    'unknown',
                ),
            },
        )
        const spv2TransferOutDataNotInCache = makeTestRpcTxnEntry(
            'sPV2TransferOut',
            {
                state: makeTestSPV2TransferOutState(
                    'dataNotInCache',
                    'multispend',
                ),
            },
        )

        expect(
            makeTxnDetailTitleText(t, spv2TransferOutCompletedMultispend),
        ).toBe(t('feature.stabilitypool.you-deposited'))
        expect(
            makeTxnDetailTitleText(t, spv2TransferOutCompletedMatrixSpTransfer),
        ).toBe(t('feature.send.you-sent'))
        expect(
            makeTxnDetailTitleText(t, spv2TransferOutCompletedSpTransferUi),
        ).toBe(t('feature.send.you-sent'))
        expect(makeTxnDetailTitleText(t, spv2TransferOutDataNotInCache)).toBe(
            t('feature.send.you-sent'),
        )
        expect(makeTxnDetailTitleText(t, spv2TransferOutCompletedUnknown)).toBe(
            t('feature.send.you-sent'),
        )
    })

    it('[multispend] should determine the title based on the txn state and kind', () => {
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
