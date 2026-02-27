import { filterTimelineSearchResults } from '@fedi/common/hooks/matrix'

import { createMockNonPaymentEvent } from '../../mock-data/matrix-event'

describe('filterTimelineSearchResults', () => {
    // "Sophia" contains "hi" in the middle: s-o-p-H-I-a
    const sophiaSenderId = '@sophia:example.com'
    // "Hiroshi" starts with "Hi"
    const hiroshiSenderId = '@hiroshi:example.com'
    const otherSenderId = '@dave:example.com'
    // "Phil" contains "hi" in the middle: p-H-I-l
    const philSenderId = '@phil:example.com'

    const memberLookup: Record<string, string> = {
        [sophiaSenderId]: 'Sophia',
        [hiroshiSenderId]: 'Hiroshi',
        [otherSenderId]: 'Dave',
        [philSenderId]: 'Phil',
    }

    // Message from Sophia that does NOT contain "hi" in body
    const sophiaUnrelatedMsg = createMockNonPaymentEvent({
        sender: sophiaSenderId,
        content: { body: 'Good morning everyone' },
    })

    // Message from Phil that does NOT contain "hi" in body
    const philUnrelatedMsg = createMockNonPaymentEvent({
        id: '$msg2' as any,
        sender: philSenderId,
        content: { body: 'Good morning everyone' },
    })

    // Message from Hiroshi (name starts with "hi") without "hi" in body
    const hiroshiUnrelatedMsg = createMockNonPaymentEvent({
        id: '$msg3' as any,
        sender: hiroshiSenderId,
        content: { body: 'Good morning everyone' },
    })

    // Message from Dave that contains "hi" in body
    const daveMatchingMsg = createMockNonPaymentEvent({
        id: '$msg4' as any,
        sender: otherSenderId,
        content: { body: 'hi everyone' },
    })

    // Message from Dave without "hi" in body
    const daveUnrelatedMsg = createMockNonPaymentEvent({
        id: '$msg5' as any,
        sender: otherSenderId,
        content: { body: 'Good morning' },
    })

    const allEvents = [
        sophiaUnrelatedMsg,
        philUnrelatedMsg,
        hiroshiUnrelatedMsg,
        daveMatchingMsg,
        daveUnrelatedMsg,
    ]

    it('should NOT return messages from sender with query in middle of name', () => {
        const results = filterTimelineSearchResults(
            allEvents,
            'hi',
            memberLookup,
        )

        // "Sophia" contains "hi" mid-name — should not match
        expect(results).not.toContainEqual(sophiaUnrelatedMsg)
        // "Phil" contains "hi" mid-name — should not match
        expect(results).not.toContainEqual(philUnrelatedMsg)
    })

    it('should return messages that contain the query in body', () => {
        const results = filterTimelineSearchResults(
            allEvents,
            'hi',
            memberLookup,
        )

        expect(results).toContainEqual(daveMatchingMsg)
    })

    it('should return messages from sender whose name starts with the query', () => {
        const results = filterTimelineSearchResults(
            allEvents,
            'hi',
            memberLookup,
        )

        // Hiroshi's name starts with "Hi" — valid prefix match
        expect(results).toContainEqual(hiroshiUnrelatedMsg)
    })

    it('should NOT return messages with no body or sender match', () => {
        const results = filterTimelineSearchResults(
            allEvents,
            'hi',
            memberLookup,
        )

        expect(results).not.toContainEqual(daveUnrelatedMsg)
    })

    it('should match sender name prefix', () => {
        const results = filterTimelineSearchResults(
            allEvents,
            'sop',
            memberLookup,
        )

        expect(results).toContainEqual(sophiaUnrelatedMsg)
    })

    it('should return empty for empty query', () => {
        const results = filterTimelineSearchResults(allEvents, '', memberLookup)
        expect(results).toHaveLength(0)
    })

    it('sender name match returns all messages from that sender', () => {
        const hiroshiMsg1 = createMockNonPaymentEvent({
            id: '$h1' as any,
            sender: hiroshiSenderId,
            content: { body: 'First message' },
        })
        const hiroshiMsg2 = createMockNonPaymentEvent({
            id: '$h2' as any,
            sender: hiroshiSenderId,
            content: { body: 'Second message' },
        })
        const hiroshiMsg3 = createMockNonPaymentEvent({
            id: '$h3' as any,
            sender: hiroshiSenderId,
            content: { body: 'Last message' },
        })

        const events = [hiroshiMsg1, hiroshiMsg2, hiroshiMsg3]
        const results = filterTimelineSearchResults(events, 'hi', memberLookup)

        // All messages from Hiroshi should appear since this is
        // an in-conversation search (not a chat list search)
        expect(results).toHaveLength(3)
    })
})
