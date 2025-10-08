import { MatrixEvent, MatrixRoomMember } from '../../../types'
import { RpcTimelineEventItemId } from '../../../types/bindings'
import {
    extractMentionsFromEvent,
    hasMentions,
    parseMentionsFromText,
    prepareMentionsDataPayload,
    splitHtmlRuns,
    unescapeHtml,
} from '../../../utils/matrix'

const members: MatrixRoomMember[] = [
    {
        id: '@alice:example.com',
        displayName: 'Alice',
        avatarUrl: undefined,
        powerLevel: 0,
        roomId: '!room:example.com',
        membership: 'join',
        ignored: false,
    },
    {
        id: '@bob:example.com',
        displayName: 'Bob Smith',
        avatarUrl: undefined,
        powerLevel: 0,
        roomId: '!room:example.com',
        membership: 'join',
        ignored: false,
    },
]

// TODO: Remove once mentions are fixed in the bridge
describe.skip('skip mentions', () => {
    describe('parseMentionsFromText', () => {
        it('links @handle and populates mentions', () => {
            const input = 'Hello @alice'
            const { mentions, formattedBody } = parseMentionsFromText(
                input,
                members,
            )

            expect(formattedBody).toContain(
                'href="https://matrix.to/#/@alice:example.com"',
            )
            expect(formattedBody).toContain('>@Alice</a>')
            expect(mentions.user_ids).toEqual(['@alice:example.com'])
            expect(mentions.room).toBeUndefined()
        })

        it('supports multi-word display names (greedy match)', () => {
            const input = 'ping @Bob Smith, please'
            const { mentions, formattedBody } = parseMentionsFromText(
                input,
                members,
            )

            expect(formattedBody).toContain(
                'href="https://matrix.to/#/@bob:example.com"',
            )
            expect(formattedBody).toContain('>@Bob Smith</a>')
            expect(mentions.user_ids).toEqual(['@bob:example.com'])
        })

        it('is case-insensitive for the token after @', () => {
            const input = 'PING @ALICE now'
            const { mentions, formattedBody } = parseMentionsFromText(
                input,
                members,
            )

            expect(formattedBody).toContain(
                'href="https://matrix.to/#/@alice:example.com"',
            )
            expect(mentions.user_ids).toEqual(['@alice:example.com'])
        })

        it('handles punctuation/word boundaries like "(@alice),"', () => {
            const input = 'See (@alice), thanks'
            const { mentions, formattedBody } = parseMentionsFromText(
                input,
                members,
            )

            expect(formattedBody).toContain(
                'href="https://matrix.to/#/@alice:example.com"',
            )
            expect(mentions.user_ids).toEqual(['@alice:example.com'])
        })

        it('leaves unknown handles as typed', () => {
            const input = 'hello @unknown_user'
            const { mentions, formattedBody } = parseMentionsFromText(
                input,
                members,
            )

            expect(formattedBody).toContain('@unknown_user')
            expect(mentions.user_ids).toBeUndefined()
        })

        it('sets room mention for @room and keeps it as plain text', () => {
            const { mentions, formattedBody } = parseMentionsFromText(
                'heads up @room',
                members,
            )
            expect(formattedBody).toContain('@room')
            expect(formattedBody).not.toContain(
                'href="https://matrix.to/#/@room',
            )
            expect(mentions.room).toBe(true)
        })

        it('no "@" → no m.mentions or formatted_body sent', () => {
            const input = 'no tags <i>here</i>'
            const { mentions, extra } = prepareMentionsDataPayload(
                input,
                members,
            )
            expect(mentions).toBeNull()
            expect(extra).toEqual({})
        })

        it('matches mention at start of string', () => {
            const { mentions, formattedBody } = parseMentionsFromText(
                '@Alice hi',
                members,
            )
            expect(mentions.user_ids).toEqual(['@alice:example.com'])
            expect(formattedBody).toContain('>@Alice</a>')
        })

        it('does not treat emails as mentions', () => {
            const { mentions, formattedBody } = parseMentionsFromText(
                'email me at test@host.com',
                members,
            )
            expect(mentions.user_ids).toBeUndefined()
            expect(formattedBody).toContain('test@host.com')
            expect(formattedBody).not.toContain('href="https://matrix.to/#/')
        })

        it('emits lone "@" as-is (invalid token)', () => {
            const { mentions, formattedBody } = parseMentionsFromText(
                'ping @ now',
                members,
            )
            expect(mentions.user_ids).toBeUndefined()
            expect(formattedBody).toContain('ping @ now')
        })

        it('handles end-of-string boundary for handle', () => {
            const { mentions } = parseMentionsFromText('hi @alice', members)
            expect(mentions.user_ids).toEqual(['@alice:example.com'])
        })

        it('sets room for mixed-case @ROOM/@Everyone (kept as plain text)', () => {
            const { mentions, formattedBody } = parseMentionsFromText(
                'ping @ROOM and @Everyone',
                members,
            )
            expect(mentions.room).toBe(true)
            expect(formattedBody).toContain('@ROOM')
            expect(formattedBody).toContain('@Everyone')
        })

        it('deduplicates repeated mentions of the same user', () => {
            const { mentions } = parseMentionsFromText(
                'hi @Alice and also @alice',
                members,
            )
            expect(mentions.user_ids).toEqual(['@alice:example.com'])
        })

        it('falls back to MXID in anchor text when displayName is missing', () => {
            const onlyMxid: MatrixRoomMember[] = [
                { ...members[0], displayName: '' },
                members[1],
            ]
            const { formattedBody } = parseMentionsFromText(
                'hi @alice',
                onlyMxid,
            )
            // visible anchor text should be @<mxid>
            expect(formattedBody).toContain('>@@alice:example.com</a>')
        })

        it('leaves unknown display-name token as typed', () => {
            const { mentions, formattedBody } = parseMentionsFromText(
                'yo @Charlie',
                members,
            )
            expect(mentions.user_ids).toBeUndefined()
            expect(formattedBody).toContain('@Charlie')
        })

        it('supports dot/dash/underscore in handle', () => {
            const custom: MatrixRoomMember[] = [
                {
                    ...members[0],
                    id: '@a.b_c-d:example.com',
                    displayName: 'Abc',
                },
                members[1],
            ]
            const { mentions } = parseMentionsFromText('hi @a.b_c-d', custom)
            expect(mentions.user_ids).toEqual(['@a.b_c-d:example.com'])
        })

        it('enforces handle length ≤ 64 and leaves 65-char token as typed', () => {
            const sixtyFour = 'a'.repeat(64)
            const sixtyFive = 'b'.repeat(65)
            const custom: MatrixRoomMember[] = [
                {
                    ...members[0],
                    id: `@${sixtyFour}:example.com`,
                    displayName: 'A',
                },
                members[1],
            ]

            const ok = parseMentionsFromText(`hi @${sixtyFour}`, custom)
            expect(ok.mentions.user_ids).toEqual([`@${sixtyFour}:example.com`])

            const tooLong = parseMentionsFromText(`hi @${sixtyFive}`, custom)
            expect(tooLong.mentions.user_ids).toBeUndefined()
            expect(tooLong.formattedBody).toContain(`@${sixtyFive}`)
        })

        it('greedily matches the longest display name when overlapping (prefers "Bob Smith")', () => {
            const extended: MatrixRoomMember[] = [
                ...members,
                {
                    id: '@bob2:example.com',
                    displayName: 'Bob',
                    avatarUrl: undefined,
                    powerLevel: 0,
                    roomId: '!room:example.com',
                    membership: 'join',
                    ignored: false,
                },
            ]
            const { formattedBody } = parseMentionsFromText(
                'ping @Bob Smith please',
                extended,
            )
            expect(formattedBody).toMatch(/>@Bob Smith<\/a>/)
            expect(formattedBody).not.toMatch(/>@Bob<\/a>/)
        })

        it('escapes non-mention HTML while keeping anchors intact', () => {
            const { formattedBody } = parseMentionsFromText(
                '5 < 7 @Alice > 3',
                members,
            )
            expect(formattedBody).toContain('5 &lt; 7 ')
            expect(formattedBody).toContain('>@Alice</a>')
            expect(formattedBody).toContain(' &gt; 3')
        })

        it('treats newline as a delimiter', () => {
            const { mentions } = parseMentionsFromText('hi\n@alice', members)
            expect(mentions.user_ids).toEqual(['@alice:example.com'])
        })

        it('does not match a second adjacent @ without a delimiter', () => {
            const { mentions, formattedBody } = parseMentionsFromText(
                '@alice@bob',
                members,
            )
            expect(mentions.user_ids).toEqual(['@alice:example.com'])
            expect(formattedBody).toContain(
                'href="https://matrix.to/#/@alice:example.com"',
            )
            expect(formattedBody).toContain('@bob')
        })

        it('handles multiple different mentions in one message', () => {
            const { mentions, formattedBody } = parseMentionsFromText(
                'hey @Alice and @Bob Smith',
                members,
            )
            expect(mentions.user_ids).toEqual([
                '@alice:example.com',
                '@bob:example.com',
            ])
            const a = formattedBody.indexOf('>@Alice</a>')
            const b = formattedBody.indexOf('>@Bob Smith</a>')
            expect(a).toBeGreaterThanOrEqual(0)
            expect(b).toBeGreaterThanOrEqual(0)
            expect(a).toBeLessThan(b)
        })

        it('does not match handle contained within email-like token with trailing punctuation', () => {
            const { mentions, formattedBody } = parseMentionsFromText(
                'contact foo@bar.com, thanks',
                members,
            )
            expect(mentions.user_ids).toBeUndefined()
            expect(formattedBody).toContain('foo@bar.com,')
        })

        it('treats apostrophe as delimiter after mention text', () => {
            const { mentions, formattedBody } = parseMentionsFromText(
                "that's @alice's turn",
                members,
            )
            expect(mentions.user_ids).toEqual(['@alice:example.com'])
            // anchor, then escaped apostrophe (&#39;) immediately after
            expect(formattedBody).toMatch(/>@Alice<\/a>&#39;s/)
        })
    })

    describe('prepareMentionsDataPayload', () => {
        it('returns mentions + formatted_body when mentions exist', () => {
            const { mentions, extra } = prepareMentionsDataPayload(
                'hi @alice',
                members,
            )

            expect(hasMentions(mentions)).toBe(true)
            expect(mentions?.users).toEqual(['@alice:example.com'])
            expect(extra).toEqual(
                expect.objectContaining({
                    format: 'org.matrix.custom.html',
                    formatted_body: expect.stringContaining(
                        'href="https://matrix.to/#/@alice:example.com"',
                    ),
                }),
            )
        })

        it('no mentions present -> {mentions:null, extra:{}}', () => {
            const { mentions, extra } = prepareMentionsDataPayload(
                'hello world',
                members,
            )
            expect(mentions).toBeNull()
            expect(extra).toEqual({})
        })
    })

    describe('extractMentionsFromEvent', () => {
        const base = {
            roomId: '!room:example.com',
            sender: '@someone:example.com',
            timestamp: Date.now(),
            sendState: { kind: 'sent', event_id: 'e1' },
            localEcho: false,
            inReply: null,
        } satisfies Partial<MatrixEvent>

        it('extracts userId from matrix.to anchor', () => {
            const event: MatrixEvent = {
                id: 'e1' as RpcTimelineEventItemId,
                ...base,
                content: {
                    msgtype: 'm.text',
                    body: 'hi @Alice',
                    formatted: {
                        format: 'org.matrix.custom.html',
                        formattedBody:
                            'hi <a href="https://matrix.to/#/@alice:example.com">@Alice</a>',
                    },
                },
            }
            const res = extractMentionsFromEvent(event)
            expect(res.mentionedUserIds).toEqual([])
            expect(res.hasRoomMention).toBe(false)
            expect(res.formattedMentions[0]).toEqual(
                expect.objectContaining({ userId: '@alice:example.com' }),
            )
        })

        it('percent-decodes MXIDs from anchors', () => {
            const event: MatrixEvent = {
                id: 'e2' as RpcTimelineEventItemId,
                ...base,
                content: {
                    msgtype: 'm.text',
                    body: 'hello @Bob Smith',
                    formatted: {
                        format: 'org.matrix.custom.html',
                        formattedBody:
                            'hello <a href="https://matrix.to/#/%40bob%3Aexample.com">@Bob Smith</a>',
                    },
                },
            }
            const res = extractMentionsFromEvent(event)
            expect(res.formattedMentions[0].userId).toBe('@bob:example.com')
        })

        it('reads m.mentions room flag and user_ids', () => {
            const event: MatrixEvent = {
                id: 'e3' as RpcTimelineEventItemId,
                ...base,
                // mentions: { room: true, user_ids: ['@alice:example.com'] },
                content: {
                    msgtype: 'm.text',
                    body: '@room and @Alice',
                    // 'm.mentions': { room: true, user_ids: ['@alice:example.com'] },
                    formatted: {
                        format: 'org.matrix.custom.html',
                        formattedBody:
                            '@room and <a href="https://matrix.to/#/@alice:example.com">@Alice</a>',
                    },
                },
            }
            const res = extractMentionsFromEvent(event)
            expect(res.hasRoomMention).toBe(true)
            expect(res.mentionedUserIds).toEqual(['@alice:example.com'])
        })

        describe('html & parsing helpers', () => {
            it('splitHtmlRuns converts <br/> to newline and strips tags inside anchors', () => {
                const runs = splitHtmlRuns(
                    'hello<br/>world <a href="https://x">click <b>me</b></a>',
                )
                expect(runs.map(r => r.type)).toEqual([
                    'text',
                    'text',
                    'text',
                    'link',
                ])
                expect((runs[0] as any).text).toBe('hello')
                expect((runs[1] as any).text).toBe('\n')
                expect((runs[2] as any).text).toBe('world ')
                expect((runs[3] as any).text).toBe('click me')
            })

            it('treats @everyone like @room', () => {
                const { mentions, formattedBody } = parseMentionsFromText(
                    'ping @everyone',
                    members,
                )
                expect(mentions.room).toBe(true)
                expect(formattedBody).toContain('@everyone') // stays plain text
            })

            it('unescapeHtml handles &apos; and &#39;', () => {
                expect(unescapeHtml('&apos;&#39;')).toBe("''")
            })

            it('keeps others anchored when excluding self', () => {
                const { mentions, extra } = prepareMentionsDataPayload(
                    'hi @Alice and @Bob Smith',
                    members,
                    {
                        excludeUserId: '@alice:example.com',
                    },
                )
                expect(mentions?.users).toEqual(['@bob:example.com'])
                expect(extra.formatted_body).toContain('@Alice') // de-anchored self
                expect(extra.formatted_body).toMatch(
                    /href="https:\/\/matrix\.to\/#\/@bob:example\.com"/,
                )
            })
        })

        it('supports @room together with user mentions', () => {
            const { mentions, formattedBody } = parseMentionsFromText(
                'ping @room and @Alice',
                members,
            )
            expect(mentions.room).toBe(true)
            expect(mentions.user_ids).toEqual(['@alice:example.com'])
            expect(formattedBody).toContain('@room')
            expect(formattedBody).toContain(
                'href="https://matrix.to/#/@alice:example.com"',
            )
        })

        it('matches display names with surrounding whitespace in member list', () => {
            const weird: MatrixRoomMember[] = [
                { ...members[0], displayName: '  Alice  ' },
                members[1],
            ]
            const { mentions, formattedBody } = parseMentionsFromText(
                'hi @Alice',
                weird,
            )
            expect(mentions.user_ids).toEqual(['@alice:example.com'])
            expect(formattedBody).toContain('>@Alice</a>')
        })
    })
})
