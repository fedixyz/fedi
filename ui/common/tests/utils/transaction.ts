import {
    CommonTxnFields,
    MSats,
    MultispendTransactionListEntry,
} from '../../types'
import {
    GroupInvitationWithKeys,
    MultispendDepositEventData,
    MultispendListedEvent,
    RpcLnPayState,
    RpcLnReceiveState,
    RpcOnchainDepositState,
    RpcOnchainWithdrawState,
    RpcOOBReissueState,
    RpcOOBSpendState,
    RpcOperationFediFeeStatus,
    RpcSPDepositState,
    RpcSPV2DepositState,
    RpcSPV2TransferInState,
    RpcSPV2TransferOutState,
    RpcSPV2WithdrawalState,
    RpcSPWithdrawState,
    RpcTransactionListEntry,
    SpV2TransferInKind,
    SpV2TransferOutKind,
    WithdrawRequestWithApprovals,
    WithdrawTxSubmissionStatus,
} from '../../types/bindings'

/**
 * Transaction Test Utils
 *
 * This file contains a bunch of constants and functions that help with
 * creating and Transactions.
 */

/*** Constants ***/
/* commonly-used within the `makeTestTxnEntry` function */

export const TEST_LN_INVOICE = 'lnbc21000000'
export const TEST_PREIMAGE = 'test-preimage'
export const TEST_TXID = 'test-txid'
export const TEST_ONCHAIN_ADDRESS = 'bc1234567890'
export const TEST_REASON = 'test-reason'
export const TEST_ERROR = 'test-error'
export const TEST_SPV2_ACCOUNT_ID = 'test-spv2-account-id'
export const TEST_NPUB = '@npub123'

/**
 * Creates an RpcTransactionListEntry of kind `T`.
 * Allows you to override any field via the `overrides` parameter.
 */
export function makeTestRpcTxnEntry<T extends RpcTransactionListEntry['kind']>(
    kind: T,
    overrides: Partial<Extract<RpcTransactionListEntry, { kind: T }>> = {},
): RpcTransactionListEntry {
    const baseFields: CommonTxnFields = {
        createdAt: 0,
        id: TEST_TXID,
        amount: 0 as MSats,
        fediFeeStatus: null,
        txnNotes: null,
        txDateFiatInfo: null,
        frontendMetadata: {
            initialNotes: null,
            recipientMatrixId: null,
            senderMatrixId: null,
        },
        outcomeTime: null,
    }

    switch (kind) {
        case 'lnPay':
            return {
                kind,
                ln_invoice: TEST_LN_INVOICE,
                lightning_fees: 0 as MSats,
                state: makeTestLnPayState('created'),
                ...baseFields,
                ...overrides,
            }
        case 'lnReceive':
            return {
                kind,
                ln_invoice: TEST_LN_INVOICE,
                state: makeTestLnReceiveState('created'),
                ...baseFields,
                ...overrides,
            }
        case 'lnRecurringdReceive':
            return {
                kind,
                state: makeTestLnReceiveState('created'),
                ...baseFields,
                ...overrides,
            }
        case 'onchainWithdraw':
            return {
                kind,
                onchain_address: TEST_ONCHAIN_ADDRESS,
                onchain_fees: 0 as MSats,
                onchain_fee_rate: 0,
                state: makeTestOnchainWithdrawState('created'),
                ...baseFields,
                ...overrides,
            }
        case 'onchainDeposit':
            return {
                kind,
                onchain_address: TEST_ONCHAIN_ADDRESS,
                state: makeTestOnchainDepositState('waitingForTransaction'),
                ...baseFields,
                ...overrides,
            }
        case 'oobSend':
            return {
                kind,
                state: makeTestOOBSpendState('created'),
                ...baseFields,
                ...overrides,
            }
        case 'oobReceive':
            return {
                kind,
                state: makeTestOOBReissueState('created'),
                ...baseFields,
                ...overrides,
            }
        case 'spDeposit':
            return {
                kind,
                state: makeTestSPDepositState('pendingDeposit'),
                ...baseFields,
                ...overrides,
            }
        case 'spWithdraw':
            return {
                kind,
                state: makeTestSPWithdrawalState('pendingWithdrawal'),
                ...baseFields,
                ...overrides,
            }
        case 'sPV2Deposit':
            return {
                kind,
                state: makeTestSPV2DepositState('pendingDeposit'),
                ...baseFields,
                ...overrides,
            }
        case 'sPV2Withdrawal':
            return {
                kind,
                state: makeTestSPV2WithdrawalState('pendingWithdrawal'),
                ...baseFields,
                ...overrides,
            }
        case 'sPV2TransferOut':
            return {
                kind,
                state: makeTestSPV2TransferOutState(
                    'completedTransfer',
                    'spTransferUi',
                ),
                ...baseFields,
                ...overrides,
            }
        case 'sPV2TransferIn':
            return {
                kind,
                state: makeTestSPV2TransferInState(
                    'completedTransfer',
                    'multispend',
                ),
                ...baseFields,
                ...overrides,
            }
    }
}

export function makeTestMultispendTxnEntry<
    T extends MultispendTransactionListEntry['state'],
>(
    state: T,
    overrides: Partial<
        Extract<MultispendTransactionListEntry, { state: T }>
    > = {},
): MultispendTransactionListEntry {
    const baseFields: CommonTxnFields & {
        kind: 'multispend'
        counter: MultispendListedEvent['counter']
        time: MultispendListedEvent['time']
    } = {
        kind: 'multispend',
        counter: 0,
        time: 0,
        createdAt: 0,
        id: TEST_TXID,
        amount: 0 as MSats,
        fediFeeStatus: null,
        txnNotes: null,
        txDateFiatInfo: null,
        frontendMetadata: {
            initialNotes: null,
            recipientMatrixId: null,
            senderMatrixId: null,
        },
        outcomeTime: null,
    }

    switch (state) {
        case 'deposit':
            return {
                ...baseFields,
                state,
                event: { depositNotification: makeTestDepositEventData() },
                ...overrides,
            }
        case 'withdrawal':
            return {
                ...baseFields,
                state,
                event: {
                    withdrawalRequest:
                        makeTestMultispendWithdrawRequest('accepted'),
                },
                ...overrides,
            }
        case 'groupInvitation':
            return {
                ...baseFields,
                state,
                event: { groupInvitation: makeTestGroupInvitationWithKeys() },
                ...overrides,
            }
        case 'invalid':
            return {
                ...baseFields,
                state,
                ...overrides,
            }
    }
}

/*** Type util functions ***/
/**
 * Used to create test transaction states
 * Useful for creating transactions with different states
 */

export function makeTestLnPayState(type: RpcLnPayState['type']): RpcLnPayState {
    switch (type) {
        case 'funded':
            return { type, block_height: 11 }
        case 'waitingForRefund':
            return { type, error_reason: TEST_REASON }
        case 'refunded':
            return { type, gateway_error: TEST_ERROR }
        case 'success':
            return { type, preimage: TEST_PREIMAGE }
        default:
            return { type }
    }
}

export function makeTestLnReceiveState(
    type: RpcLnReceiveState['type'],
): RpcLnReceiveState {
    switch (type) {
        case 'waitingForPayment':
            return {
                type,
                invoice: TEST_LN_INVOICE,
                timeout: '86400',
            }
        case 'canceled':
            return { type, reason: TEST_REASON }
        default:
            return { type }
    }
}

export function makeTestOnchainWithdrawState(
    type: RpcOnchainWithdrawState['type'],
): RpcOnchainWithdrawState {
    switch (type) {
        case 'created':
            return { type }
        case 'succeeded':
            return { type, txid: TEST_TXID }
        case 'failed':
            return { type, error: TEST_ERROR }
    }
}

export function makeTestOnchainDepositState(
    type: RpcOnchainDepositState['type'],
): RpcOnchainDepositState {
    switch (type) {
        case 'waitingForConfirmation':
        case 'confirmed':
        case 'claimed':
            return { type, txid: TEST_TXID }
        default:
            return { type }
    }
}

export function makeTestOOBSpendState(
    type: RpcOOBSpendState['type'],
): RpcOOBSpendState {
    return { type }
}

export function makeTestOOBReissueState(
    type: RpcOOBReissueState['type'],
): RpcOOBReissueState {
    switch (type) {
        case 'failed':
            return { type, error: TEST_ERROR }
        default:
            return { type }
    }
}

export function makeTestSPDepositState<T extends RpcSPDepositState['type']>(
    type: T,
    overrides: Partial<Extract<RpcSPDepositState, { type: T }>> = {},
): RpcSPDepositState {
    switch (type) {
        case 'completeDeposit':
            return {
                type,
                initial_amount_cents: 0,
                fees_paid_so_far: 0 as MSats,
                ...overrides,
            }
        default:
            return { type, ...overrides }
    }
}

export function makeTestSPWithdrawalState(
    type: RpcSPWithdrawState['type'],
): RpcSPWithdrawState {
    return { type, estimated_withdrawal_cents: 0 }
}

export function makeTestSPV2DepositState<T extends RpcSPV2DepositState['type']>(
    type: T,
    overrides: Partial<Extract<RpcSPV2DepositState, { type: T }>> = {},
): RpcSPV2DepositState {
    switch (type) {
        case 'pendingDeposit':
            return { type, amount: 0 as MSats, fiat_amount: 0, ...overrides }
        case 'completedDeposit':
            return {
                type,
                amount: 0 as MSats,
                fiat_amount: 0,
                fees_paid_so_far: 0 as MSats,
                ...overrides,
            }
        case 'failedDeposit':
            return { type, error: TEST_ERROR, ...overrides }
        case 'dataNotInCache':
            return { type, ...overrides }
    }
}

export function makeTestSPV2WithdrawalState(
    type: RpcSPV2WithdrawalState['type'],
): RpcSPV2WithdrawalState {
    switch (type) {
        case 'pendingWithdrawal':
        case 'completedWithdrawal':
            return { type, amount: 0 as MSats, fiat_amount: 0 }
        case 'failedWithdrawal':
            return { type, error: TEST_ERROR }
        case 'dataNotInCache':
            return { type }
    }
}

export function makeTestSPV2TransferOutState(
    type: RpcSPV2TransferOutState['type'],
    kind: SpV2TransferOutKind,
): RpcSPV2TransferOutState {
    switch (type) {
        case 'completedTransfer':
            return {
                type,
                to_account_id: TEST_SPV2_ACCOUNT_ID,
                amount: 0 as MSats,
                fiat_amount: 0,
                kind,
            }
        case 'dataNotInCache':
            return { type }
    }
}

export function makeTestSPV2TransferInState(
    type: RpcSPV2TransferInState['type'],
    kind: SpV2TransferInKind,
): RpcSPV2TransferInState {
    switch (type) {
        case 'completedTransfer':
            return {
                type,
                from_account_id: TEST_SPV2_ACCOUNT_ID,
                amount: 0 as MSats,
                fiat_amount: 0,
                kind,
            }
        case 'dataNotInCache':
            return { type }
    }
}

export function makeTestDepositEventData(): MultispendDepositEventData {
    return {
        user: TEST_NPUB,
        fiatAmount: 0,
        txid: TEST_TXID,
        description: '',
    }
}

export function makeTestMultispendWithdrawRequest(
    status: 'accepted' | 'rejected' | 'unknown',
): WithdrawRequestWithApprovals {
    let txSubmissionStatus: WithdrawTxSubmissionStatus = 'unknown'

    switch (status) {
        case 'accepted':
            txSubmissionStatus = { accepted: { txid: TEST_TXID } }
            break
        case 'rejected':
            txSubmissionStatus = { rejected: { error: TEST_ERROR } }
            break
        case 'unknown':
            txSubmissionStatus = 'unknown'
            break
    }

    return {
        request: { transfer_amount: 0 as MSats },
        description: '',
        signatures: {},
        rejections: [],
        txSubmissionStatus,
        sender: TEST_NPUB,
    }
}

export function makeTestGroupInvitationWithKeys(): GroupInvitationWithKeys {
    return {
        invitation: {
            signers: [],
            threshold: 0,
            federationInviteCode: 'fed1test123',
            federationName: '',
        },
        proposer: TEST_NPUB,
        pubkeys: {},
        rejections: [],
        federationId: '1',
    }
}

export function makeTestFediFeeStatus(
    type: RpcOperationFediFeeStatus['type'],
    fee: number = 0,
): RpcOperationFediFeeStatus {
    const fedi_fee = fee as MSats
    switch (type) {
        case 'pendingSend':
            return { type, fedi_fee }
        case 'pendingReceive':
            return { type, fedi_fee_ppm: 0 }
        case 'success':
            return { type, fedi_fee }
        case 'failedSend':
            return { type, fedi_fee }
        case 'failedReceive':
            return { type, fedi_fee_ppm: 0 }
    }
}
