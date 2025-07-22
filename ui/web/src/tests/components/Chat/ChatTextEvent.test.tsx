import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { createMockNonPaymentEvent } from '@fedi/common/tests/mock-data/matrix-event'

import { ChatTextEvent } from '../../../components/Chat/ChatTextEvent'

// Mock text events for different scenarios
const mockTextOnlyEvent = createMockNonPaymentEvent({
    content: {
        body: 'Hello world',
    },
})

const mockTextWithUrlEvent = createMockNonPaymentEvent({
    content: {
        body: 'Check out https://example.com for more info',
    },
})

const mockUrlOnlyEvent = createMockNonPaymentEvent({
    content: {
        body: 'https://example.com',
    },
})

describe('/components/Chat/ChatTextEvent', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('when rendering text-only content', () => {
        it('should display the text content', () => {
            render(<ChatTextEvent event={mockTextOnlyEvent} />)

            expect(screen.getByText('Hello world')).toBeInTheDocument()
        })
    })

    describe('when rendering text with URL', () => {
        it('should display both text and clickable link', () => {
            const { container } = render(
                <ChatTextEvent event={mockTextWithUrlEvent} />,
            )

            // Check that the full text content is present
            expect(container).toHaveTextContent(
                'Check out https://example.com for more info',
            )

            // Check that the link is properly rendered
            const link = screen.getByRole('link')
            expect(link).toBeInTheDocument()
            expect(link).toHaveAttribute('href', 'https://example.com')
            expect(link).toHaveAttribute('target', '_blank')
            expect(link).toHaveAttribute('rel', 'noopener noreferrer')
            expect(link).toHaveTextContent('https://example.com')
        })
    })

    describe('when rendering URL-only content', () => {
        it('should display the URL as a clickable link', () => {
            render(<ChatTextEvent event={mockUrlOnlyEvent} />)

            const link = screen.getByRole('link')
            expect(link).toBeInTheDocument()
            expect(link).toHaveAttribute('href', 'https://example.com')
            expect(link).toHaveAttribute('target', '_blank')
            expect(link).toHaveAttribute('rel', 'noopener noreferrer')
            expect(link).toHaveTextContent('https://example.com')
        })
    })
})
