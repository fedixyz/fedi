import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setupStore } from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'

import i18n from '../../../src/localization/i18n'
import FederationsPage from '../../../src/pages/federations'
import { AppState } from '../../../src/state/store'
import { renderWithProviders } from '../../utils/render'

const ratesSpy = jest.fn()
jest.mock('@fedi/common/hooks/currency.ts', () => ({
    ...jest.requireActual('@fedi/common/hooks/currency'),
    useSyncCurrencyRatesAndCache: () => ratesSpy,
}))

describe('/pages/federations', () => {
    let store: ReturnType<typeof setupStore>
    let state: AppState
    const user = userEvent.setup()

    beforeAll(() => {
        store = setupStore()
        state = store.getState()
    })

    describe('when the page loads', () => {
        beforeEach(() => {
            renderWithProviders(<FederationsPage />, {
                preloadedState: {
                    federation: {
                        ...state.federation,
                        federations: [mockFederation1],
                        recentlyUsedFederationIds: ['1'],
                    },
                },
            })
        })

        it('should display the correct page title', () => {
            const name = screen.getByText(i18n.t('words.wallets'))
            expect(name).toBeInTheDocument()
        })

        it('should display the featured federation name', async () => {
            const name = await screen.findByText('test-federation')
            expect(name).toBeInTheDocument()
        })

        it('should display the featured federation wallet', async () => {
            const wallet = await screen.findByTestId('bitcoin-wallet')
            expect(wallet).toBeInTheDocument()
        })
    })

    describe('when a wallet is recovering', () => {
        it('should display the recovery indicator', async () => {
            const recoveringFederation = {
                ...mockFederation1,
                recovering: true,
            }

            renderWithProviders(<FederationsPage />, {
                preloadedState: {
                    federation: {
                        ...state.federation,
                        federations: [recoveringFederation],
                        recentlyUsedFederationIds: ['1'],
                    },
                },
            })

            const recoveryInProgress = screen.getByLabelText(
                'recovery-in-progress',
            )

            expect(recoveryInProgress).toBeInTheDocument()
        })
    })

    describe('federation selector', () => {
        it('should display the menu icon in the header', async () => {
            renderWithProviders(<FederationsPage />, {
                preloadedState: {
                    federation: {
                        ...state.federation,
                        federations: [mockFederation1],
                        recentlyUsedFederationIds: ['1'],
                    },
                },
            })

            const menuIcon = screen.getByTestId(
                'MainHeaderButtons__HamburgerIcon',
            )

            expect(menuIcon).toBeInTheDocument()
        })

        it('should show the federation selector when the menu icon is clicked', async () => {
            renderWithProviders(<FederationsPage />, {
                preloadedState: {
                    federation: {
                        ...state.federation,
                        federations: [mockFederation1],
                        recentlyUsedFederationIds: ['1'],
                    },
                },
            })

            const menuIcon = screen.getByTestId(
                'MainHeaderButtons__HamburgerIcon',
            )

            await user.click(menuIcon)

            const selectFederationTitle = screen.getByLabelText(
                i18n.t('phrases.select-federation'),
            )

            expect(selectFederationTitle).toBeInTheDocument()
        })
    })
})
