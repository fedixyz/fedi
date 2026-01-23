import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

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

const mockPush = jest.fn()
jest.mock('next/router', () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}))

const mockUseCommunityInviteCode = jest.fn()
jest.mock('@fedi/common/hooks/federation', () => ({
    ...jest.requireActual('@fedi/common/hooks/federation'),
    useCommunityInviteCode: (code: string) => mockUseCommunityInviteCode(code),
}))

// Mock community invite event
const mockInviteEvent = createMockCommunityInviteEvent()
const mockCommunityPreview = createMockCommunityPreview({
    id: 'community-1',
    name: 'Test Community',
})

describe('/components/Chat/ChatCommunityInviteEvent', () => {
    beforeEach(() => {
        jest.resetAllMocks()
        mockCopy.mockResolvedValue(undefined)
        mockUseCommunityInviteCode.mockReturnValue({
            joined: false,
            isFetching: false,
            preview: mockCommunityPreview,
            handleJoin: jest.fn(),
            isJoining: false,
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

        it('should display Join and Copy buttons', () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
            const buttons = screen.getAllByRole('button')
            expect(buttons).toHaveLength(2)
            expect(buttons[0]).toHaveTextContent(i18n.t('words.join'))
            expect(buttons[1]).toHaveTextContent(
                i18n.t('phrases.copy-invite-code'),
            )
        })
    })

    describe('when user is already a member', () => {
        beforeEach(() => {
            mockUseCommunityInviteCode.mockReturnValue({
                joined: true,
                isFetching: false,
                preview: mockCommunityPreview,
                handleJoin: jest.fn(),
                isJoining: false,
            })
        })

        it('should display membership text', () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
            expect(
                screen.getByText(
                    i18n.t('phrases.you-are-a-member', {
                        federationName: 'Test Community',
                    }),
                ),
            ).toBeInTheDocument()
        })

        it('should show Joined button with disabled styling', () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)
            const buttons = screen.getAllByRole('button')
            const joinButton = buttons[0]
            expect(joinButton).toHaveTextContent(i18n.t('words.joined'))
            // Button component uses CSS class for disabled state
            expect(joinButton.className).toMatch(/disabled-true/)
        })
    })

    describe('when Join button is clicked', () => {
        it('should navigate to onboarding join route', async () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)

            const buttons = screen.getAllByRole('button')
            const joinButton = buttons[0]
            joinButton.click()

            expect(mockPush).toHaveBeenCalledWith(
                `/onboarding/join?id=${mockInviteEvent.content.body}`,
            )
        })
    })

    describe('when Copy button is clicked', () => {
        it('should call the copy function with invite code', async () => {
            render(<ChatCommunityInviteEvent event={mockInviteEvent} />)

            const buttons = screen.getAllByRole('button')
            const copyButton = buttons[1]
            copyButton.click()

            expect(mockCopy).toHaveBeenCalledWith(mockInviteEvent.content.body)
        })
    })
})
