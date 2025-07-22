import { MatrixPaymentStatus, MatrixPaymentEvent } from '../../types'
import { consolidatePaymentEvents } from '../../utils/matrix'
import {
    createMockPaymentEvent,
    createMockNonPaymentEvent,
} from '../mock-data/matrix-event'

/*
// Payment Event Consolidation Tests
// Business Context: When users send payments, multiple events are created (push, accept, receive).
// The app needs to show only one message per payment while keeping it updated with the latest status.
// This ensures a clean chat experience without duplicate payment messages.
*/

// BUSINESS: App handles empty chat rooms gracefully
it('returns empty array when given empty input', () => {
    expect(consolidatePaymentEvents([])).toEqual([])
})

// BUSINESS: Regular text messages remain unchanged while payment events get special processing
it('keeps non-payment events unchanged', () => {
    const textEvent = createMockNonPaymentEvent({
        id: 'text1',
        timestamp: 1000,
    })
    const paymentEvent = createMockPaymentEvent({
        id: 'payment1',
        content: {
            paymentId: 'pay123',
            status: MatrixPaymentStatus.pushed,
            amount: 2000,
        },
    })

    const result = consolidatePaymentEvents([textEvent, paymentEvent])

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual(textEvent)
})

// BUSINESS: Users see only one message per payment (not 3 separate push/accept/receive messages)
it('shows only initial payment events (pushed/requested) for each paymentId', () => {
    const pushedEvent = createMockPaymentEvent({
        id: 'event1',
        content: {
            paymentId: 'pay123',
            status: MatrixPaymentStatus.pushed,
            amount: 1000,
        },
    })
    const acceptedEvent = createMockPaymentEvent({
        id: 'event2',
        content: {
            paymentId: 'pay123',
            status: MatrixPaymentStatus.accepted,
            amount: 2000,
        },
    })
    const receivedEvent = createMockPaymentEvent({
        id: 'event3',
        content: {
            paymentId: 'pay123',
            status: MatrixPaymentStatus.received,
            amount: 3000,
        },
    })

    const result = consolidatePaymentEvents([
        pushedEvent,
        acceptedEvent,
        receivedEvent,
    ])

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('event1') // shows the initial pushed event
})

// BUSINESS: Payment message shows current status (completed/pending) not the original status
it('merges latest status into initial event content', () => {
    const pushedEvent = createMockPaymentEvent({
        id: 'event1',
        content: {
            paymentId: 'pay123',
            status: MatrixPaymentStatus.pushed,
            amount: 1000,
            senderOperationId: 'sender-op-123',
        },
    })
    const receivedEvent = createMockPaymentEvent({
        id: 'event2',
        content: {
            paymentId: 'pay123',
            status: MatrixPaymentStatus.received,
            amount: 3000,
            senderOperationId: 'sender-op-123',
            receiverOperationId: 'receiver-op-456',
        },
    })

    const result = consolidatePaymentEvents([pushedEvent, receivedEvent])

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('event1') // original event ID

    const paymentEvent = result[0] as MatrixPaymentEvent
    expect(paymentEvent.content.status).toBe(MatrixPaymentStatus.received) // updated status
    expect(paymentEvent.content.receiverOperationId).toBe('receiver-op-456') // merged data
})

// BUSINESS: App preserves transaction history links when older clients send incomplete updates
it('preserves existing operation IDs', () => {
    const pushedEvent = createMockPaymentEvent({
        id: 'event1',
        content: {
            paymentId: 'pay123',
            status: MatrixPaymentStatus.pushed,
            amount: 1000,
            senderOperationId: 'sender-op-123',
            receiverOperationId: undefined,
        },
    })
    const updateEvent = createMockPaymentEvent({
        id: 'event2',
        content: {
            paymentId: 'pay123',
            status: MatrixPaymentStatus.accepted,
            amount: 2000,
            senderOperationId: 'sender-op-123',
            receiverOperationId: 'receiver-op-456',
        },
    })

    const result = consolidatePaymentEvents([pushedEvent, updateEvent])

    const paymentEvent = result[0] as MatrixPaymentEvent
    expect(paymentEvent.content.senderOperationId).toBe('sender-op-123')
    expect(paymentEvent.content.receiverOperationId).toBe('receiver-op-456')
})

// BUSINESS: Multiple payments in same chat are handled independently
it('handles multiple different payment IDs correctly', () => {
    const payment1Event = createMockPaymentEvent({
        id: 'event1',
        content: {
            paymentId: 'pay123',
            status: MatrixPaymentStatus.pushed,
            amount: 1000,
        },
    })
    const payment2Event = createMockPaymentEvent({
        id: 'event2',
        content: {
            paymentId: 'pay456',
            status: MatrixPaymentStatus.requested,
            amount: 2000,
        },
    })
    const payment1Update = createMockPaymentEvent({
        id: 'event3',
        content: {
            paymentId: 'pay123',
            status: MatrixPaymentStatus.received,
            amount: 3000,
        },
    })

    const result = consolidatePaymentEvents([
        payment1Event,
        payment2Event,
        payment1Update,
    ])

    expect(result).toHaveLength(2)

    const payment1Result = result.find(e => {
        return (
            e.content.msgtype === 'xyz.fedi.payment' &&
            (e.content as any).paymentId === 'pay123'
        )
    }) as MatrixPaymentEvent

    const payment2Result = result.find(e => {
        return (
            e.content.msgtype === 'xyz.fedi.payment' &&
            (e.content as any).paymentId === 'pay456'
        )
    }) as MatrixPaymentEvent

    expect(payment1Result.content.status).toBe(MatrixPaymentStatus.received)
    expect(payment2Result.content.status).toBe(MatrixPaymentStatus.requested)
})
