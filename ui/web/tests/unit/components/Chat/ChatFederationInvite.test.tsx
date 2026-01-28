import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { createMockFederationPreview } from '@fedi/common/tests/mock-data/federation'
import { createMockFederationInviteEvent } from '@fedi/common/tests/mock-data/matrix-event'

import { ChatFederationInviteEvent } from '../../../../src/components/Chat/ChatFederationInviteEvent'
import i18n from '../../../../src/localization/i18n'

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
    usePopupFederationInfo: () => null,
}))

// Mock useCommonSelector - tracks which federation IDs user has joined
let mockJoinedFederationIds: string[] = []
jest.mock('@fedi/common/hooks/redux', () => ({
    ...jest.requireActual('@fedi/common/hooks/redux'),
    useCommonSelector: (selector: (state: unknown) => unknown) => {
        // The selector checks if federation ID is in the list
        // We simulate this by returning whether the ID is in our mock list
        if (typeof selector === 'function') {
            // Create a mock state that selectFederationIds can work with
            const mockState = {
                federation: {
                    federations: mockJoinedFederationIds.map(id => ({
                        id,
                        init_state: 'ready',
                    })),
                },
            }
            return selector(mockState)
        }
        return false
    },
}))

// Mock text events for different scenarios
const mockInviteEvent = createMockFederationInviteEvent()
const mockFederationPreview = createMockFederationPreview({
    name: 'Test Federation',
})

describe('/components/Chat/ChatFederationInviteEvent', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockJoinedFederationIds = []
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
            // Set up as member via Redux mock
            mockJoinedFederationIds = [mockFederationPreview.id]
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
            mockJoinedFederationIds = [] // Not a member
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

        it('should display invite code with CSS truncation', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            // Full invite code is rendered; CSS handles visual truncation
            expect(
                screen.getByText(mockInviteEvent.content.body),
            ).toBeInTheDocument()
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

    describe('when user is already a member', () => {
        beforeEach(() => {
            // Set up as member via Redux mock
            mockJoinedFederationIds = [mockFederationPreview.id]
            mockUseFederationInviteCode.mockReturnValue({
                isChecking: false,
                isError: false,
                isJoining: false,
                previewResult: {
                    preview: mockFederationPreview,
                    isMember: false, // This is ignored, Redux selector is used
                },
                handleJoin: mockHandleJoin,
            })
        })

        it('should show "Joined" button that does not open dialog when clicked', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            const joinedButton = screen.getByRole('button', {
                name: i18n.t('words.joined'),
            })
            expect(joinedButton).toBeInTheDocument()

            // Button should be visually disabled (Stitches uses CSS variant, not HTML attribute)
            expect(joinedButton.className).toContain('disabled')

            // Clicking should not open the dialog
            fireEvent.click(joinedButton)
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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

    describe('join dialog', () => {
        beforeEach(() => {
            mockJoinedFederationIds = [] // Not a member
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

        it('should open dialog when Join button is clicked', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            const joinButton = screen.getByRole('button', {
                name: i18n.t('words.join'),
            })
            fireEvent.click(joinButton)

            // Dialog should be open - check for dialog role
            expect(screen.getByRole('dialog')).toBeInTheDocument()
        })

        it('should call handleJoin when confirming in dialog', async () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)

            // Open the dialog
            const joinButton = screen.getByRole('button', {
                name: i18n.t('words.join'),
            })
            fireEvent.click(joinButton)

            // Wait for dialog to be open
            await waitFor(() => {
                expect(screen.getByRole('dialog')).toBeInTheDocument()
            })

            // Find the join federation button in the dialog by its text
            const confirmButtons = screen.getAllByRole('button')
            const confirmButton = confirmButtons.find(btn =>
                btn.textContent?.includes(i18n.t('phrases.join-federation')),
            )
            expect(confirmButton).toBeTruthy()
            fireEvent.click(confirmButton!)

            await waitFor(() => {
                expect(mockHandleJoin).toHaveBeenCalled()
            })
        })

        it('should close dialog when close button is clicked', async () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)

            // Open the dialog
            const joinButton = screen.getByRole('button', {
                name: i18n.t('words.join'),
            })
            fireEvent.click(joinButton)

            // Verify dialog is open
            expect(screen.getByRole('dialog')).toBeInTheDocument()

            // Find and click the close button (the X button in the dialog)
            const dialog = screen.getByRole('dialog')
            const closeButton = dialog.querySelector('button[type="button"]')
            if (closeButton) {
                fireEvent.click(closeButton)
            }

            // Dialog should be closed
            await waitFor(() => {
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
            })
        })
    })
})
