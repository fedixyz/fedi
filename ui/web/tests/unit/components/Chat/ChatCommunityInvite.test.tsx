import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { createMockCommunityPreview } from '@fedi/common/tests/mock-data/federation'
import { createMockCommunityInviteEvent } from '@fedi/common/tests/mock-data/matrix-event'

import { ChatCommunityInviteEvent } from '../../../../src/components/Chat/ChatCommunityInviteEvent'
import i18n from '../../../../src/localization/i18n'

const mockCopy = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../../src/hooks/util', () => ({
    ...jest.requireActual('../../../../src/hooks/util'),
    useCopy: () => ({
        copy: mockCopy,
    }),
}))

// Create a mock implementation for useCommunityInviteCode
const mockHandleJoin = jest.fn().mockResolvedValue(undefined)
const mockUseCommunityInviteCode = jest.fn()

jest.mock('@fedi/common/hooks/federation', () => ({
    ...jest.requireActual('@fedi/common/hooks/federation'),
    useCommunityInviteCode: (code: string) => mockUseCommunityInviteCode(code),
    usePopupFederationInfo: () => null,
}))

// Mock useCommonSelector - tracks which community IDs user has joined
let mockJoinedCommunityIds: string[] = []
jest.mock('@fedi/common/hooks/redux', () => ({
    ...jest.requireActual('@fedi/common/hooks/redux'),
    useCommonSelector: (selector: (state: unknown) => unknown) => {
        if (typeof selector === 'function') {
            const mockState = {
                federation: {
                    communities: mockJoinedCommunityIds.map(id => ({
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

// Mock community invite event
const mockInviteEvent = createMockCommunityInviteEvent()
const mockCommunityPreview = createMockCommunityPreview({
    id: 'community-1',
    name: 'Test Community',
})

describe('/components/Chat/ChatCommunityInviteEvent', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockJoinedCommunityIds = []
        // Default mock implementation - loading state
        mockUseCommunityInviteCode.mockReturnValue({
            isFetching: true,
            preview: null,
            isJoining: false,
            handleJoin: mockHandleJoin,
        })
    })

    describe('when loading (isFetching: true)', () => {
        beforeEach(() => {
            mockUseCommunityInviteCode.mockReturnValue({
                joined: false,
                isFetching: true,
                preview: null,
                handleJoin: jest.fn(),
                isJoining: false,
            })
        })

        it('should display fallback UI with title', () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
            expect(
                screen.getByText(
                    i18n.t('feature.communities.community-invite'),
                ),
            ).toBeInTheDocument()
        })

        it('should display the full invite code', () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
            expect(
                screen.getByText(mockInviteEvent.content.body),
            ).toBeInTheDocument()
        })

        it('should show copy button', () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
            const button = screen.getByRole('button')
            expect(button).toHaveTextContent(i18n.t('phrases.copy-invite-code'))
        })
    })

    describe('when no preview available', () => {
        beforeEach(() => {
            mockUseCommunityInviteCode.mockReturnValue({
                joined: false,
                isFetching: false,
                preview: null,
                handleJoin: jest.fn(),
                isJoining: false,
            })
        })

        it('should display fallback UI', () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
            expect(
                screen.getByText(mockInviteEvent.content.body),
            ).toBeInTheDocument()
        })
    })

    describe('when preview is loaded', () => {
        beforeEach(() => {
            mockJoinedCommunityIds = [] // Not a member
            mockUseCommunityInviteCode.mockReturnValue({
                isFetching: false,
                preview: mockCommunityPreview,
                isJoining: false,
                handleJoin: mockHandleJoin,
            })
        })

        it('should display community name', () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
            expect(screen.getByText('Test Community')).toBeInTheDocument()
        })

        it('should display community invite label', () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
            expect(
                screen.getByText(
                    `${i18n.t('feature.communities.community-invite')}:`,
                ),
            ).toBeInTheDocument()
        })

        it('should display invite code with CSS truncation', () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
            // Full invite code is rendered; CSS handles visual truncation
            expect(
                screen.getByText(mockInviteEvent.content.body),
            ).toBeInTheDocument()
        })

        it('should show Join button when not a member', () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
            const joinButton = screen.getByRole('button', {
                name: i18n.t('words.join'),
            })
            expect(joinButton).toBeInTheDocument()
            expect(joinButton).not.toBeDisabled()
        })

        it('should show Copy invite code button', () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
            expect(
                screen.getByRole('button', {
                    name: i18n.t('phrases.copy-invite-code'),
                }),
            ).toBeInTheDocument()
        })

        it('should copy invite code when copy button is clicked', () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
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
            mockJoinedCommunityIds = [mockCommunityPreview.id]
            mockUseCommunityInviteCode.mockReturnValue({
                isFetching: false,
                preview: mockCommunityPreview,
                isJoining: false,
                handleJoin: mockHandleJoin,
            })
        })

        it('should show "Joined" button that does not open dialog when clicked', () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
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
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
            expect(
                screen.getByText(
                    i18n.t('phrases.you-are-a-member', {
                        federationName: 'Test Community',
                    }),
                ),
            ).toBeInTheDocument()
        })

        it('should still allow copying the invite code', () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
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
            mockJoinedCommunityIds = [] // Not a member
            mockUseCommunityInviteCode.mockReturnValue({
                isFetching: false,
                preview: mockCommunityPreview,
                isJoining: false,
                handleJoin: mockHandleJoin,
            })
        })

        it('should open dialog when Join button is clicked', () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
            const joinButton = screen.getByRole('button', {
                name: i18n.t('words.join'),
            })
            fireEvent.click(joinButton)

            expect(screen.getByRole('dialog')).toBeInTheDocument()
        })

        it('should call handleJoin when confirming in dialog', async () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)

            // Open the dialog
            const joinButton = screen.getByRole('button', {
                name: i18n.t('words.join'),
            })
            fireEvent.click(joinButton)

            await waitFor(() => {
                expect(screen.getByRole('dialog')).toBeInTheDocument()
            })

            const confirmButtons = screen.getAllByRole('button')
            const confirmButton = confirmButtons.find(btn =>
                btn.textContent?.includes(i18n.t('phrases.join-community')),
            )
            expect(confirmButton).toBeTruthy()
            fireEvent.click(confirmButton!)

            await waitFor(() => {
                expect(mockHandleJoin).toHaveBeenCalled()
            })
        })

        it('should close dialog when close button is clicked', async () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)

            // Open the dialog
            const joinButton = screen.getByRole('button', {
                name: i18n.t('words.join'),
            })
            fireEvent.click(joinButton)

            expect(screen.getByRole('dialog')).toBeInTheDocument()

            const dialog = screen.getByRole('dialog')
            const closeButton = dialog.querySelector('button[type="button"]')
            if (closeButton) {
                fireEvent.click(closeButton)
            }

            await waitFor(() => {
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
            })
        })
    })
})
