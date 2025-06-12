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
} from '../../utils/matrix'

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
