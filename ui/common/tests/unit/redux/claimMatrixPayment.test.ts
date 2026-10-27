import { waitFor } from '@testing-library/react'

import { claimMatrixPayment, setMatrixAuth, setupStore } from '../../../redux'
import { MSats } from '../../../types'
import { RpcTransaction, TransactionEvent } from '../../../types/bindings'
import { createMockPaymentEvent } from '../../mock-data/matrix-event'
import { createMockTransaction } from '../../mock-data/transactions'
import { createMockFedimintBridge } from '../../utils/fedimint'

describe('claimMatrixPayment', () => {
    const federationId = 'fed123'
    const operationId = 'receive-operation'
    const event = createMockPaymentEvent({
        content: {
            ecash: 'test-ecash',
            recipientId: 'recipient',
            federationId,
        },
    })
    let store: ReturnType<typeof setupStore>
    let transaction: RpcTransaction
    let onTransaction: (update: TransactionEvent) => void
    let fedimint: ReturnType<typeof createMockFedimintBridge>
    const sendMessage = jest.fn()
    const markRoomAsUnread = jest.fn()
    const unsubscribe = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
        sendMessage.mockResolvedValue(undefined)
        store = setupStore()
        store.dispatch(
            setMatrixAuth({ userId: 'recipient', deviceId: 'device' }),
        )
        transaction = {
            ...createMockTransaction(),
            id: operationId,
            kind: 'oobReceive',
            state: { type: 'created' },
        }
        fedimint = createMockFedimintBridge({
            receiveEcash: [1000 as MSats, operationId],
            getTransaction: async () => transaction,
        })
        fedimint.getMatrixClient = jest
            .fn()
            .mockReturnValue({ sendMessage, markRoomAsUnread })
        fedimint.addListener.mockImplementation((_type, listener) => {
            onTransaction = listener as (update: TransactionEvent) => void
            return unsubscribe
        })
    })

    it('should ignore settlement from another federation or payment', async () => {
        const claim = store
            .dispatch(claimMatrixPayment({ fedimint, event }))
            .unwrap()
        await waitFor(() => expect(fedimint.getTransaction).toHaveBeenCalled())
        const done = {
            ...transaction,
            kind: 'oobReceive' as const,
            state: { type: 'done' as const },
        }
        onTransaction({ federationId: 'another-federation', transaction: done })
        onTransaction({
            federationId,
            transaction: { ...done, id: 'another-payment' },
        })
        expect(sendMessage).toHaveBeenCalledTimes(1)
        onTransaction({ federationId, transaction: done })
        await claim
        expect(sendMessage).toHaveBeenCalledTimes(2)
    })
})
