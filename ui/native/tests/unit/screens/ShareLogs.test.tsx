import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import {
    setFederations,
    setPayFromFederationId,
    setupStore,
} from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import i18n from '@fedi/native/localization/i18n'

import ShareLogs from '../../../screens/ShareLogs'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

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

    describe('should include federation secret checkbox', () => {
        const enableSendDb = async () => {
            const bugButton = screen.getByText('🪲')
            for (let i = 0; i < 22; i++) {
                await user.press(bugButton)
            }
        }

        const renderWithFederation = () => {
            store.dispatch(setFederations([mockFederation1]))
            store.dispatch(setPayFromFederationId(mockFederation1.id))
            renderWithProviders(
                <ShareLogs
                    navigation={mockNavigation as any}
                    route={
                        {
                            ...mockRoute,
                            params: { ticketNumber: '1234' },
                        } as any
                    }
                />,
                { store },
            )
            return store
        }

        it('should show checkbox and federation selector when sendDb is enabled and federations exist', async () => {
            renderWithFederation()
            await enableSendDb()

            const checkboxLabel = i18n.t(
                'feature.bug.include-federation-secret',
            )

            await waitFor(() => {
                expect(screen.getByText(checkboxLabel)).toBeOnTheScreen()
                expect(
                    screen.getByTestId('federation-wallet-selector'),
                ).toBeOnTheScreen()
            })
        })

        it('should not show checkbox when sendDb is enabled but no federations exist', async () => {
            renderWithProviders(
                <ShareLogs
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
            )
            await enableSendDb()

            const checkboxLabel = i18n.t(
                'feature.bug.include-federation-secret',
            )

            expect(screen.queryByText(checkboxLabel)).not.toBeOnTheScreen()
            expect(
                screen.queryByTestId('federation-wallet-selector'),
            ).not.toBeOnTheScreen()
        })

        it('should submit with includeFederationSecret=true when checkbox is checked', async () => {
            renderWithFederation()
            await enableSendDb()

            const checkboxLabel = i18n.t(
                'feature.bug.include-federation-secret',
            )

            await waitFor(() => {
                expect(screen.getByText(checkboxLabel)).toBeOnTheScreen()
            })

            await user.press(screen.getByText(checkboxLabel))

            const submitButton = screen.getByTestId('submit')
            await user.press(submitButton)

            await waitFor(() => {
                expect(mockCollectAttachmentsAndSubmit).toHaveBeenCalledWith(
                    true,
                    '1234',
                    true,
                )
            })
        })

        it('should submit with includeFederationSecret=false when checkbox is not checked', async () => {
            renderWithFederation()
            await enableSendDb()

            const checkboxLabel = i18n.t(
                'feature.bug.include-federation-secret',
            )

            await waitFor(() => {
                expect(screen.getByText(checkboxLabel)).toBeOnTheScreen()
            })

            // Submit without checking the checkbox
            const submitButton = screen.getByTestId('submit')
            await user.press(submitButton)

            await waitFor(() => {
                expect(mockCollectAttachmentsAndSubmit).toHaveBeenCalledWith(
                    true,
                    '1234',
                    false,
                )
            })
        })
    })
})
