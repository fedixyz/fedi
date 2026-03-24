import { createMockNonPaymentEvent } from '@fedi/common/tests/mock-data/matrix-event'
import { ChatType, MatrixEvent } from '@fedi/common/types'
import { RpcTimelineEventItemId } from '@fedi/common/types/bindings'

import {
    makeChatConversationRows,
    getChatConversationRowIndex,
} from '../../../utils/chatConversationRows'

const BASE_TIMESTAMP = 1_750_083_034_389

function makeEvent(
    id: string,
    sender: string,
    timestampOffset: number,
    body = `msg-${id}`,
): MatrixEvent {
    return createMockNonPaymentEvent({
        id: `$${id}` as RpcTimelineEventItemId,
        sender,
        timestamp: BASE_TIMESTAMP + timestampOffset,
        content: { body, formatted: null },
    })
}

describe('chatConversationRows', () => {
    describe('makeChatConversationRows', () => {
        it('should return empty array for empty input', () => {
            const rows = makeChatConversationRows([], ChatType.group)

            expect(rows).toEqual([])
        })

        it('should return one row with all flags set for a single event', () => {
            const events = [makeEvent('1', '@alice:example.com', 0)]
            const rows = makeChatConversationRows(events, ChatType.group)

            expect(rows).toHaveLength(1)
            expect(rows[0]).toMatchObject({
                event: events[0],
                showTimestamp: true,
                showUsername: true,
                showAvatar: true,
                showUsernames: true,
                isLastBubbleInRun: true,
            })
        })

        it('should group same-sender messages within 60s into one sender run', () => {
            const events = [
                makeEvent('1', '@alice:example.com', 0),
                makeEvent('2', '@alice:example.com', -10_000),
                makeEvent('3', '@alice:example.com', -20_000),
            ]
            const rows = makeChatConversationRows(events, ChatType.group)

            expect(rows).toHaveLength(3)

            // Rows are sorted desc (newest first)
            // Row 0 = newest ($1): showAvatar, isLastBubbleInRun
            expect(rows[0]).toMatchObject({
                event: expect.objectContaining({ id: '$1' }),
                showTimestamp: false,
                showUsername: false,
                showAvatar: true,
                isLastBubbleInRun: true,
            })

            // Row 1 = middle ($2): no special flags
            expect(rows[1]).toMatchObject({
                event: expect.objectContaining({ id: '$2' }),
                showTimestamp: false,
                showUsername: false,
                showAvatar: false,
                isLastBubbleInRun: false,
            })

            // Row 2 = oldest ($3): showTimestamp, showUsername
            expect(rows[2]).toMatchObject({
                event: expect.objectContaining({ id: '$3' }),
                showTimestamp: true,
                showUsername: true,
                showAvatar: false,
                isLastBubbleInRun: false,
            })
        })

        it('should create separate sender runs for different senders within same time window', () => {
            const events = [
                makeEvent('1', '@alice:example.com', 0),
                makeEvent('2', '@bob:example.com', -10_000),
                makeEvent('3', '@alice:example.com', -20_000),
            ]
            const rows = makeChatConversationRows(events, ChatType.group)

            expect(rows).toHaveLength(3)

            // Each message is its own sender run (A, B, A pattern)
            // All are in the same time group
            expect(rows[0]).toMatchObject({
                event: expect.objectContaining({ id: '$1' }),
                showAvatar: true,
                showUsername: true,
                isLastBubbleInRun: true,
                showTimestamp: false,
            })
            expect(rows[1]).toMatchObject({
                event: expect.objectContaining({ id: '$2' }),
                showAvatar: true,
                showUsername: true,
                isLastBubbleInRun: true,
                showTimestamp: false,
            })
            expect(rows[2]).toMatchObject({
                event: expect.objectContaining({ id: '$3' }),
                showAvatar: true,
                showUsername: true,
                isLastBubbleInRun: true,
                showTimestamp: true,
            })
        })

        it('should split into separate time groups when gap exceeds 60s', () => {
            const events = [
                makeEvent('1', '@alice:example.com', 0),
                makeEvent('2', '@alice:example.com', -61_000),
            ]
            const rows = makeChatConversationRows(events, ChatType.group)

            expect(rows).toHaveLength(2)

            // Each event is in its own time group
            expect(rows[0]).toMatchObject({
                event: expect.objectContaining({ id: '$1' }),
                showTimestamp: true,
            })
            expect(rows[1]).toMatchObject({
                event: expect.objectContaining({ id: '$2' }),
                showTimestamp: true,
            })
        })

        it('should set showUsernames to false for direct chats', () => {
            const events = [
                makeEvent('1', '@alice:example.com', 0),
                makeEvent('2', '@bob:example.com', -10_000),
            ]
            const rows = makeChatConversationRows(events, ChatType.direct)

            rows.forEach(row => {
                expect(row.showUsernames).toBe(false)
            })
        })

        it('should set showUsernames to true for group chats', () => {
            const events = [
                makeEvent('1', '@alice:example.com', 0),
                makeEvent('2', '@bob:example.com', -10_000),
            ]
            const rows = makeChatConversationRows(events, ChatType.group)

            rows.forEach(row => {
                expect(row.showUsernames).toBe(true)
            })
        })
    })

    describe('getChatConversationRowIndex', () => {
        it('should return the index of the matching event', () => {
            const events = [
                makeEvent('1', '@alice:example.com', 0),
                makeEvent('2', '@alice:example.com', -10_000),
                makeEvent('3', '@alice:example.com', -20_000),
            ]
            const rows = makeChatConversationRows(events, ChatType.group)

            expect(getChatConversationRowIndex(rows, '$2')).toBe(1)
        })

        it('should return -1 when event is not found', () => {
            const events = [makeEvent('1', '@alice:example.com', 0)]
            const rows = makeChatConversationRows(events, ChatType.group)

            expect(getChatConversationRowIndex(rows, '$nonexistent')).toBe(-1)
        })
    })
})
