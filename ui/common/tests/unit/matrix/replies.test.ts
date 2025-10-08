import { stripReplyFromBody } from '@fedi/common/utils/matrix'

describe('Reply Core Functionality', () => {
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
})
