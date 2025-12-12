import assert from 'assert'

import { MatrixEvent, MatrixMultispendEvent } from '../../../types'
import { RpcTimelineEventItemId } from '../../../types/bindings'
import {
    decodeFediMatrixUserUri,
    encodeFediMatrixUserUri,
    filterMultispendEvents,
    isValidMatrixUserId,
    isMultispendReannounceEvent,
    findUserDisplayName,
    getUserSuffix,
    makeNameWithSuffix,
    mxcUrlToHttpUrl,
    mxcHttpUrlToDownloadUrl,
    isReply,
    stripReplyFromBody,
} from '../../../utils/matrix'

describe('encodeFediMatrixUserUri', () => {
    it('encodes a user URI', () => {
        expect(encodeFediMatrixUserUri('@user:example.com')).toBe(
            'fedi:user:@user:example.com',
        )
    })
})

describe('decodeFediMatrixUserUri', () => {
    it('decodes a user URI', () => {
        expect(decodeFediMatrixUserUri('fedi:user:@user:example.com')).toBe(
            '@user:example.com',
        )
    })

    it('decodes a user URI with ://', () => {
        expect(decodeFediMatrixUserUri('fedi://user:@user:example.com')).toBe(
            '@user:example.com',
        )
    })

    it('throws an error if the URI is valid but the user id is not valid', () => {
        expect(() => decodeFediMatrixUserUri('fedi:user:invalid')).toThrow(
            'feature.chat.invalid-member',
        )
    })

    it('throws an error if the URI is not valid', () => {
        expect(() => decodeFediMatrixUserUri('invalid')).toThrow(
            'feature.chat.invalid-member',
        )
    })
})

describe('isValidMatrixUserId', () => {
    it('returns true if the user id is valid', () => {
        expect(isValidMatrixUserId('@user:example.com')).toBe(true)
    })

    it('returns false if the user id is not valid', () => {
        expect(isValidMatrixUserId('invalid')).toBe(false)
    })
})

const mockGroupAnnounceEvent: MatrixMultispendEvent<'groupReannounce'> = {
    id: '1' as RpcTimelineEventItemId,
    localEcho: false,
    timestamp: Date.now(),
    sender: '@user1:m1.8fa.in',
    sendState: { kind: 'sent', event_id: 'event123' },
    inReply: null,
    mentions: null,
    content: {
        msgtype: 'xyz.fedi.multispend',
        kind: 'groupReannounce',
        invitationId: 'iid1',
        invitation: {
            signers: ['@user1:m1.8fa.in', '@user2:m1.8fa.in'],
            threshold: 2,
            federationInviteCode: 'fed1abc',
            federationName: 'testfed',
        },
        proposer: '@user1:m1.8fa.in',
        pubkeys: {
            '@user1:m1.8fa.in': 'pubkey123',
            '@user2:m1.8fa.in': 'pubkey456',
        },
        rejections: [],
    },
    roomId: '@room1:m1.8fa.in',
}

const mockChatEvent: MatrixEvent<'m.text'> = {
    id: '2' as RpcTimelineEventItemId,
    content: {
        msgtype: 'm.text',
        body: 'Test message 1',
        formatted: null,
    },
    roomId: '@room1:m1.8fa.in',
    sender: '@user1:m1.8fa.in',
    timestamp: Date.now(),
    sendState: { kind: 'sent', event_id: 'event123' },
    localEcho: false,
    inReply: null,
    mentions: null,
}

const mockMatrixEvents: MatrixEvent[] = [mockGroupAnnounceEvent, mockChatEvent]

describe('filterMultispendEvents', () => {
    it('should not return groupAnnounceEvent', () => {
        const filteredEvents = filterMultispendEvents(mockMatrixEvents)
        expect(filteredEvents.length).toBe(1)
        expect(filteredEvents[0].id).toBe('2')
    })
})

describe('isMultispendReannounceEvent', () => {
    it('returns true if the event is a multispend reannounce event', () => {
        expect(isMultispendReannounceEvent(mockGroupAnnounceEvent)).toBe(true)
    })

    it('returns false if the event is not a multispend reannounce event', () => {
        expect(isMultispendReannounceEvent(mockChatEvent)).toBe(false)
    })
})

describe('User display name and suffix functions', () => {
    const mockRoomMembers = [
        {
            id: 'npub123456abcdef:m1.8fa.in',
            displayName: 'Alice',
            avatarUrl: undefined,
            powerLevel: { type: 'int' as const, value: 0 },
            roomId: '!room1:m1.8fa.in',
            membership: 'join' as const,
            ignored: false,
        },
        {
            id: 'npub789012fedcba:m1.8fa.in',
            displayName: 'Bob Smith',
            avatarUrl: 'mxc://example.com/avatar',
            powerLevel: { type: 'int' as const, value: 0 },
            roomId: '!room1:m1.8fa.in',
            membership: 'join' as const,
            ignored: false,
        },
        {
            id: 'npubabcdef123456:m1.8fa.in',
            displayName: 'Charlie',
            avatarUrl: undefined,
            powerLevel: { type: 'int' as const, value: 50 },
            roomId: '!room1:m1.8fa.in',
            membership: 'join' as const,
            ignored: false,
        },
    ]

    describe('getUserSuffix', () => {
        it('generates consistent 4-character hex suffixes for different users', () => {
            const alice = mockRoomMembers[0]
            const bob = mockRoomMembers[1]

            const aliceSuffix = getUserSuffix(alice.id)
            const bobSuffix = getUserSuffix(bob.id)

            // Both should match the pattern
            expect(aliceSuffix).toMatch(/^#[a-f0-9]{4}$/)
            expect(bobSuffix).toMatch(/^#[a-f0-9]{4}$/)
            expect(aliceSuffix.length).toBe(5) // # + 4 characters
            expect(bobSuffix.length).toBe(5)

            // Should be different for different users
            expect(aliceSuffix).not.toBe(bobSuffix)

            // Should be consistent for the same user
            const result1 = getUserSuffix(alice.id)
            const result2 = getUserSuffix(alice.id)
            expect(result1).toBe(result2)
        })
    })

    describe('makeNameWithSuffix', () => {
        it('combines display names with user suffixes for single and multi-word names', () => {
            const alice = mockRoomMembers[0] // single word: "Alice"
            const bob = mockRoomMembers[1] // multi-word: "Bob Smith"

            const aliceResult = makeNameWithSuffix(alice)
            const bobResult = makeNameWithSuffix(bob)

            expect(aliceResult).toContain('Alice')
            expect(aliceResult).toMatch(/Alice #[a-f0-9]{4}/)

            expect(bobResult).toContain('Bob Smith')
            expect(bobResult).toMatch(/Bob Smith #[a-f0-9]{4}/)
        })
    })

    describe('findUserDisplayName', () => {
        it('returns display names with suffixes for found users and fallback to userId for unknown users', () => {
            const alice = mockRoomMembers[0]
            const bob = mockRoomMembers[1]
            const unknownUserId = 'npubunknown1234:m1.8fa.in'

            const aliceResult = findUserDisplayName(alice.id, mockRoomMembers)
            const bobResult = findUserDisplayName(bob.id, mockRoomMembers)
            const unknownResult = findUserDisplayName(
                unknownUserId,
                mockRoomMembers,
            )
            const emptyMembersResult = findUserDisplayName(alice.id, [])

            expect(aliceResult).toContain('Alice')
            expect(aliceResult).toMatch(/Alice #[a-f0-9]{4}/)

            expect(bobResult).toContain('Bob Smith')
            expect(bobResult).toMatch(/Bob Smith #[a-f0-9]{4}/)

            expect(unknownResult).toBe(unknownUserId)
            expect(emptyMembersResult).toBe(alice.id)
        })
    })

    describe('integration tests', () => {
        it('ensures consistency across all functions', () => {
            const alice = mockRoomMembers[0]
            const bob = mockRoomMembers[1]

            // findUserDisplayName should use makeNameWithSuffix internally for found users
            const aliceFindResult = findUserDisplayName(
                alice.id,
                mockRoomMembers,
            )
            const aliceMakeResult = makeNameWithSuffix(alice)
            expect(aliceFindResult).toBe(aliceMakeResult)

            const bobFindResult = findUserDisplayName(bob.id, mockRoomMembers)
            const bobMakeResult = makeNameWithSuffix(bob)
            expect(bobFindResult).toBe(bobMakeResult)

            // Suffix generation should be consistent across functions
            const aliceDirectSuffix = getUserSuffix(alice.id)
            const bobDirectSuffix = getUserSuffix(bob.id)

            expect(aliceMakeResult).toContain(aliceDirectSuffix)
            expect(aliceFindResult).toContain(aliceDirectSuffix)

            expect(bobMakeResult).toContain(bobDirectSuffix)
            expect(bobFindResult).toContain(bobDirectSuffix)
        })
    })
})

describe('mxcUrlToHttpUrl', () => {
    it('converts a mxc url to a http url', () => {
        expect(mxcUrlToHttpUrl('mxc://example.com/123', 100, 100)).toBe(
            `https://example.com/_matrix/media/r0/thumbnail/example.com/123?width=100&height=100&method=crop`,
        )
    })

    it('converts and adds &method=crop if the `method` argument is passed with `crop`', () => {
        expect(mxcUrlToHttpUrl('mxc://example.com/123', 100, 100, 'crop')).toBe(
            `https://example.com/_matrix/media/r0/thumbnail/example.com/123?width=100&height=100&method=crop`,
        )
    })

    it('converts and adds &method=scale if the `method` argument is passed with `scale`', () => {
        expect(
            mxcUrlToHttpUrl('mxc://example.com/123', 100, 100, 'scale'),
        ).toBe(
            `https://example.com/_matrix/media/r0/thumbnail/example.com/123?width=100&height=100&method=scale`,
        )
    })
})

describe('mxcHttpUrlToDownloadUrl', () => {
    it('converts an mxc http url to a download url', () => {
        const mxcUrl = 'mxc://matrix.server/123'
        const thumbnailUrl = mxcUrlToHttpUrl(mxcUrl, 100, 100)

        assert(thumbnailUrl)

        const downloadUrl = mxcHttpUrlToDownloadUrl(thumbnailUrl)
        expect(downloadUrl).toBe(
            `https://matrix.server/_matrix/media/r0/download/matrix.server/123`,
        )
    })

    it('returns the original url if an invalid url is passed in', () => {
        const thumbnailUrl = 'invalid$url'
        const downloadUrl = mxcHttpUrlToDownloadUrl(thumbnailUrl)

        expect(downloadUrl).toBe(thumbnailUrl)
    })
})

const mockRepliedEvent: MatrixEvent<'m.text'> = {
    id: 'replied-event-123' as RpcTimelineEventItemId,
    content: {
        msgtype: 'm.text',
        body: '> <@alice:example.com> Hello, this is the original message\n\nThis is my reply to the original message',
        formatted: {
            format: 'org.matrix.custom.html',
            formattedBody: 'This is my reply to the original message',
        },
    },
    roomId: '!room123:matrix.org',
    sender: '@bob:example.com',
    timestamp: Date.now(),
    localEcho: false,
    sendState: { kind: 'sent', event_id: 'event123' },
    mentions: null,
    inReply: {
        kind: 'ready',
        ...mockChatEvent,
    },
}

describe('Reply utility functions', () => {
    describe('isReply', () => {
        it('returns true for events with m.relates_to reply structure', () => {
            expect(isReply(mockRepliedEvent)).toBe(true)
        })
    })

    describe('stripReplyFromBody', () => {
        it('strips mx-reply content from formatted HTML body (v1.13 compliant)', () => {
            const formattedBody =
                '<mx-reply><blockquote><a href="https://matrix.to/#/$event:matrix.org">In reply to</a> <a href="https://matrix.to/#/@user:matrix.org">User</a><br>Original message</blockquote></mx-reply>This is the actual reply content'

            const result = stripReplyFromBody('fallback text', formattedBody)
            expect(result).toBe('This is the actual reply content')
        })

        it('strips reply content from plain text body with Matrix quote format', () => {
            const plainBody =
                '> <@alice:example.com> Hello there\n\nThis is my actual reply'

            const result = stripReplyFromBody(plainBody)
            expect(result).toBe('This is my actual reply')
        })

        it('strips mx-reply content and processes remaining HTML (v1.13 compliant)', () => {
            const formattedBody =
                '<mx-reply><blockquote>Quote content</blockquote></mx-reply><p>Reply with <strong>formatting</strong></p>'

            const result = stripReplyFromBody('fallback', formattedBody)
            expect(result).toBe('Reply with formatting')
        })

        it('returns original body when no quote pattern is found', () => {
            const plainBody = 'Just a regular message'

            const result = stripReplyFromBody(plainBody)
            expect(result).toBe('Just a regular message')
        })

        it('does not strip when quote format is invalid (missing empty line)', () => {
            const plainBody =
                '> <@user1:example.com> First quote\n> <@user2:example.com> Second quote\nActual reply here'

            const result = stripReplyFromBody(plainBody)
            expect(result).toBe(
                '> <@user1:example.com> First quote\n> <@user2:example.com> Second quote\nActual reply here',
            )
        })

        it('handles malformed quote patterns gracefully', () => {
            const plainBody = '> incomplete quote without user\n\nreply content'

            const result = stripReplyFromBody(plainBody)
            expect(result).toBe(
                '> incomplete quote without user\n\nreply content',
            )
        })
    })
})
