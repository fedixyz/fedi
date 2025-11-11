import { MSats, MultispendTransactionListEntry } from '@fedi/common/types'
import {
    RpcTransaction,
    RpcLnReceiveState,
    RpcTransactionListEntry,
} from '@fedi/common/types/bindings'

// Mock transaction factory
const MOCK_TRANSACTION: RpcTransaction = {
    id: 'tx123',
    amount: 1000000 as MSats,
    fediFeeStatus: null,
    txnNotes: 'test',
    txDateFiatInfo: null,
    frontendMetadata: {
        initialNotes: null,
        recipientMatrixId: null,
        senderMatrixId: null,
    },
    outcomeTime: Date.now(),
    kind: 'lnReceive' as const,
    ln_invoice: 'lnbc123',
    state: { type: 'claimed' } as RpcLnReceiveState,
}

// Can be added to if someone needs missing fields
const MOCK_MULTISPEND_TRANSACTION: Partial<MultispendTransactionListEntry> = {
    id: 'txn1',
    amount: 100000 as MSats,
    kind: 'multispend',
    state: 'deposit',
    time: 1677721600,
    event: {
        depositNotification: {
            user: 'user1',
            fiatAmount: 100,
            txid: 'txid1',
            description: 'description1',
        },
    },
}

export const createMockTransaction = (overrides: any = {}): RpcTransaction => {
    return {
        ...MOCK_TRANSACTION,
        ...overrides,
    }
}

export const createMockTransactionListEntry = (
    overrides: any = {},
): RpcTransactionListEntry => {
    const date = new Date()
    const createdAt = Math.floor(date.getTime() / 1000) // creates date in seconds

    return {
        createdAt,
        ...MOCK_TRANSACTION,
        ...overrides,
    }
}

export const createMockMultispendTransaction = (
    overrides: any = {},
): MultispendTransactionListEntry => {
    return {
        ...MOCK_MULTISPEND_TRANSACTION,
        ...overrides,
    }
}
