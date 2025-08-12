import { MatrixEventStatus } from '@fedi/common/types'
import {
    isReply,
    getReplyMessageData,
    getReplyEventId,
    stripReplyFromBody,
} from '@fedi/common/utils/matrix'

import { createTestMatrixReply } from '../test-utils/matrix'

const createMatrixEvent = (overrides: any) => ({
    id: 'test-event',
    eventId: '$test-event:matrix.org',
    status: MatrixEventStatus.sent,
    roomId: '!room1:matrix.org',
    senderId: '@user:matrix.org',
    timestamp: Date.now(),
    error: null,
    content: {
        msgtype: 'm.text',
        body: 'Test message',
    } as any,
    ...overrides,
})

describe('Reply Core Functionality', () => {
    it('detects replies using m.relates_to only (v1.13 compliant)', () => {
        const relatesToReply = createMatrixEvent({
            content: {
                msgtype: 'm.text',
                body: '> <@alice:matrix.org> Original\n\nReply',
                'm.relates_to': {
                    'm.in_reply_to': { event_id: '$original:matrix.org' },
                },
            },
        })

        const htmlReplyWithMxReply = createMatrixEvent({
            content: {
                msgtype: 'm.text',
                body: 'Fallback text',
                format: 'org.matrix.custom.html',
                formatted_body:
                    '<mx-reply><blockquote><a href="https://matrix.to/#/$target:matrix.org">In reply to</a></blockquote></mx-reply>Reply content',
            },
        })

        const regularMessage = createMatrixEvent({
            content: { msgtype: 'm.text', body: 'Just a normal message' },
        })

        expect(isReply(relatesToReply)).toBe(true)

        expect(isReply(htmlReplyWithMxReply)).toBe(false)
        expect(isReply(regularMessage)).toBe(false)
    })

    // returns m.relates_to event_id value when both m.relates_to and formatted_body href are present, ignoring the href value
    it('prioritizes m.relates_to over formatted_body when both exist', () => {
        const eventWithBothFormats = createMatrixEvent({
            content: {
                msgtype: 'm.text',
                body: 'Reply',
                formatted_body:
                    '<mx-reply><blockquote><a href="https://matrix.to/#/$html-event:matrix.org">In reply to</a></blockquote></mx-reply>Reply',
                'm.relates_to': {
                    'm.in_reply_to': { event_id: '$priority-event:matrix.org' },
                },
            },
        })

        expect(getReplyEventId(eventWithBothFormats)).toBe(
            '$priority-event:matrix.org',
        )
    })

    it('returns minimal reply data from m.relates_to (v1.13 compliant)', () => {
        const complexReplyEvent = createMatrixEvent({
            content: {
                msgtype: 'm.text',
                body: '> <@alice:matrix.org> What time is the meeting today?\n\nThe meeting is at 3 PM',
                format: 'org.matrix.custom.html',
                formatted_body:
                    '<mx-reply><blockquote><a href="https://matrix.to/#/$meeting-question:matrix.org">In reply to</a> <a href="https://matrix.to/#/@alice:matrix.org">Alice Johnson</a><br>What time is the meeting today?</blockquote></mx-reply>The meeting is at 3 PM',
                'm.relates_to': {
                    'm.in_reply_to': {
                        event_id: '$meeting-question:matrix.org',
                    },
                },
            },
        })

        const extractedData = getReplyMessageData(complexReplyEvent)

        expect(extractedData).not.toBeNull()
        expect(extractedData?.eventId).toBe('$meeting-question:matrix.org')
        // v1.13: reply metadata should come from event store, not mx-reply parsing
        expect(extractedData?.senderId).toBe('')
        expect(extractedData?.senderDisplayName).toBeUndefined()
        expect(extractedData?.body).toBe('Reply message')
    })

    it('strips mx-reply content and processes remaining HTML (v1.13 compliant)', () => {
        const complexHtmlReply =
            '<mx-reply><blockquote><a href="https://matrix.to/#/$event">In reply to</a> <a href="https://matrix.to/#/@user">User</a><br>Original message</blockquote></mx-reply><p>Reply with <strong>bold text</strong> and <em>italics</em></p>'

        expect(stripReplyFromBody('fallback', complexHtmlReply)).toBe(
            'Reply with bold text and italics',
        )

        const validMatrixReply =
            '> <@alice:matrix.org> Original message here\n\nThis is my actual reply'
        expect(stripReplyFromBody(validMatrixReply)).toBe(
            'This is my actual reply',
        )

        const multiLineQuoteFormat =
            '> <@user:matrix.org> First line\n> <@user:matrix.org> Second line\nReply'
        expect(stripReplyFromBody(multiLineQuoteFormat)).toBe('Reply')
    })

    it('creates Matrix v1.13 compliant replies without mx-reply tags', () => {
        const reply = createTestMatrixReply(
            '$original-msg:matrix.org',
            '@alice:matrix.org',
            'What time is the meeting?',
            'The meeting is at 3 PM',
            'Alice Johnson',
        )

        expect(reply.msgtype).toBe('m.text')
        expect(reply['m.relates_to']?.['m.in_reply_to']?.event_id).toBe(
            '$original-msg:matrix.org',
        )

        expect(reply.body).toBe(
            '> <@alice:matrix.org> What time is the meeting?\n\nThe meeting is at 3 PM',
        )

        // v1.13: should not contain mx-reply tags in formatted_body
        if (reply.formatted_body) {
            expect(reply.formatted_body).not.toContain('<mx-reply>')
            expect(reply.formatted_body).not.toContain('</mx-reply>')
        }
    })

    it('strips mx-reply tags and content as per v1.13 spec', () => {
        const eventWithMxReply = createMatrixEvent({
            content: {
                msgtype: 'm.text',
                body: 'Fallback text',
                format: 'org.matrix.custom.html',
                formatted_body:
                    '<mx-reply><blockquote><a href="https://matrix.to/#/$target:matrix.org">In reply to</a></blockquote></mx-reply>Actual message content',
            },
        })

        // mx-reply content should return null (stripped, not parsed)
        expect(getReplyMessageData(eventWithMxReply)).toBeNull()
        expect(getReplyEventId(eventWithMxReply)).toBeNull()
        expect(isReply(eventWithMxReply)).toBe(false)
    })
})
