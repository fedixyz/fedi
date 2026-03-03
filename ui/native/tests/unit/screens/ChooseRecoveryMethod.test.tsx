import { cleanup, screen, userEvent } from '@testing-library/react-native'

import i18n from '../../../localization/i18n'
import ChooseRecoveryMethod from '../../../screens/ChooseRecoveryMethod'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

describe('/screens/ChooseRecoveryMethod', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    describe('When the screen loads', () => {
        it('should render the correct text and buttons', async () => {
            renderWithProviders(
                <ChooseRecoveryMethod
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
            )

            const personalRecoveryTitle = screen.getByText(
                i18n.t('feature.recovery.personal-recovery'),
            )
            const socialRecoveryTitle = screen.getByText(
                i18n.t('feature.recovery.social-recovery'),
            )

            expect(personalRecoveryTitle).toBeOnTheScreen()
            expect(socialRecoveryTitle).toBeOnTheScreen()
        })
    })

    describe('When the personal recovery button is clicked', () => {
        it('should navigate the user to PersonalRecovery', async () => {
            renderWithProviders(
                <ChooseRecoveryMethod
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
            )

            const personalRecoveryButton = screen.getByText(
                i18n.t('feature.recovery.start-personal-recovery'),
            )

            await user.press(personalRecoveryButton)

            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'PersonalRecovery',
            )
        })
    })

    describe('When the social recovery button is clicked', () => {
        it('should navigate the user to LocateSocialRecovery', async () => {
            renderWithProviders(
                <ChooseRecoveryMethod
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
            )

            const socialRecoveryButton = screen.getByText(
                i18n.t('feature.recovery.start-social-recovery'),
            )

            await user.press(socialRecoveryButton)

            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'LocateSocialRecovery',
            )
        })
    })
})
