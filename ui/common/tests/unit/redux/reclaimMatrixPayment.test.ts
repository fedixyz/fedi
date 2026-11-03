import {
    handleMatrixRoomTimelineStreamUpdates,
    setFederations,
    setMatrixAuth,
    setupStore,
} from '../../../redux'
import { MatrixPaymentEvent, MatrixPaymentStatus } from '../../../types'
import {
    RpcOOBSpendState,
    RpcTimelineEventItemId,
    RpcTransaction,
} from '../../../types/bindings'
import { FedimintBridge } from '../../../utils/fedimint'
import { mockFederation1 } from '../../mock-data/federation'
import { createMockPaymentEvent } from '../../mock-data/matrix-event'
import { createMockTransaction } from '../../mock-data/transactions'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { mockInitializeCommonStore } from '../../utils/render'

// The sender's side of a chat payment the recipient will never redeem.
describe('reclaiming chat payments', () => {
    const federationId = mockFederation1.id
    const sender = '@sender:example.com'
    const recipient = '@recipient:example.com'
    const sendOperationId = 'send-operation'
    const pushed = createMockPaymentEvent({
        id: 'pushed' as RpcTimelineEventItemId,
        sender,
        content: {
            ecash: 'test-ecash',
            senderId: sender,
            recipientId: recipient,
            senderOperationId: sendOperationId,
            federationId,
        },
    })
    let store = setupStore()
    let fedimint: jest.Mocked<FedimintBridge>
    let sendState: RpcOOBSpendState
    let events: number
    let unsubscribe: () => void
    const sendMessage = jest.fn()
    const markRoomAsUnread = jest.fn()

    const statusFrom = (
        status: MatrixPaymentStatus,
        from = recipient,
    ): MatrixPaymentEvent =>
        createMockPaymentEvent({
            id: `event-${events++}` as RpcTimelineEventItemId,
            sender: from,
            content: { ...pushed.content, status },
        })
    const scan = async (...timeline: MatrixPaymentEvent[]) => {
        store.dispatch(
            handleMatrixRoomTimelineStreamUpdates({
                roomId: pushed.roomId,
                updates: [{ Append: { values: timeline } }],
            }),
        )
        await jest.advanceTimersByTimeAsync(300)
    }
    const sentStatuses = () =>
        sendMessage.mock.calls.map(([, content]) => content.status)

    beforeEach(() => {
        jest.useFakeTimers()
        jest.clearAllMocks()
        events = 0
        sendState = { type: 'created' }
        sendMessage.mockResolvedValue(undefined)
        store = setupStore()
        store.dispatch(setMatrixAuth({ userId: sender, deviceId: 'device' }))
        store.dispatch(setFederations([mockFederation1]))
        fedimint = createMockFedimintBridge({
            getTransaction: async () =>
                ({
                    ...createMockTransaction(),
                    id: sendOperationId,
                    kind: 'oobSend',
                    state: sendState,
                }) as RpcTransaction,
            parseEcash: {
                federation_type: 'joined',
                federation_id: federationId,
            },
            cancelEcash: async () => {
                sendState = { type: 'userCanceledSuccess' }
            },
        })
        fedimint.getMatrixClient = jest
            .fn()
            .mockReturnValue({ sendMessage, markRoomAsUnread })
        unsubscribe = mockInitializeCommonStore(store, fedimint)
    })

    afterEach(() => {
        unsubscribe()
        jest.useRealTimers()
    })

    it('returns the notes of a failed redemption and cancels the payment', async () => {
        await scan(pushed, statusFrom('receiving'), statusFrom('failed'))

        expect(fedimint.cancelEcash).toHaveBeenCalledTimes(1)
        expect(fedimint.cancelEcash).toHaveBeenCalledWith(
            'test-ecash',
            federationId,
        )
        expect(sendMessage).toHaveBeenCalledTimes(1)
        expect(sendMessage).toHaveBeenCalledWith(
            pushed.roomId,
            expect.objectContaining({
                paymentId: pushed.content.paymentId,
                status: 'canceled',
            }),
        )
    })

    it('ignores a failure posted by anyone but the recipient', async () => {
        await scan(pushed, statusFrom('failed', '@mallory:example.com'))

        expect(fedimint.cancelEcash).not.toHaveBeenCalled()
        expect(sendMessage).not.toHaveBeenCalled()
    })

    it('keeps a payment the recipient redeemed after a failure', async () => {
        await scan(pushed, statusFrom('failed'), statusFrom('received'))

        expect(fedimint.cancelEcash).not.toHaveBeenCalled()
        expect(sendMessage).not.toHaveBeenCalled()
    })

    it('keeps the failure when the notes were redeemed first', async () => {
        fedimint.cancelEcash.mockImplementation(async () => {
            sendState = { type: 'userCanceledFailure' }
            throw new Error('EcashCancelFailed')
        })
        await scan(pushed, statusFrom('failed'))
        expect(fedimint.cancelEcash).toHaveBeenCalledTimes(1)
        expect(sendMessage).not.toHaveBeenCalled()

        // the failed cancel frees the payment for the next scan, which reads
        // the outcome instead of cancelling again
        await scan(statusFrom('failed'))
        expect(fedimint.cancelEcash).toHaveBeenCalledTimes(1)
        expect(sendMessage).not.toHaveBeenCalled()
    })

    it('announces a reclaim that finished before a restart', async () => {
        sendState = { type: 'userCanceledSuccess' }
        await scan(pushed, statusFrom('failed'))

        expect(fedimint.cancelEcash).not.toHaveBeenCalled()
        expect(sentStatuses()).toEqual(['canceled'])
    })

    it('waits for a reclaim that is still in progress', async () => {
        sendState = { type: 'userCanceledProcessing' }
        await scan(pushed, statusFrom('failed'))

        expect(fedimint.cancelEcash).not.toHaveBeenCalled()
        expect(sendMessage).not.toHaveBeenCalled()
    })

    it('reclaims a rejected payment without a message', async () => {
        await scan(pushed, statusFrom('rejected'))

        expect(fedimint.cancelEcash).toHaveBeenCalledTimes(1)
        expect(sendMessage).not.toHaveBeenCalled()
    })

    it('does not cancel a reclaimed rejected payment again', async () => {
        sendState = { type: 'userCanceledSuccess' }
        await scan(pushed, statusFrom('rejected'))

        expect(fedimint.cancelEcash).not.toHaveBeenCalled()
        expect(sendMessage).not.toHaveBeenCalled()
    })
})
