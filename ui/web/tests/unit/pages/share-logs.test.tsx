import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
    setFederations,
    setCommunities,
    setupStore,
    setPayFromFederationId,
} from '@fedi/common/redux'
import {
    mockCommunity,
    mockFederation2,
} from '@fedi/common/tests/mock-data/federation'

import i18n from '../../../src/localization/i18n'
import ShareLogs from '../../../src/pages/share-logs'
import { renderWithProviders } from '../../utils/render'

const mockCollectAttachmentsAndSubmit = jest.fn(async () => true)
jest.mock('@fedi/web/src/hooks/export', () => ({
    ...jest.requireActual('@fedi/web/src/hooks/export'),
    useShareLogs: () => ({
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

    it('should render a text field and submit button on screen', async () => {
        renderWithProviders(<ShareLogs />)

        const ticketNumberText = i18n.t('feature.support.support-ticket-number')
        const ticketNumberInput = screen.getByPlaceholderText(ticketNumberText)
        expect(ticketNumberInput).toBeInTheDocument()

        const submitButton = screen.getByText('Submit')
        expect(submitButton).toBeInTheDocument()
    })

    it('should render the db dump indicator when the bug button is pressed 21 times', async () => {
        renderWithProviders(<ShareLogs />)

        const bugButton = screen.getByText('🪲')
        expect(bugButton).toBeInTheDocument()

        for (let i = 0; i < 22; i++) {
            await user.click(bugButton)
        }

        const dbDumpIndicator = screen.getByText(
            i18n.t('feature.bug.database-attached'),
            { exact: false },
        )
        expect(dbDumpIndicator).toBeInTheDocument()
    })

    it('should show the federation selector overlay if the active federation is a community AND the user has joined at least one federation', async () => {
        store.dispatch(setFederations([mockFederation2]))
        store.dispatch(setCommunities([mockCommunity]))
        store.dispatch(setPayFromFederationId('2'))
        renderWithProviders(<ShareLogs />, {
            store,
        })

        const input = screen.getByTestId('ticket-number-input')
        await user.type(input, '1234')

        const submitText = i18n.t('words.submit')
        const submitButton = screen.getByText(submitText)
        expect(submitButton).toBeInTheDocument()

        await user.click(submitButton)

        await waitFor(() =>
            // Expects two elements with the text "Select Federation"
            // The second element is visually hidden for accessibility reasons
            expect(
                screen.getAllByText(i18n.t('phrases.select-federation')),
            ).toHaveLength(2),
        )

        const federationWalletSelector = screen.getByLabelText(
            'federation-selector',
        )
        const continueButton = screen.getByText(i18n.t('words.continue'))
        expect(federationWalletSelector).toBeInTheDocument()
        expect(continueButton).toBeInTheDocument()
    })

    it("should allow the user to submit logs if they haven't joined a federation", async () => {
        renderWithProviders(<ShareLogs />)

        const input = screen.getByTestId('ticket-number-input')
        await user.type(input, '1234')

        const submitText = i18n.t('words.submit')
        const submitButton = screen.getByText(submitText)

        expect(submitButton).toBeInTheDocument()
        expect(submitButton).not.toBeDisabled()

        await user.click(submitButton)

        await waitFor(() =>
            expect(mockCollectAttachmentsAndSubmit).toHaveBeenCalled(),
        )
    })
})
