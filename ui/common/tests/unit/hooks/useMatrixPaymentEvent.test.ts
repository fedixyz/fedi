import { waitFor } from '@testing-library/react'

import { useMatrixPaymentEvent } from '../../../hooks/matrix'
import { setMatrixAuth, setupStore } from '../../../redux'
import { createMockPaymentEvent } from '../../mock-data/matrix-event'
import { createMockTransaction } from '../../mock-data/transactions'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { renderHookWithState } from '../../utils/render'
import { createMockT } from '../../utils/setup'

describe('chat payment outcomes', () => {
    it('should open transaction history without starting another payment', () => {
        const store = setupStore()
        store.dispatch(setMatrixAuth({ userId: 'sender', deviceId: 'device' }))
        const onViewTransaction = jest.fn()
        const event = createMockPaymentEvent({
            content: {
                status: 'failed',
                senderId: 'sender',
                senderOperationId: undefined,
            },
        })
        const { result } = renderHookWithState(
            () =>
                useMatrixPaymentEvent({
                    event,
                    t: createMockT(),
                    onError: jest.fn(),
                    onViewTransaction,
                }),
            store,
        )
        expect(result.current.buttons).toHaveLength(1)
        expect(result.current.buttons[0].label).toBe(
            'feature.chat.payment-view-history',
        )
        result.current.buttons[0].handler()
        expect(onViewTransaction).toHaveBeenCalledTimes(1)
    })

    it.each(['sender', 'recipient', 'observer'] as const)(
        'should show the failure to the %s without payment actions',
        async role => {
            const store = setupStore()
            store.dispatch(setMatrixAuth({ userId: role, deviceId: 'device' }))
            const event = createMockPaymentEvent({
                content: {
                    status: 'failed',
                    senderId: 'sender',
                    recipientId: 'recipient',
                    senderOperationId: undefined,
                },
            })
            const { result } = renderHookWithState(
                () =>
                    useMatrixPaymentEvent({
                        event,
                        t: createMockT(),
                        onError: jest.fn(),
                    }),
                store,
            )
            expect(result.current.statusText).toBe('words.failed')
            expect(result.current.statusIcon).toBe('error')
            expect(result.current.statusHelp).toBe(
                role === 'observer'
                    ? undefined
                    : `feature.chat.payment-failed-${role}`,
            )
            expect(result.current.buttons).toEqual([])
        },
    )

    it.each(['created', 'done', 'failed'] as const)(
        'should reconcile an older receipt with a %s transaction',
        async state => {
            const store = setupStore()
            store.dispatch(
                setMatrixAuth({ userId: 'recipient', deviceId: 'device' }),
            )
            const event = createMockPaymentEvent({
                content: {
                    status: 'received',
                    recipientId: 'recipient',
                    receiverOperationId: 'receive-op',
                },
            })
            const transaction = createMockTransaction({
                id: 'receive-op',
                kind: 'oobReceive',
                state: { type: state, error: 'already spent' },
            })
            const bridge = createMockFedimintBridge({
                getTransaction: transaction,
            })
            const { result } = renderHookWithState(
                () =>
                    useMatrixPaymentEvent({
                        event,
                        t: createMockT(),
                        onError: jest.fn(),
                    }),
                store,
                bridge,
            )
            expect(result.current.statusText).toBe('words.received')
            await waitFor(() =>
                expect(result.current.transaction).toEqual(transaction),
            )
            expect(result.current.statusText).toBe(
                state === 'done'
                    ? 'words.received'
                    : state === 'failed'
                      ? 'words.failed'
                      : 'words.receiving',
            )
            expect(result.current.statusIcon).toBe(
                state === 'done'
                    ? 'check'
                    : state === 'failed'
                      ? 'error'
                      : 'loading',
            )
            expect(result.current.buttons).toEqual([])
        },
    )

    it('should keep a recorded receipt when the wallet cannot read it', async () => {
        const store = setupStore()
        store.dispatch(
            setMatrixAuth({ userId: 'recipient', deviceId: 'device' }),
        )
        const event = createMockPaymentEvent({
            content: {
                status: 'received',
                recipientId: 'recipient',
                receiverOperationId: 'receive-op',
            },
        })
        const getTransaction = jest.fn(async () => {
            throw new Error('Federation is still loading')
        })
        const bridge = createMockFedimintBridge({ getTransaction })
        const { result } = renderHookWithState(
            () =>
                useMatrixPaymentEvent({
                    event,
                    t: createMockT(),
                    onError: jest.fn(),
                }),
            store,
            bridge,
        )
        await waitFor(() => {
            expect(getTransaction).toHaveBeenCalled()
            expect(result.current.isLoadingTransaction).toBe(false)
        })
        expect(result.current.transaction).toBeNull()
        expect(result.current.statusText).toBe('words.received')
        expect(result.current.statusIcon).toBe('check')
    })
})
