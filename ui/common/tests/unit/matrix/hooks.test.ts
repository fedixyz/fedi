import { act, waitFor } from '@testing-library/react'
import { Subject } from 'rxjs'

import { MatrixPaymentEvent } from '@fedi/common/types'

import { RpcTimelineEventItemId } from '../../../types/bindings'
import { createMockPaymentEvent } from '../../mock-data/matrix-event'

// CONSIDER: should we have test suites for test-only "factory" functions?
/*
// Payment Event Display Tests
// Business Context: Payment messages in chat need to show the right information at
// the right time - current status, available actions (cancel/accept/view), and
// properly formatted amounts. The UI must be intuitive so users immediately understand
// what they can do with each payment message.
*/
describe('createMockPaymentEvent - Button State and Status Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    // BUSINESS: The app's payment event factory must create consistent, valid payment
    // structures for testing and development. This ensures all payment events have the
    // required fields and follow the expected format for reliable testing.
    it('creates valid payment event structures', () => {
        const event = createMockPaymentEvent({
            content: {
                paymentId: 'payment123',
                amount: 1000,
                status: 'received',
                bolt11: 'lnbc123...',
            },
        })

        expect(event.content.status).toBe('received')
        expect(event.content.bolt11).toBe('lnbc123...')
        expect(event.content.amount).toBe(1000)
        expect(event.content.paymentId).toBe('payment123')
    })
})

// TODO: remove AI slop after incorporating any useful logic from this test into test-only factory functions
// depending on above considerations
/*
// Real-time Payment Event Stream Tests
// Business Context: Bitcoin payments go through multiple stages (initiated → confirmed → completed).
// Users expect to see these status updates in real-time within their chat conversations,
// similar to how message delivery confirmations work in messaging apps. The system must
// handle concurrent payments without mixing up status updates between different transactions.
*/
describe('Real-time Payment Event Updates', () => {
    beforeEach(() => {
        jest.clearAllTimers()
        jest.useFakeTimers()
    })

    afterEach(() => {
        jest.runOnlyPendingTimers()
        jest.useRealTimers()
    })

    it('processes payment status updates from event stream', async () => {
        const eventSubject = new Subject<MatrixPaymentEvent>()

        // Mock the event subscription
        const mockEventStream = {
            subscribe: jest.fn(callback => {
                eventSubject.subscribe(callback)
                return { unsubscribe: jest.fn() }
            }),
        }

        // Simulate payment lifecycle events
        const paymentId = 'realtime-payment-123'
        const events = [
            createMockPaymentEvent({
                id: 'event1' as RpcTimelineEventItemId,
                content: {
                    paymentId,
                    status: 'pushed',
                },
                timestamp: 1000,
            }),
            createMockPaymentEvent({
                id: 'event2' as RpcTimelineEventItemId,
                content: {
                    paymentId,
                    status: 'accepted',
                },
                timestamp: 2000,
            }),
            createMockPaymentEvent({
                id: 'event3' as RpcTimelineEventItemId,
                content: {
                    paymentId,
                    status: 'received',
                },
                timestamp: 3000,
            }),
        ]

        const receivedEvents: MatrixPaymentEvent[] = []

        // Subscribe to the event stream
        mockEventStream.subscribe((event: MatrixPaymentEvent) => {
            receivedEvents.push(event)
        })

        // Emit events in sequence
        act(() => {
            events.forEach((event, index) => {
                setTimeout(() => eventSubject.next(event), index * 10)
            })
        })

        // Wait for all events to be processed
        await waitFor(
            () => {
                expect(receivedEvents).toHaveLength(3)
            },
            { timeout: 1000 },
        )

        // Verify all events were received in order
        expect(receivedEvents[0].content.status).toBe('pushed')
        expect(receivedEvents[1].content.status).toBe('accepted')
        expect(receivedEvents[2].content.status).toBe('received')
    })

    // BUSINESS: Users often have multiple payments happening simultaneously - they might
    // send money to one friend while receiving payment from another, or make several
    // purchases in quick succession. The app must track each payment independently without
    // mixing up status updates, ensuring each payment shows correct progress in the UI.
    it('handles concurrent payment events without interference', async () => {
        const eventSubject = new Subject<MatrixPaymentEvent>()

        // Create events for two different payments happening simultaneously
        const payment1Events = [
            createMockPaymentEvent({
                id: 'p1-event1' as RpcTimelineEventItemId,
                content: {
                    paymentId: 'payment-1',
                    status: 'pushed',
                },
                timestamp: 1000,
            }),
            createMockPaymentEvent({
                id: 'p1-event2' as RpcTimelineEventItemId,
                content: {
                    paymentId: 'payment-1',
                    status: 'received',
                },
                timestamp: 3000,
            }),
        ]

        const payment2Events = [
            createMockPaymentEvent({
                id: 'p2-event1' as RpcTimelineEventItemId,
                content: {
                    paymentId: 'payment-2',
                    status: 'requested',
                },
                timestamp: 1500,
            }),
            createMockPaymentEvent({
                id: 'p2-event2' as RpcTimelineEventItemId,
                content: {
                    paymentId: 'payment-2',
                    status: 'accepted',
                },
                timestamp: 2500,
            }),
        ]

        const allEvents = [...payment1Events, ...payment2Events]
        const receivedEvents: MatrixPaymentEvent[] = []

        eventSubject.subscribe((event: MatrixPaymentEvent) => {
            receivedEvents.push(event)
        })

        // Emit all events rapidly (simulating concurrent updates)
        act(() => {
            allEvents.forEach((event, index) => {
                setTimeout(() => eventSubject.next(event), index * 5)
            })
        })

        await waitFor(() => {
            expect(receivedEvents).toHaveLength(4)
        })

        // Verify both payments were tracked independently
        const payment1Updates = receivedEvents.filter(
            e => e.content.paymentId === 'payment-1',
        )
        const payment2Updates = receivedEvents.filter(
            e => e.content.paymentId === 'payment-2',
        )

        expect(payment1Updates).toHaveLength(2)
        expect(payment2Updates).toHaveLength(2)

        expect(payment1Updates[1].content.status).toBe('received')
        expect(payment2Updates[1].content.status).toBe('accepted')
    })
})
