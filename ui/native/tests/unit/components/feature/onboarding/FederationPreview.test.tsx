import { cleanup, screen, userEvent } from '@testing-library/react-native'
import { Linking } from 'react-native'

import { FEDERATION_TERMS_URL } from '@fedi/common/constants/tos'
import { createMockFederationPreview } from '@fedi/common/tests/mock-data/federation'

import FederationPreview from '../../../../../components/feature/onboarding/FederationPreview'
import i18n from '../../../../../localization/i18n'
import { renderWithProviders } from '../../../../utils/render'

describe('components/feature/onboarding/FederationPreview', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it.each([FEDERATION_TERMS_URL, 'https://example.com/custom-terms'])(
        'should show and open the published terms %s before joining',
        async url => {
            const user = userEvent.setup()
            const openUrl = jest
                .spyOn(Linking, 'openURL')
                .mockResolvedValue(undefined)
            renderWithProviders(
                <FederationPreview
                    federation={createMockFederationPreview({
                        meta: { 'fedi:tos_url': url },
                    })}
                    onJoin={() => Promise.resolve()}
                    onBack={() => {}}
                    isJoining={false}
                />,
            )
            await user.press(screen.getByText(url))
            expect(openUrl).toHaveBeenCalledWith(url)
            expect(
                screen.getByRole('button', {
                    name: i18n.t('feature.onboarding.i-accept'),
                }),
            ).toBeOnTheScreen()
            openUrl.mockRestore()
        },
    )

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
