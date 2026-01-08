import { act, renderHook, waitFor } from '@testing-library/react'

import { ROOM_MENTION } from '@fedi/common/constants/matrix'
import {
    useMatrixFormEvent,
    useMatrixPaymentTransaction,
    useMentionInput,
} from '@fedi/common/hooks/matrix'
import { setupStore, setMatrixAuth } from '@fedi/common/redux'
import { MatrixAuth, MatrixRoomMember, MentionSelect } from '@fedi/common/types'

import {
    createMockPaymentEvent,
    createMockFormEvent,
    mockRoomMembers,
} from '../../mock-data/matrix-event'
import { createMockTransaction } from '../../mock-data/transactions'
import {
    createMockFedimintBridge,
    MockFedimintBridge,
} from '../../utils/fedimint'
import { renderHookWithState } from '../../utils/render'
import { createMockT } from '../../utils/setup'

/*
// Payment Transaction Hook Tests
// Business Context: When users view their payment history or click on payment messages,
// they need to see detailed transaction information including amounts, fees, timestamps,
// and confirmation status. The hook manages state for fetching this data from the bridge
*/
describe('useMatrixPaymentTransaction', () => {
    let store: ReturnType<typeof setupStore>
    let mockFedimint: MockFedimintBridge

    beforeEach(() => {
        jest.clearAllMocks()
        store = setupStore()
        mockFedimint = createMockFedimintBridge()
    })

    it('should return no-op state for legacy payments (missing senderOperationId)', async () => {
        store.dispatch(setMatrixAuth({ userId: 'npub123' } as MatrixAuth))

        const event = createMockPaymentEvent({
            content: {
                senderId: 'npub123',
                senderOperationId: undefined,
            },
        })

        const { result } = renderHookWithState(
            () =>
                useMatrixPaymentTransaction({
                    event,
                }),
            store,
            mockFedimint,
        )

        expect(result.current.hasTriedFetch).toBe(true)
        expect(result.current.transaction).toBeNull()
        expect(result.current.isLoading).toBe(false)
        expect(result.current.error).toBeNull()
    })

    it('should return the txn resolved by getTransaction', async () => {
        const mockTransaction = createMockTransaction()
        const fedimintWithGetTransaction = createMockFedimintBridge({
            getTransaction: mockTransaction,
        })
        store.dispatch(setMatrixAuth({ userId: 'npub123' } as MatrixAuth))

        const event = createMockPaymentEvent({
            content: {
                senderId: 'npub123',
                senderOperationId: 'sender-op-123',
            },
        })

        const { result } = renderHookWithState(
            () =>
                useMatrixPaymentTransaction({
                    event,
                }),
            store,
            fedimintWithGetTransaction,
        )

        await waitFor(() => {
            expect(result.current.transaction).toBeDefined()
            expect(result.current.transaction).not.toBeNull()
        })

        expect(result.current.transaction).toEqual(mockTransaction)
        expect(result.current.isLoading).toBe(false)
    })
})

describe('useMatrixFormEvent hook', () => {
    const chatbotUserId = `@fedichatbot:m1.8fa.in`
    const userId = `@npub123:m1.8fa.in`
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        jest.clearAllMocks()
        store = setupStore()
    })

    describe('receiving messages from chatbot', () => {
        it('should receive radio options from chatbot', () => {
            const t = createMockT()
            store.dispatch(setMatrixAuth({ userId } as MatrixAuth))

            const mockFormEvent = createMockFormEvent({
                content: {
                    body: '💡Please choose from the available plans:',
                    i18nKeyLabel: 'feature.communities.available-plans',
                    type: 'radio',
                    options: [
                        {
                            value: 'FriendsWithBenefits',
                            label: 'FriendsWithBenefits, guardians: 1, OGs: 3, months: 1, \nprice: 1000 msat',
                            i18nKeyLabel: null,
                        },
                        {
                            value: 'OneFMThreeOG',
                            label: 'OneFMThreeOG, guardians: 1, OGs: 3, months: 3, \nprice: 40000 msat',
                            i18nKeyLabel: null,
                        },
                    ],
                },
                sender: chatbotUserId,
            })

            const { result } = renderHookWithState(
                () => useMatrixFormEvent(mockFormEvent, t),
                store,
            )

            expect(result.current.isSentByMe).toBe(false)
            expect(result.current.messageText).toBe(
                '💡Please choose from the available plans:',
            )
            expect(result.current.actionButton).toBeUndefined()
            expect(result.current.options).toHaveLength(2)
            expect(result.current.options[0].label).toBe(
                'FriendsWithBenefits, guardians: 1, OGs: 3, months: 1, \nprice: 1000 msat',
            )
            expect(result.current.options[1].label).toBe(
                'OneFMThreeOG, guardians: 1, OGs: 3, months: 3, \nprice: 40000 msat',
            )
        })

        it('should receive single button type from chatbot', () => {
            const t = createMockT()
            store.dispatch(setMatrixAuth({ userId } as MatrixAuth))

            const mockFormEvent = createMockFormEvent({
                content: {
                    body: 'Accept Terms',
                    i18nKeyLabel: 'phrases.accept-terms',
                    type: 'button',
                    value: 'yes',
                },
                sender: chatbotUserId,
            })

            const { result } = renderHookWithState(
                () => useMatrixFormEvent(mockFormEvent, t),
                store,
            )

            expect(result.current.isSentByMe).toBe(false)
            expect(result.current.messageText).toBe('')
            expect(result.current.actionButton).toBeDefined()
            expect(result.current.actionButton?.label).toBe('Accept Terms')
            expect(result.current.options).toHaveLength(0)
        })
    })

    describe('user responses', () => {
        it('should render user response messages with formResponse correctly', () => {
            const t = createMockT()
            store.dispatch(setMatrixAuth({ userId } as MatrixAuth))

            const mockFormEvent = createMockFormEvent({
                content: {
                    msgtype: 'xyz.fedi.form',
                    body: 'yes',
                    formResponse: {
                        respondingToEventId:
                            '$YETNFzKacohBUu1A5crs-3GXpwjzZLkQNFXKZ3RfaF4',
                        responseBody: 'Accept Terms',
                        responseI18nKey: 'phrases.accept-terms',
                        responseType: 'button',
                        responseValue: 'yes',
                    },
                    i18nKeyLabel: 'phrases.accept-terms',
                    type: 'button',
                    value: 'yes',
                    options: [],
                },
                sender: userId, // This is our own message
            })

            const { result } = renderHookWithState(
                () => useMatrixFormEvent(mockFormEvent, t),
                store,
            )

            expect(result.current.isSentByMe).toBe(true)
            expect(result.current.messageText).toBe(
                'feature.communities.you-responded',
            )
            expect(result.current.actionButton).toBeUndefined()
            expect(result.current.options).toHaveLength(0)
        })

        it('should render user response messages without formResponse correctly', () => {
            const t = createMockT()
            store.dispatch(setMatrixAuth({ userId } as MatrixAuth))

            const mockFormEvent = createMockFormEvent({
                content: {
                    body: 'Accept Terms',
                    i18nKeyLabel: 'phrases.accept-terms',
                    type: 'button',
                    value: 'yes',
                },
                sender: userId, // This is our own message
            })

            const { result } = renderHookWithState(
                () => useMatrixFormEvent(mockFormEvent, t),
                store,
            )

            expect(result.current.isSentByMe).toBe(true)
            expect(result.current.messageText).toBe(
                'feature.communities.you-responded',
            )
            expect(result.current.actionButton).toBeUndefined()
            expect(result.current.options).toHaveLength(0)
        })
    })

    describe('edge cases / failure modes', () => {
        it('should handle missing matrix auth gracefully', () => {
            const t = createMockT()
            store.dispatch(setMatrixAuth(null))

            const mockFormEvent = createMockFormEvent({
                content: {
                    body: 'Accept Terms',
                    i18nKeyLabel: 'phrases.accept-terms',
                    type: 'button',
                    value: 'yes',
                },
                sender: chatbotUserId,
            })

            const { result } = renderHookWithState(
                () => useMatrixFormEvent(mockFormEvent, t),
                store,
            )

            expect(result.current.isSentByMe).toBe(false)
            expect(result.current.messageText).toBe('')
            expect(result.current.actionButton).toBeDefined()
        })

        it('should handle unknown form type gracefully', () => {
            const t = createMockT()
            store.dispatch(setMatrixAuth({ userId } as MatrixAuth))

            const mockFormEvent = createMockFormEvent({
                content: {
                    type: 'unknown' as any,
                    body: '',
                },
                sender: chatbotUserId,
            })

            const { result } = renderHookWithState(
                () => useMatrixFormEvent(mockFormEvent, t),
                store,
            )

            expect(result.current.isSentByMe).toBe(false)
            expect(result.current.messageText).toBe('')
            expect(result.current.actionButton).toBeUndefined()
            expect(result.current.options).toHaveLength(0)
        })

        it('should handle empty options array gracefully', () => {
            const t = createMockT()
            store.dispatch(setMatrixAuth({ userId } as MatrixAuth))

            const mockFormEvent = createMockFormEvent({
                content: {
                    type: 'radio',
                    options: [],
                },
                sender: chatbotUserId,
            })

            const { result } = renderHookWithState(
                () => useMatrixFormEvent(mockFormEvent, t),
                store,
            )

            expect(result.current.isSentByMe).toBe(false)
            expect(result.current.actionButton).toBeUndefined()
            expect(result.current.options).toHaveLength(0)
        })

        it('should handle null/undefined values in content', () => {
            const t = createMockT()
            store.dispatch(setMatrixAuth({ userId } as MatrixAuth))

            const mockFormEvent = createMockFormEvent({
                content: {
                    type: 'radio',
                    body: '',
                    i18nKeyLabel: null,
                    options: [
                        { value: 'test', label: null, i18nKeyLabel: null },
                    ],
                },
                sender: chatbotUserId,
            })

            const { result } = renderHookWithState(
                () => useMatrixFormEvent(mockFormEvent, t),
                store,
            )

            expect(result.current.isSentByMe).toBe(false)
            expect(result.current.messageText).toBe('')
            expect(result.current.actionButton).toBeUndefined()
            expect(result.current.options).toHaveLength(1)
            expect(result.current.options[0].label).toBe('')
        })
    })
})

describe('useMentionInput', () => {
    let roomMembers: MatrixRoomMember[]

    beforeEach(() => {
        jest.clearAllMocks()
        roomMembers = [...mockRoomMembers]
    })

    describe('mention detection & insertion', () => {
        it('should detect @ trigger when text changes', () => {
            const { result, rerender } = renderHook(
                ({ text, cursor }) =>
                    useMentionInput(roomMembers, text, cursor),
                { initialProps: { text: '', cursor: 0 } },
            )

            expect(result.current.activeMentionQuery).toBeNull()
            expect(result.current.shouldShowSuggestions).toBe(false)

            rerender({ text: '@al', cursor: 3 })
            expect(result.current.activeMentionQuery).toBe('al')
            expect(result.current.shouldShowSuggestions).toBe(true)

            rerender({ text: 'Hello @bob', cursor: 10 })
            expect(result.current.activeMentionQuery).toBe('bob')
            expect(result.current.shouldShowSuggestions).toBe(true)
        })

        it('should not trigger without @', () => {
            const { result, rerender } = renderHook(
                ({ text, cursor }) =>
                    useMentionInput(roomMembers, text, cursor),
                { initialProps: { text: '', cursor: 0 } },
            )

            rerender({ text: 'Hello world', cursor: 11 })
            expect(result.current.activeMentionQuery).toBeNull()
            expect(result.current.shouldShowSuggestions).toBe(false)
        })

        it('@room should show suggestions and insert correctly when selected', () => {
            const { result, rerender } = renderHook(
                ({ text, cursor }) =>
                    useMentionInput(roomMembers, text, cursor),
                { initialProps: { text: '', cursor: 0 } },
            )

            rerender({ text: '@roo', cursor: 4 })

            expect(result.current.shouldShowSuggestions).toBe(true)

            const roomMention: MentionSelect = {
                id: '@room',
                displayName: ROOM_MENTION,
            }
            let insertResult = { newText: '', newCursorPosition: 0 }
            act(() => {
                insertResult = result.current.insertMention(roomMention, '@roo')
            })

            expect(insertResult.newText).toBe(`@${ROOM_MENTION} `)
        })

        it('should insert mention, update cursor, and clear state', () => {
            const { result, rerender } = renderHook(
                ({ text, cursor }) =>
                    useMentionInput(roomMembers, text, cursor),
                { initialProps: { text: '', cursor: 0 } },
            )

            rerender({ text: 'Hello @al', cursor: 9 })

            const alice = roomMembers.find(m => m.displayName === 'Alice')
            expect(alice).toBeDefined()

            let insertResult = { newText: '', newCursorPosition: 0 }
            act(() => {
                insertResult = result.current.insertMention(
                    alice as MatrixRoomMember,
                    'Hello @al',
                )
            })

            expect(insertResult.newText).toBe('Hello @Alice ')
            expect(insertResult.newCursorPosition).toBe(13)
            expect(result.current.activeMentionQuery).toBeNull()
            expect(result.current.shouldShowSuggestions).toBe(false)
        })

        it('should preserve text after cursor when inserting mention', () => {
            const { result, rerender } = renderHook(
                ({ text, cursor }) =>
                    useMentionInput(roomMembers, text, cursor),
                { initialProps: { text: '', cursor: 0 } },
            )

            rerender({ text: 'Hello @al everyone', cursor: 9 })

            const alice = roomMembers.find(m => m.displayName === 'Alice')
            expect(alice).toBeDefined()

            let insertResult = { newText: '', newCursorPosition: 0 }
            act(() => {
                insertResult = result.current.insertMention(
                    alice as MatrixRoomMember,
                    'Hello @al everyone',
                )
            })

            expect(insertResult.newText).toBe('Hello @Alice  everyone')
        })
    })

    describe('member filtering', () => {
        it('should filter by display name case-insensitively', () => {
            const { result, rerender } = renderHook(
                ({ text, cursor }) =>
                    useMentionInput(roomMembers, text, cursor),
                { initialProps: { text: '', cursor: 0 } },
            )

            rerender({ text: '@ALICE', cursor: 6 })

            expect(result.current.mentionSuggestions).toHaveLength(1)
            expect(result.current.mentionSuggestions[0].displayName).toBe(
                'Alice',
            )
            expect(result.current.shouldShowSuggestions).toBe(true)
        })

        it('should filter by matrix ID/handle', () => {
            const { result, rerender } = renderHook(
                ({ text, cursor }) =>
                    useMentionInput(roomMembers, text, cursor),
                { initialProps: { text: '', cursor: 0 } },
            )

            rerender({ text: '@dave.test', cursor: 10 })

            expect(result.current.mentionSuggestions).toHaveLength(1)
            expect(result.current.mentionSuggestions[0].displayName).toBe(
                'Dave Test',
            )
            expect(result.current.shouldShowSuggestions).toBe(true)
        })

        it('should limit suggestions to 7 members', () => {
            const manyMembers: MatrixRoomMember[] = Array.from(
                { length: 10 },
                (_, i) => ({
                    id: `@user${i}:example.com`,
                    displayName: `User ${i}`,
                    avatarUrl: undefined,
                    powerLevel: { type: 'int' as const, value: 0 },
                    roomId: '!room:example.com',
                    membership: 'join' as const,
                    ignored: false,
                }),
            )

            const { result, rerender } = renderHook(
                ({ text, cursor }) =>
                    useMentionInput(manyMembers, text, cursor),
                { initialProps: { text: '', cursor: 0 } },
            )

            rerender({ text: '@user', cursor: 5 })

            expect(result.current.mentionSuggestions).toHaveLength(7)
            expect(result.current.shouldShowSuggestions).toBe(true)
        })

        it('should exclude specified user from suggestions', () => {
            const { result, rerender } = renderHook(
                ({ text, cursor }) =>
                    useMentionInput(
                        roomMembers,
                        text,
                        cursor,
                        '@alice:example.com',
                    ),
                { initialProps: { text: '', cursor: 0 } },
            )

            rerender({ text: '@alice', cursor: 6 })

            expect(
                result.current.mentionSuggestions.some(
                    m => m.id === '@alice:example.com',
                ),
            ).toBe(false)
            expect(result.current.shouldShowSuggestions).toBe(false)
        })
    })

    describe('clearing mentions', () => {
        it('should clear state when invoked', () => {
            const { result, rerender } = renderHook(
                ({ text, cursor }) =>
                    useMentionInput(roomMembers, text, cursor),
                { initialProps: { text: '', cursor: 0 } },
            )

            rerender({ text: '@alice', cursor: 6 })
            expect(result.current.activeMentionQuery).not.toBeNull()
            expect(result.current.shouldShowSuggestions).toBe(true)

            act(() => result.current.clearMentions())
            expect(result.current.activeMentionQuery).toBeNull()
            expect(result.current.mentionSuggestions).toHaveLength(0)
            expect(result.current.shouldShowSuggestions).toBe(false)
        })

        it('should clear when @ is deleted', () => {
            const { result, rerender } = renderHook(
                ({ text, cursor }) =>
                    useMentionInput(roomMembers, text, cursor),
                { initialProps: { text: '', cursor: 0 } },
            )

            rerender({ text: '@alice', cursor: 6 })
            expect(result.current.activeMentionQuery).not.toBeNull()
            expect(result.current.shouldShowSuggestions).toBe(true)

            rerender({ text: 'alice', cursor: 5 })
            expect(result.current.activeMentionQuery).toBeNull()
            expect(result.current.shouldShowSuggestions).toBe(false)
        })
    })
})
