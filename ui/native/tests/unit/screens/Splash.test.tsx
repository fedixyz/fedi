import { cleanup, screen } from '@testing-library/react-native'

import i18n from '@fedi/native/localization/i18n'

import Splash from '../../../screens/Splash'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

describe('Splash screen', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should render 3 buttons on screen', async () => {
        renderWithProviders(
            <Splash
                navigation={mockNavigation as any}
                route={mockRoute as any}
            />,
        )

        const getWalletText = i18n.t('phrases.get-started')
        const getWalletButton = screen.getByText(getWalletText)
        expect(getWalletButton).toBeOnTheScreen()
        const recoverAccountText = i18n.t('phrases.recover-my-account')
        const recoverAccountButton = screen.getByText(recoverAccountText)
        expect(recoverAccountButton).toBeOnTheScreen()
        const askFediText = i18n.t('feature.support.title')
        const askFediButton = screen.getByText(askFediText)
        expect(askFediButton).toBeOnTheScreen()
    })
})
