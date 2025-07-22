import { renderHook, waitFor } from '@testing-library/react'

import {
    useMatrixFormEvent,
    useMatrixPaymentTransaction,
} from '@fedi/common/hooks/matrix'
import {
    createMockPaymentEvent,
    createMockFormEvent,
} from '@fedi/common/tests/mock-data/matrix-event'
import { createMockTransaction } from '@fedi/common/tests/mock-data/transactions'
import {
    mockFedimint,
    mockSelectorValues,
    mockUseTranslation,
} from '@fedi/common/tests/setup/jest.setup'

/*
// Payment Transaction Hook Tests
// Business Context: When users view their payment history or click on payment messages,
// they need to see detailed transaction information including amounts, fees, timestamps,
// and confirmation status. The hook manages state for fetching this data from the bridge
*/
describe('useMatrixPaymentTransaction', () => {
    beforeEach(() => {
        jest.clearAllMocks()

        // Reset the fedimint bridge mock to ensure clean state
        mockFedimint.getTransaction.mockClear()
    })

    it('should return no-op state for legacy payments (missing senderOperationId)', async () => {
        mockSelectorValues({
            selectMatrixAuth: { userId: 'npub123' },
        })
        mockFedimint.getTransaction.mockResolvedValue(undefined as any)

        const event = createMockPaymentEvent({
            content: {
                senderId: 'npub123',
                senderOperationId: undefined,
            },
        })

        const { result } = renderHook(() =>
            useMatrixPaymentTransaction({
                event,
                fedimint: mockFedimint,
            }),
        )

        expect(result.current.hasTriedFetch).toBe(true)
        expect(result.current.transaction).toBeNull()
        expect(result.current.isLoading).toBe(false)
        expect(result.current.error).toBeNull()
    })

    it('should return the txn resolved by getTransaction', async () => {
        const mockTransaction = createMockTransaction()
        mockSelectorValues({
            selectMatrixAuth: { userId: 'npub123' },
        })
        mockFedimint.getTransaction.mockResolvedValue(mockTransaction)

        const event = createMockPaymentEvent({
            content: {
                senderId: 'npub123',
                senderOperationId: 'sender-op-123',
            },
        })

        const { result } = renderHook(() =>
            useMatrixPaymentTransaction({
                event,
                fedimint: mockFedimint,
            }),
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

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('receiving messages from chatbot', () => {
        it('should receive radio options from chatbot', () => {
            const { t } = mockUseTranslation()
            mockSelectorValues({
                selectMatrixAuth: { userId },
            })

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
                senderId: chatbotUserId,
            })

            const { result } = renderHook(() =>
                useMatrixFormEvent(mockFormEvent, t),
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
            const { t } = mockUseTranslation()
            mockSelectorValues({
                selectMatrixAuth: { userId },
            })

            const mockFormEvent = createMockFormEvent({
                content: {
                    body: 'Accept Terms',
                    i18nKeyLabel: 'phrases.accept-terms',
                    type: 'button',
                    value: 'yes',
                },
                senderId: chatbotUserId,
            })

            const { result } = renderHook(() =>
                useMatrixFormEvent(mockFormEvent, t),
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
            const { t } = mockUseTranslation()
            mockSelectorValues({
                selectMatrixAuth: { userId },
            })

            const mockFormEvent = createMockFormEvent({
                content: {
                    body: 'yes',
                    formResponse: {
                        respondingToEventId:
                            '$YETNFzKacohBUu1A5crs-3GXpwjzZLkQNFXKZ3RfaF4',
                        responseBody: 'Accept Terms',
                        responseI18nKey: 'phrases.accept-terms',
                        responseType: 'button',
                        responseValue: 'yes',
                    },
                },
                senderId: userId, // This is our own message
            })

            const { result } = renderHook(() =>
                useMatrixFormEvent(mockFormEvent, t),
            )

            expect(result.current.isSentByMe).toBe(true)
            expect(result.current.messageText).toBe(
                'feature.communities.you-responded',
            )
            expect(result.current.actionButton).toBeUndefined()
            expect(result.current.options).toHaveLength(0)
        })

        it('should render user response messages without formResponse correctly', () => {
            const { t } = mockUseTranslation()
            mockSelectorValues({
                selectMatrixAuth: { userId },
            })

            const mockFormEvent = createMockFormEvent({
                content: {
                    body: 'Accept Terms',
                    i18nKeyLabel: 'phrases.accept-terms',
                    type: 'button',
                    value: 'yes',
                },
                senderId: userId, // This is our own message
            })

            const { result } = renderHook(() =>
                useMatrixFormEvent(mockFormEvent, t),
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
            const { t } = mockUseTranslation()
            mockSelectorValues({
                selectMatrixAuth: null,
            })

            const mockFormEvent = createMockFormEvent({
                content: {
                    body: 'Accept Terms',
                    i18nKeyLabel: 'phrases.accept-terms',
                    type: 'button',
                    value: 'yes',
                },
                senderId: chatbotUserId,
            })

            const { result } = renderHook(() =>
                useMatrixFormEvent(mockFormEvent, t),
            )

            expect(result.current.isSentByMe).toBe(false)
            expect(result.current.messageText).toBe('')
            expect(result.current.actionButton).toBeDefined()
        })

        it('should handle unknown form type gracefully', () => {
            const { t } = mockUseTranslation()
            mockSelectorValues({
                selectMatrixAuth: { userId },
            })

            const mockFormEvent = createMockFormEvent({
                content: {
                    type: 'unknown' as any,
                    body: null,
                },
                senderId: chatbotUserId,
            })

            const { result } = renderHook(() =>
                useMatrixFormEvent(mockFormEvent, t),
            )

            expect(result.current.isSentByMe).toBe(false)
            expect(result.current.messageText).toBe('')
            expect(result.current.actionButton).toBeUndefined()
            expect(result.current.options).toHaveLength(0)
        })

        it('should handle empty options array gracefully', () => {
            const { t } = mockUseTranslation()
            mockSelectorValues({
                selectMatrixAuth: { userId },
            })

            const mockFormEvent = createMockFormEvent({
                content: {
                    type: 'radio',
                    options: [],
                },
                senderId: chatbotUserId,
            })

            const { result } = renderHook(() =>
                useMatrixFormEvent(mockFormEvent, t),
            )

            expect(result.current.isSentByMe).toBe(false)
            expect(result.current.actionButton).toBeUndefined()
            expect(result.current.options).toHaveLength(0)
        })

        it('should handle null/undefined values in content', () => {
            const { t } = mockUseTranslation()
            mockSelectorValues({
                selectMatrixAuth: { userId },
            })

            const mockFormEvent = createMockFormEvent({
                content: {
                    type: 'radio',
                    body: null,
                    i18nKeyLabel: null,
                    options: [
                        { value: 'test', label: null, i18nKeyLabel: null },
                    ],
                },
                senderId: chatbotUserId,
            })

            const { result } = renderHook(() =>
                useMatrixFormEvent(mockFormEvent, t),
            )

            expect(result.current.isSentByMe).toBe(false)
            expect(result.current.messageText).toBe('')
            expect(result.current.actionButton).toBeUndefined()
            expect(result.current.options).toHaveLength(1)
            expect(result.current.options[0].label).toBe('')
        })
    })
})
