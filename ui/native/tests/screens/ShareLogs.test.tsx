import { cleanup, screen, userEvent } from '@testing-library/react-native'

import i18n from '@fedi/native/localization/i18n'

import ShareLogs from '../../screens/ShareLogs'
import { mockNavigation, mockRoute } from '../setup/jest.setup.mocks'
import { renderWithProviders } from '../utils/render'

describe('ShareLogs screen', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should render a text field and submit button on screen', async () => {
        renderWithProviders(
            <ShareLogs
                navigation={mockNavigation as any}
                route={mockRoute as any}
            />,
        )

        const ticketNumberText = i18n.t('feature.support.support-ticket-number')
        const ticketNumberInput = screen.getByPlaceholderText(ticketNumberText)
        expect(ticketNumberInput).toBeOnTheScreen()

        const submitText = i18n.t('words.submit')
        const submitButton = screen.getByText(submitText)
        expect(submitButton).toBeOnTheScreen()
    })

    it('should render the db dump indicator when the bug button is pressed 21 times', async () => {
        renderWithProviders(
            <ShareLogs
                navigation={mockNavigation as any}
                route={mockRoute as any}
            />,
        )

        const bugButton = screen.getByText('🪲')
        expect(bugButton).toBeOnTheScreen()

        const user = userEvent.setup()
        for (let i = 0; i < 22; i++) {
            await user.press(bugButton)
        }
        const dbDumpIndicator = screen.getByText(
            i18n.t('feature.bug.database-attached'),
            { exact: false },
        )
        expect(dbDumpIndicator).toBeOnTheScreen()
    })
})
