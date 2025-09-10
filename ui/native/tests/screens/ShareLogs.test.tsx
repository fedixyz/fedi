import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import {
    setActiveFederationId,
    setFederations,
    setupStore,
} from '@fedi/common/redux'
import {
    mockCommunity,
    mockFederation2,
} from '@fedi/common/tests/mock-data/federation'
import i18n from '@fedi/native/localization/i18n'

import ShareLogs from '../../screens/ShareLogs'
import { mockNavigation, mockRoute } from '../setup/jest.setup.mocks'
import { renderWithProviders } from '../utils/render'

const mockCollectAttachmentsAndSubmit = jest.fn(async () => true)

jest.mock('@fedi/native/utils/hooks/export', () => ({
    ...jest.requireActual('@fedi/native/utils/hooks/export'),
    useSubmitLogs: () => ({
        collectAttachmentsAndSubmit: mockCollectAttachmentsAndSubmit,
        status: 'idle',
    }),
}))

describe('ShareLogs screen', () => {
    let store: ReturnType<typeof setupStore>
    const user = userEvent.setup()

    beforeAll(() => {
        store = setupStore()
    })

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

        for (let i = 0; i < 22; i++) {
            await user.press(bugButton)
        }

        const dbDumpIndicator = screen.getByText(
            i18n.t('feature.bug.database-attached'),
            { exact: false },
        )
        expect(dbDumpIndicator).toBeOnTheScreen()
    })

    it('should show the federation selector overlay if the active federation is a community AND the user has joined at least one federation', async () => {
        store.dispatch(setFederations([mockFederation2, mockCommunity]))
        store.dispatch(setActiveFederationId('1'))
        renderWithProviders(
            <ShareLogs
                navigation={mockNavigation as any}
                route={
                    { ...mockRoute, params: { ticketNumber: '1234' } } as any
                }
            />,
            {
                store,
            },
        )

        const submitButton = screen.getByTestId('submit')
        expect(submitButton).toBeOnTheScreen()

        await user.press(submitButton)

        await waitFor(() =>
            expect(screen.getByTestId('RNE__Overlay')).toBeOnTheScreen(),
        )

        const continueButton = screen.getByText(i18n.t('words.continue'))
        const federationWalletSelector = screen.getByTestId(
            'federation-wallet-selector',
        )

        expect(federationWalletSelector).toBeOnTheScreen()
        expect(continueButton).toBeOnTheScreen()
    })

    it("should allow the user to submit logs if they haven't joined a federation", async () => {
        renderWithProviders(
            <ShareLogs
                navigation={mockNavigation as any}
                route={
                    { ...mockRoute, params: { ticketNumber: '1234' } } as any
                }
            />,
        )

        const submitButton = screen.getByTestId('submit')

        expect(submitButton).toBeOnTheScreen()
        expect(submitButton).not.toBeDisabled()

        await user.press(submitButton)

        await waitFor(() =>
            expect(mockCollectAttachmentsAndSubmit).toHaveBeenCalled(),
        )
    })
})
