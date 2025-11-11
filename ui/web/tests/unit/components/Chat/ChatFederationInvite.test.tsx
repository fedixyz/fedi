import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { createMockFederationInviteEvent } from '@fedi/common/tests/mock-data/matrix-event'

import { ChatFederationInviteEvent } from '../../../../src/components/Chat/ChatFederationInviteEvent'
import i18n from '../../../../src/localization/i18n'

const mockCopy = jest.fn()
jest.mock('../../../../src/hooks/util', () => ({
    ...jest.requireActual('../../../../src/hooks/util'),
    useCopy: () => ({
        copy: mockCopy,
    }),
}))

// Mock text events for different scenarios
const mockInviteEvent = createMockFederationInviteEvent()

describe('/components/Chat/ChatFederationInviteEvent', () => {
    beforeEach(() => {
        jest.resetAllMocks()
    })

    describe('when rendering content', () => {
        it('should display the title', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            expect(screen.getByText(i18n.t('feature.chat.federation-invite')))
        })

        it('should display the invite code', () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)
            expect(
                screen.getByText(mockInviteEvent.content.body),
            ).toBeInTheDocument()
        })
    })

    describe('when the copy invite button is clicked', () => {
        it('should call the copy function', async () => {
            render(<ChatFederationInviteEvent event={mockInviteEvent} />)

            const button = screen.getByRole('button')
            button.click()

            expect(mockCopy).toHaveBeenCalledWith(mockInviteEvent.content.body)
        })
    })
})
