import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { createMockFederationPreview } from '@fedi/common/tests/mock-data/federation'
import { createMockFederationInviteEvent } from '@fedi/common/tests/mock-data/matrix-event'

import { ChatFederationInviteEvent } from '../../../../src/components/Chat/ChatFederationInviteEvent'
import i18n from '../../../../src/localization/i18n'

const mockPush = jest.fn()
jest.mock('next/router', () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}))

const mockCopy = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../../src/hooks/util', () => ({
    ...jest.requireActual('../../../../src/hooks/util'),
    useCopy: () => ({
        copy: mockCopy,
    }),
}))

// Create a mock implementation for useFederationInviteCode
const mockHandleJoin = jest.fn().mockResolvedValue(undefined)
const mockUseFederationInviteCode = jest.fn()

jest.mock('@fedi/common/hooks/federation', () => ({
    ...jest.requireActual('@fedi/common/hooks/federation'),
    useFederationInviteCode: (...args: unknown[]) =>
        mockUseFederationInviteCode(...args),
}))

// Mock text events for different scenarios
const mockInviteEvent = createMockFederationInviteEvent()
const mockFederationPreview = createMockFederationPreview({
    name: 'Test Federation',
})

describe('/components/Chat/ChatFederationInviteEvent', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockPush.mockClear()
        // Default mock implementation - loading state
        mockUseFederationInviteCode.mockReturnValue({
            isChecking: true,
            isError: false,
            isJoining: false,
            previewResult: null,
            handleJoin: mockHandleJoin,
        })
    })

    describe('isMe prop', () => {
        beforeEach(() => {
            mockUseFederationInviteCode.mockReturnValue({
                isChecking: false,
                isError: false,
                isJoining: false,
                previewResult: {
                    preview: mockFederationPreview,
                    isMember: true,
                },
                handleJoin: mockHandleJoin,
            })
        })

        it('should render with isMe=true', () => {
            render(
                <ChatFederationInviteEvent
                    event={mockInviteEvent}
                    isMe={true}
                />,
            )
            expect(
                screen.getByText(mockFederationPreview.name),
            ).toBeInTheDocument()
        })

        it('should render with isMe=false', () => {
            render(
                <ChatFederationInviteEvent
                    event={mockInviteEvent}
                    isMe={false}
                />,
            )
            expect(
                screen.getByText(mockFederationPreview.name),
            ).toBeInTheDocument()
        })

        it('should render without isMe prop (defaults to false styling)', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            expect(
                screen.getByText(mockFederationPreview.name),
            ).toBeInTheDocument()
        })
    })

    describe('when loading (isChecking: true)', () => {
        it('should display the fallback with title and invite code', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            expect(
                screen.getByText(i18n.t('feature.chat.federation-invite')),
            ).toBeInTheDocument()
            expect(
                screen.getByText(mockInviteEvent.content.body),
            ).toBeInTheDocument()
        })

        it('should show copy button', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            expect(
                screen.getByRole('button', {
                    name: i18n.t('phrases.copy-invite-code'),
                }),
            ).toBeInTheDocument()
        })
    })

    describe('when error occurs (isError: true)', () => {
        beforeEach(() => {
            mockUseFederationInviteCode.mockReturnValue({
                isChecking: false,
                isError: true,
                isJoining: false,
                previewResult: null,
                handleJoin: mockHandleJoin,
            })
        })

        it('should display the fallback with invite code', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            expect(
                screen.getByText(mockInviteEvent.content.body),
            ).toBeInTheDocument()
        })
    })

    describe('when preview is loaded', () => {
        beforeEach(() => {
            mockUseFederationInviteCode.mockReturnValue({
                isChecking: false,
                isError: false,
                isJoining: false,
                previewResult: {
                    preview: mockFederationPreview,
                    isMember: false,
                },
                handleJoin: mockHandleJoin,
            })
        })

        it('should display the federation name', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            expect(
                screen.getByText(mockFederationPreview.name),
            ).toBeInTheDocument()
        })

        it('should display truncated invite code', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            // The invite code should be truncated to 30 characters + "..."
            const truncatedCode =
                mockInviteEvent.content.body.slice(0, 30) + '...'
            expect(screen.getByText(truncatedCode)).toBeInTheDocument()
        })

        it('should show Join button when not a member', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            const joinButton = screen.getByRole('button', {
                name: i18n.t('words.join'),
            })
            expect(joinButton).toBeInTheDocument()
            expect(joinButton).not.toBeDisabled()
        })

        it('should show Copy invite code button', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            expect(
                screen.getByRole('button', {
                    name: i18n.t('phrases.copy-invite-code'),
                }),
            ).toBeInTheDocument()
        })

        it('should copy invite code when copy button is clicked', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            const copyButton = screen.getByRole('button', {
                name: i18n.t('phrases.copy-invite-code'),
            })
            fireEvent.click(copyButton)
            expect(mockCopy).toHaveBeenCalledWith(mockInviteEvent.content.body)
        })
    })

    describe('when user is already a member (isMember: true)', () => {
        beforeEach(() => {
            mockUseFederationInviteCode.mockReturnValue({
                isChecking: false,
                isError: false,
                isJoining: false,
                previewResult: {
                    preview: mockFederationPreview,
                    isMember: true,
                },
                handleJoin: mockHandleJoin,
            })
        })

        it('should show "Joined" button that does not navigate when clicked', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            const joinedButton = screen.getByRole('button', {
                name: i18n.t('words.joined'),
            })
            expect(joinedButton).toBeInTheDocument()

            // The button should be functionally disabled (clicking does nothing)
            fireEvent.click(joinedButton)
            // Should NOT navigate
            expect(mockPush).not.toHaveBeenCalled()
        })

        it('should display membership status text', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            expect(
                screen.getByText(
                    i18n.t('phrases.you-are-a-member', {
                        federationName: mockFederationPreview.name,
                    }),
                ),
            ).toBeInTheDocument()
        })

        it('should still allow copying the invite code', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            const copyButton = screen.getByRole('button', {
                name: i18n.t('phrases.copy-invite-code'),
            })
            expect(copyButton).not.toBeDisabled()
            fireEvent.click(copyButton)
            expect(mockCopy).toHaveBeenCalledWith(mockInviteEvent.content.body)
        })
    })

    describe('join navigation', () => {
        beforeEach(() => {
            mockUseFederationInviteCode.mockReturnValue({
                isChecking: false,
                isError: false,
                isJoining: false,
                previewResult: {
                    preview: mockFederationPreview,
                    isMember: false,
                },
                handleJoin: mockHandleJoin,
            })
        })

        it('should navigate to join page when Join button is clicked', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            const joinButton = screen.getByRole('button', {
                name: i18n.t('words.join'),
            })
            fireEvent.click(joinButton)

            // Should navigate to the onboarding join page with the invite code
            expect(mockPush).toHaveBeenCalledWith(
                `/onboarding/join?id=${mockInviteEvent.content.body}`,
            )
        })
    })
})
