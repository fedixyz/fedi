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

    it('should wait for settlement before acknowledging receipt', async () => {
        const claim = store
            .dispatch(claimMatrixPayment({ fedimint, event }))
            .unwrap()
        await waitFor(() => expect(fedimint.getTransaction).toHaveBeenCalled())
        expect(sendMessage).toHaveBeenCalledTimes(1)
        expect(sendMessage).toHaveBeenLastCalledWith(
            event.roomId,
            expect.objectContaining({
                status: 'receiving',
                receiverOperationId: operationId,
            }),
        )

        onTransaction({
            federationId,
            transaction: {
                ...transaction,
                kind: 'oobReceive',
                state: { type: 'done' },
            },
        })
        await claim
        expect(sendMessage).toHaveBeenLastCalledWith(
            event.roomId,
            expect.objectContaining({ status: 'received' }),
        )
        expect(unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('should report rejection without a success receipt', async () => {
        const claim = store
            .dispatch(claimMatrixPayment({ fedimint, event }))
            .unwrap()
        await waitFor(() => expect(fedimint.getTransaction).toHaveBeenCalled())
        onTransaction({
            federationId,
            transaction: {
                ...transaction,
                kind: 'oobReceive',
                state: { type: 'failed', error: 'The note is already spent' },
            },
        })
        await claim
        expect(
            sendMessage.mock.calls.map(([, content]) => content.status),
        ).toEqual(['receiving', 'failed'])
        expect(unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('should read settlement that happened before subscription', async () => {
        transaction = {
            ...transaction,
            kind: 'oobReceive',
            state: { type: 'done' },
        }
        await store.dispatch(claimMatrixPayment({ fedimint, event })).unwrap()
        expect(sendMessage).toHaveBeenLastCalledWith(
            event.roomId,
            expect.objectContaining({ status: 'received' }),
        )
        expect(unsubscribe).toHaveBeenCalledTimes(1)
    })

    it.each(['pushed', 'receiving', 'received'] as const)(
        'should redeem incoming %s notes instead of trusting a supplied receive operation',
        async status => {
            transaction = {
                ...transaction,
                kind: 'oobReceive',
                state: { type: 'failed', error: 'already spent' },
            }
            await store
                .dispatch(
                    claimMatrixPayment({
                        fedimint,
                        event: createMockPaymentEvent({
                            ...event,
                            sender: 'sender',
                            content: {
                                ...event.content,
                                status,
                                receiverOperationId: 'unrelated-operation',
                            },
                        }),
                    }),
                )
                .unwrap()
            expect(fedimint.receiveEcash).toHaveBeenCalledTimes(1)
            expect(fedimint.getTransaction).toHaveBeenCalledWith(
                federationId,
                operationId,
            )
            expect(
                sendMessage.mock.calls.map(([, content]) => content.status),
            ).toEqual(['receiving', 'failed'])
        },
    )

    it('should resume a pending receipt without redeeming again', async () => {
        transaction = {
            ...transaction,
            kind: 'oobReceive',
            state: { type: 'failed', error: 'already spent' },
        }
        await store
            .dispatch(
                claimMatrixPayment({
                    fedimint,
                    event: createMockPaymentEvent({
                        ...event,
                        sender: 'recipient',
                        content: {
                            ...event.content,
                            status: 'receiving',
                            receiverOperationId: operationId,
                        },
                    }),
                }),
            )
            .unwrap()
        expect(fedimint.receiveEcash).not.toHaveBeenCalled()
        expect(sendMessage).toHaveBeenCalledTimes(1)
        expect(sendMessage).toHaveBeenLastCalledWith(
            event.roomId,
            expect.objectContaining({ status: 'failed' }),
        )
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

    it('should correct a premature receipt from an older client', async () => {
        transaction = {
            ...transaction,
            kind: 'oobReceive',
            state: { type: 'failed', error: 'already spent' },
        }
        await store
            .dispatch(
                claimMatrixPayment({
                    fedimint,
                    event: createMockPaymentEvent({
                        ...event,
                        sender: 'recipient',
                        content: {
                            ...event.content,
                            status: 'received',
                            receiverOperationId: operationId,
                        },
                    }),
                }),
            )
            .unwrap()
        expect(fedimint.receiveEcash).not.toHaveBeenCalled()
        expect(sendMessage).toHaveBeenCalledTimes(1)
        expect(sendMessage).toHaveBeenLastCalledWith(
            event.roomId,
            expect.objectContaining({ status: 'failed' }),
        )
    })

    it('should leave a confirmed receipt unchanged', async () => {
        transaction = {
            ...transaction,
            kind: 'oobReceive',
            state: { type: 'done' },
        }
        await store
            .dispatch(
                claimMatrixPayment({
                    fedimint,
                    event: createMockPaymentEvent({
                        ...event,
                        sender: 'recipient',
                        content: {
                            ...event.content,
                            status: 'received',
                            receiverOperationId: operationId,
                        },
                    }),
                }),
            )
            .unwrap()
        expect(fedimint.receiveEcash).not.toHaveBeenCalled()
        expect(sendMessage).not.toHaveBeenCalled()
    })

    it('should leave an unknown outcome pending and release its listener', async () => {
        jest.useFakeTimers()
        try {
            const claim = store
                .dispatch(claimMatrixPayment({ fedimint, event }))
                .unwrap()
            const rejection = expect(claim).rejects.toMatchObject({
                message: 'Payment is still receiving',
            })
            await jest.advanceTimersByTimeAsync(60000)
            await rejection
            expect(
                sendMessage.mock.calls.map(([, content]) => content.status),
            ).toEqual(['receiving'])
            expect(unsubscribe).toHaveBeenCalledTimes(1)
        } finally {
            jest.useRealTimers()
        }
    })
})
