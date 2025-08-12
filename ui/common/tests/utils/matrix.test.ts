import assert from 'assert'

import { MatrixEvent, MatrixEventStatus } from '../../types'
import {
    decodeFediMatrixUserUri,
    encodeFediMatrixUserUri,
    filterMultispendEvents,
    isValidMatrixUserId,
    MatrixEventContentType,
    isMultispendReannounceEvent,
    findUserDisplayName,
    getUserSuffix,
    makeNameWithSuffix,
    mxcUrlToHttpUrl,
    mxcHttpUrlToDownloadUrl,
    isReply,
    getReplyMessageData,
    getReplyEventId,
    stripReplyFromBody,
} from '../../utils/matrix'
import { createTestMatrixReply } from '../test-utils/matrix'

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

const mockGroupAnnounceEvent: MatrixEvent<
    MatrixEventContentType<'xyz.fedi.multispend'>
> = {
    id: '1',
    content: {
        msgtype: 'xyz.fedi.multispend',
        body: 'Test message',
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
    status: MatrixEventStatus.sent,
    roomId: '@room1:m1.8fa.in',
    senderId: '@user1:m1.8fa.in',
    timestamp: Date.now(),
    error: null,
}

const mockChatEvent: MatrixEvent<MatrixEventContentType<'m.text'>> = {
    id: '2',
    content: {
        msgtype: 'm.text',
        body: 'Test message 1',
    },
    status: MatrixEventStatus.sent,
    roomId: '@room1:m1.8fa.in',
    senderId: '@user1:m1.8fa.in',
    timestamp: Date.now(),
    error: null,
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
            powerLevel: 0,
            roomId: '!room1:m1.8fa.in',
            membership: 'join' as const,
            ignored: false,
        },
        {
            id: 'npub789012fedcba:m1.8fa.in',
            displayName: 'Bob Smith',
            avatarUrl: 'mxc://example.com/avatar',
            powerLevel: 0,
            roomId: '!room1:m1.8fa.in',
            membership: 'join' as const,
            ignored: false,
        },
        {
            id: 'npubabcdef123456:m1.8fa.in',
            displayName: 'Charlie',
            avatarUrl: undefined,
            powerLevel: 50,
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

const mockRepliedEvent: MatrixEvent<MatrixEventContentType<'m.text'>> = {
    id: 'replied-event-123',
    eventId: '$replied-event-123:matrix.org',
    content: {
        msgtype: 'm.text',
        body: '> <@alice:example.com> Hello, this is the original message\n\nThis is my reply to the original message',
        format: 'org.matrix.custom.html',
        formatted_body: 'This is my reply to the original message',
        'm.relates_to': {
            'm.in_reply_to': {
                event_id: '$original-event-456:matrix.org',
            },
        },
    },
    status: MatrixEventStatus.sent,
    roomId: '!room123:matrix.org',
    senderId: '@bob:example.com',
    timestamp: Date.now(),
    error: null,
}

const mockNonRepliedEvent: MatrixEvent<MatrixEventContentType<'m.text'>> = {
    id: 'regular-event-789',
    eventId: '$regular-event-789:matrix.org',
    content: {
        msgtype: 'm.text',
        body: 'This is a regular message without any replies',
    },
    status: MatrixEventStatus.sent,
    roomId: '!room123:matrix.org',
    senderId: '@charlie:example.com',
    timestamp: Date.now(),
    error: null,
}
const mockEventWithMxReplyToStrip: MatrixEvent<
    MatrixEventContentType<'m.text'>
> = {
    id: 'mx-reply-to-strip-456',
    eventId: '$mx-reply-to-strip-456:matrix.org',
    content: {
        msgtype: 'm.text',
        body: 'Regular body text',
        format: 'org.matrix.custom.html',
        formatted_body:
            '<mx-reply><blockquote><a href="https://matrix.to/#/$target-event-789:matrix.org">In reply to</a> <a href="https://matrix.to/#/@diana:example.com">Diana Jones</a><br>Original replied message content</blockquote></mx-reply>Reply content here',
    },
    status: MatrixEventStatus.sent,
    roomId: '!room123:matrix.org',
    senderId: '@eve:example.com',
    timestamp: Date.now(),
    error: null,
}

describe('Reply utility functions', () => {
    describe('isReply', () => {
        it('returns true for events with m.relates_to reply structure', () => {
            expect(isReply(mockRepliedEvent)).toBe(true)
        })

        it('returns false for events with mx-reply content but no m.relates_to (v1.13 compliant)', () => {
            expect(isReply(mockEventWithMxReplyToStrip)).toBe(false)
        })

        it('returns false for regular messages without quote structure', () => {
            expect(isReply(mockNonRepliedEvent)).toBe(false)
        })

        it('returns false for events with incomplete quote structure', () => {
            const incompleteEvent = {
                ...mockNonRepliedEvent,
                content: {
                    ...mockNonRepliedEvent.content,
                    'm.relates_to': {
                        rel_type: 'something',
                    },
                },
            }
            expect(isReply(incompleteEvent)).toBe(false)
        })
    })

    describe('getRepliedMessageData', () => {
        it('extracts minimal reply data from m.relates_to (v1.13 compliant)', () => {
            const result = getReplyMessageData(mockRepliedEvent)

            expect(result).not.toBeNull()
            if (result) {
                expect(result.eventId).toBe('$original-event-456:matrix.org')

                expect(result.senderId).toBe('')
                expect(result.senderDisplayName).toBeUndefined()
                expect(result.body).toBe('Reply message')
                expect(result.timestamp).toBeUndefined()
            }
        })

        it('returns null for mx-reply content without m.relates_to', () => {
            const result = getReplyMessageData(mockEventWithMxReplyToStrip)

            expect(result).toBeNull()
        })

        it('returns fallback data when m.relates_to exists but no formatted_body', () => {
            const eventWithRelatesTo = {
                ...mockNonRepliedEvent,
                content: {
                    ...mockNonRepliedEvent.content,
                    'm.relates_to': {
                        'm.in_reply_to': {
                            event_id: '$fallback-event-123:matrix.org',
                        },
                    },
                },
            }

            const result = getReplyMessageData(eventWithRelatesTo)

            if (result) {
                expect(result.eventId).toBe('$fallback-event-123:matrix.org')
                expect(result.senderId).toBe('')
                expect(result.senderDisplayName).toBeUndefined()
                expect(result.body).toBe('Reply message')
            }
        })

        it('returns null for non-replied events', () => {
            const result = getReplyMessageData(mockNonRepliedEvent)
            expect(result).toBeNull()
        })
    })

    describe('getRepliedEventId', () => {
        it('extracts event ID from m.relates_to structure', () => {
            const result = getReplyEventId(mockRepliedEvent)
            expect(result).toBe('$original-event-456:matrix.org')
        })

        it('extracts event ID from formatted_body when m.relates_to is missing', () => {
            const result = getReplyEventId(mockEventWithMxReplyToStrip)
            expect(result).toBe(null)
        })

        it('returns null for non-replied events', () => {
            const result = getReplyEventId(mockNonRepliedEvent)
            expect(result).toBeNull()
        })

        it('prefers m.relates_to over formatted_body when both are present', () => {
            const result = getReplyEventId(mockRepliedEvent)
            // Should return the relates_to event ID, not the one from formatted_body
            expect(result).toBe('$original-event-456:matrix.org')
        })
    })

    describe('createTestMatrixReply', () => {
        it('creates a properly formatted Matrix v1.13 compliant reply event', () => {
            const result = createTestMatrixReply(
                '$original-123:matrix.org',
                '@alice:example.com',
                'Hello world',
                'This is my reply',
                'Alice Smith',
            )

            expect(result.msgtype).toBe('m.text')
            expect(result.body).toBe(
                '> <@alice:example.com> Hello world\n\nThis is my reply',
            )
            expect(result.format).toBe('org.matrix.custom.html')

            expect(result.formatted_body).not.toContain('<mx-reply>')
            expect(result.formatted_body).not.toContain('</mx-reply>')

            expect(result.formatted_body).toContain('Alice Smith')
            expect(result.formatted_body).toContain('This is my reply')

            expect(result['m.relates_to']?.['m.in_reply_to']?.event_id).toBe(
                '$original-123:matrix.org',
            )
        })

        it('creates reply with sender ID as display name when not provided', () => {
            const result = createTestMatrixReply(
                '$original-456:matrix.org',
                '@bob:example.com',
                'Original message',
                'My reply',
            )

            expect(result.body).toContain('@bob:example.com')
            expect(result.formatted_body).not.toContain('undefined')
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

    describe('Quote data validation', () => {
        it('handles events with missing or malformed content gracefully', () => {
            const malformedEvent = {
                ...mockNonRepliedEvent,
                content: {} as any,
            }

            expect(isReply(malformedEvent)).toBe(false)
            expect(getReplyMessageData(malformedEvent)).toBeNull()
            expect(getReplyEventId(malformedEvent)).toBeNull()
        })

        it('handles events with partial m.relates_to structure', () => {
            const partialEvent = {
                ...mockNonRepliedEvent,
                content: {
                    ...mockNonRepliedEvent.content,
                    'm.relates_to': {
                        rel_type: 'annotation',
                        // Missing m.in_reply_to
                    },
                },
            }

            expect(isReply(partialEvent)).toBe(false)
            expect(getReplyEventId(partialEvent)).toBeNull()
        })

        it('handles events with malformed mx-reply content (v1.13 compliant)', () => {
            const malformedFormattedEvent = {
                ...mockNonRepliedEvent,
                content: {
                    ...mockNonRepliedEvent.content,
                    formatted_body: '<mx-reply>incomplete quote structure',
                },
            }

            expect(isReply(malformedFormattedEvent)).toBe(false)
            expect(getReplyMessageData(malformedFormattedEvent)).toBeNull()
        })
    })

    describe('Integration tests', () => {
        it('maintains consistency between detection and extraction functions', () => {
            const repliedEvents = [mockRepliedEvent]

            repliedEvents.forEach(event => {
                const isReplied = isReply(event)
                const repliedData = getReplyMessageData(event)
                const repliedEventId = getReplyEventId(event)

                expect(isReplied).toBe(true)
                expect(repliedData).not.toBeNull()
                expect(repliedEventId).not.toBeNull()

                if (repliedData && repliedEventId) {
                    expect(repliedData.eventId).toBe(repliedEventId)
                }
            })

            const mxReplyOnlyEvents = [
                mockEventWithMxReplyToStrip, // Has mx-reply but no m.relates_to
            ]

            mxReplyOnlyEvents.forEach(event => {
                const isReplied = isReply(event)
                const repliedData = getReplyMessageData(event)
                const repliedEventId = getReplyEventId(event)

                expect(isReplied).toBe(false)
                expect(repliedData).toBeNull()
                expect(repliedEventId).toBeNull()
            })
        })

        it('ensures stripReplyFromBody works correctly with createTestMatrixReply output', () => {
            const testReply = createTestMatrixReply(
                '$original:matrix.org',
                '@sender:matrix.org',
                'Original message',
                'My reply content',
                'Sender Name',
            )

            const strippedFromFormatted = stripReplyFromBody(
                testReply.body,
                testReply.formatted_body,
            )
            const strippedFromPlain = stripReplyFromBody(testReply.body)

            expect(strippedFromFormatted).toBe('My reply content')
            expect(strippedFromPlain).toBe('My reply content')
        })
    })
})
