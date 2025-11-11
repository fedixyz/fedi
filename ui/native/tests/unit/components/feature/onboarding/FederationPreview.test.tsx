import { cleanup, screen } from '@testing-library/react-native'

import { createMockFederationPreview } from '@fedi/common/tests/mock-data/federation'

import FederationPreview from '../../../../../components/feature/onboarding/FederationPreview'
import { renderWithProviders } from '../../../../utils/render'

describe('components/feature/onboarding/FederationPreview', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    describe('when the component is rendered with a federation that has a welcome message', () => {
        it('should render the welcome message container', async () => {
            const federation = createMockFederationPreview({
                meta: {
                    welcome_message: 'Welcome to our test federation!',
                },
            })

            renderWithProviders(
                <FederationPreview
                    federation={federation}
                    onJoin={() => Promise.resolve()}
                    onBack={() => {}}
                    isJoining={false}
                />,
            )

            const welcomeMessageContainer = await screen.findByTestId(
                'WelcomeMessageContainer',
            )
            expect(welcomeMessageContainer).toBeTruthy()
            expect(welcomeMessageContainer).toBeOnTheScreen()
            expect(welcomeMessageContainer).toHaveTextContent(
                'Welcome to our test federation!',
            )
        })
    })

    describe('when the component is rendered with a federation without a welcome message', () => {
        it('should not render the welcome message container at all', () => {
            const federation = createMockFederationPreview()

            renderWithProviders(
                <FederationPreview
                    federation={federation}
                    onJoin={() => Promise.resolve()}
                    onBack={() => {}}
                    isJoining={false}
                />,
            )

            const welcomeMessageContainer = screen.queryByTestId(
                'WelcomeMessageContainer',
            )
            expect(welcomeMessageContainer).toBeNull()
        })
    })
})
