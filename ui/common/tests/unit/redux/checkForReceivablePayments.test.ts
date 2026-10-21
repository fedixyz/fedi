import {
    handleMatrixRoomTimelineStreamUpdates,
    setFederations,
    setMatrixAuth,
    setupStore,
} from '../../../redux'
import { MatrixPaymentEvent, MSats } from '../../../types'
import {
    RpcTimelineEventItemId,
    RpcTransaction,
    TransactionEvent,
} from '../../../types/bindings'
import { FedimintBridge } from '../../../utils/fedimint'
import { mockFederation1 } from '../../mock-data/federation'
import { createMockPaymentEvent } from '../../mock-data/matrix-event'
import { createMockTransaction } from '../../mock-data/transactions'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { mockInitializeCommonStore } from '../../utils/render'

describe('checkForReceivablePayments', () => {
    const federationId = mockFederation1.id
    const operationId = 'receive-operation'
    const recipient = '@recipient:example.com'
    const pushed = createMockPaymentEvent({
        id: 'pushed' as RpcTimelineEventItemId,
        sender: '@sender:example.com',
        content: {
            ecash: 'test-ecash',
            senderId: '@sender:example.com',
            recipientId: recipient,
            federationId,
        },
    })
    let store = setupStore()
    let fedimint: jest.Mocked<FedimintBridge>
    let transaction: RpcTransaction
    let transactionListeners: Set<(update: TransactionEvent) => void>
    let echoes: number
    const sendMessage = jest.fn()
    const markRoomAsUnread = jest.fn()

    const appendToTimeline = (event: MatrixPaymentEvent) =>
        store.dispatch(
            handleMatrixRoomTimelineStreamUpdates({
                roomId: pushed.roomId,
                updates: [{ Append: { values: [event] } }],
            }),
        )
    const settle = (type: 'done' | 'failed') => {
        transaction = {
            ...transaction,
            state:
                type === 'done'
                    ? { type }
                    : { type, error: 'The note is already spent' },
        } as RpcTransaction
        transactionListeners.forEach(listener =>
            listener({ federationId, transaction }),
        )
    }
    const sentStatuses = () =>
        sendMessage.mock.calls.map(([, content]) => content.status)

    beforeEach(() => {
        jest.useFakeTimers()
        jest.clearAllMocks()
        echoes = 0
        transactionListeners = new Set()
        transaction = {
            ...createMockTransaction(),
            id: operationId,
            kind: 'oobReceive',
            state: { type: 'created' },
        } as RpcTransaction
        // The homeserver echoes each status the recipient sends back into
        // the room timeline, which is what the next scan reads.
        sendMessage.mockImplementation(async (roomId, content) => {
            appendToTimeline(
                createMockPaymentEvent({
                    id: `echo-${echoes++}` as RpcTimelineEventItemId,
                    roomId,
                    sender: recipient,
                    content,
                }),
            )
        })
        store = setupStore()
        store.dispatch(setMatrixAuth({ userId: recipient, deviceId: 'device' }))
        store.dispatch(setFederations([mockFederation1]))
        fedimint = createMockFedimintBridge({
            receiveEcash: [1000 as MSats, operationId],
            getTransaction: async () => transaction,
        })
        fedimint.getMatrixClient = jest
            .fn()
            .mockReturnValue({ sendMessage, markRoomAsUnread })
        fedimint.addListener.mockImplementation((type, listener) => {
            if (type !== 'transaction') return () => {}
            const typed = listener as (update: TransactionEvent) => void
            transactionListeners.add(typed)
            return () => transactionListeners.delete(typed)
        })
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    const timeOutFirstClaim = async () => {
        mockInitializeCommonStore(store, fedimint)
        appendToTimeline(pushed)
        await jest.advanceTimersByTimeAsync(300)
        expect(sentStatuses()).toEqual(['receiving'])
        await jest.advanceTimersByTimeAsync(60000)
        // only the store's own transaction listener remains
        expect(transactionListeners.size).toBe(1)
    }

    it('should publish a receipt once when a timed-out receive settles later', async () => {
        await timeOutFirstClaim()

        settle('done')
        await jest.advanceTimersByTimeAsync(300)
        expect(sentStatuses()).toEqual(['receiving', 'received'])

        // later transaction updates rescan without publishing again
        settle('done')
        await jest.advanceTimersByTimeAsync(300)
        expect(sentStatuses()).toEqual(['receiving', 'received'])
        expect(fedimint.receiveEcash).toHaveBeenCalledTimes(1)
        expect(transactionListeners.size).toBe(1)
    })

    it('should retry a receipt whose final message failed to send', async () => {
        await timeOutFirstClaim()

        sendMessage.mockRejectedValueOnce(new Error('homeserver unavailable'))
        settle('failed')
        await jest.advanceTimersByTimeAsync(300)
        expect(sentStatuses()).toEqual(['receiving', 'failed'])

        settle('failed')
        await jest.advanceTimersByTimeAsync(300)
        expect(sentStatuses()).toEqual(['receiving', 'failed', 'failed'])
        expect(fedimint.receiveEcash).toHaveBeenCalledTimes(1)
        expect(transactionListeners.size).toBe(1)
    })
})
