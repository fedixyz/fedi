import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
    fetchCurrencyPrices,
    setFeatureFlags,
    setFederations,
    setPaymentType,
    setSelectedFederationId,
    setStabilityPoolState,
    setupStore,
} from '@fedi/common/redux'
import {
    mockFederation1,
    mockFederation2,
    mockFederationWithSPV2,
} from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { MSats, UsdCents } from '@fedi/common/types'
import { FeatureCatalog } from '@fedi/common/types/bindings'

import { mockUseRouter } from '../../../jest.setup'
import i18n from '../../../src/localization/i18n'
import WalletPage from '../../../src/pages/wallet'
import { AppState } from '../../../src/state/store'
import { renderWithProviders } from '../../utils/render'

const ratesSpy = jest.fn()
jest.mock('@fedi/common/hooks/currency.ts', () => ({
    ...jest.requireActual('@fedi/common/hooks/currency'),
    useSyncCurrencyRatesAndCache: () => ratesSpy,
}))

jest.mock('../../../src/hooks', () => ({
    ...jest.requireActual('../../../src/hooks'),
    useShowInstallPromptBanner: () => ({
        showInstallBanner: true,
        handleOnDismiss: jest.fn(),
    }),
}))

const featureFlags = {
    show_stable_balance_web: {},
} as FeatureCatalog

describe('/pages/wallet', () => {
    let store: ReturnType<typeof setupStore>
    let state: AppState
    const user = userEvent.setup()

    beforeAll(() => {
        store = setupStore()
        state = store.getState()
    })

    beforeEach(() => {
        mockUseRouter.push.mockClear()
    })

    describe('when the page loads', () => {
        beforeEach(() => {
            renderWithProviders(<WalletPage />, {
                preloadedState: {
                    federation: {
                        ...state.federation,
                        federations: [mockFederation1],
                        payFromFederationId: '1',
                    },
                },
            })
        })

        it('should display the correct page title', () => {
            const name = screen.getByText(i18n.t('words.wallet'))
            expect(name).toBeInTheDocument()
        })

        it('should display the featured federation name', async () => {
            const name = await screen.findByText('test-federation')
            expect(name).toBeInTheDocument()
        })

        it('should render the install banner component', async () => {
            const component = screen.getByLabelText('Install Banner')
            expect(component).toBeInTheDocument()
        })
    })

    describe('when a wallet is recovering', () => {
        it('should display the recovery indicator', async () => {
            const recoveringFederation = {
                ...mockFederation1,
                recovering: true,
            }

            renderWithProviders(<WalletPage />, {
                preloadedState: {
                    federation: {
                        ...state.federation,
                        federations: [recoveringFederation],
                        payFromFederationId: '1',
                    },
                },
            })

            const recoveryInProgress = screen.getByText(
                i18n.t('feature.recovery.recovery-in-progress-wallet'),
            )

            expect(recoveryInProgress).toBeInTheDocument()
        })
    })

    describe('federation selector', () => {
        it('should not display the menu icon in the header if there are less than 2 federations joined', async () => {
            renderWithProviders(<WalletPage />, {
                preloadedState: {
                    federation: {
                        ...state.federation,
                        federations: [mockFederation1],
                        payFromFederationId: '1',
                    },
                },
            })

            const menuIcon = screen.queryByTestId(
                'MainHeaderButtons__HamburgerIcon',
            )

            expect(menuIcon).not.toBeInTheDocument()
        })

        it('should display the menu icon in the header if 2 or more federations are joined', async () => {
            renderWithProviders(<WalletPage />, {
                preloadedState: {
                    federation: {
                        ...state.federation,
                        federations: [mockFederation1, mockFederation2],
                        payFromFederationId: '1',
                    },
                },
            })

            const menuIcon = screen.getByTestId(
                'MainHeaderButtons__HamburgerIcon',
            )

            expect(menuIcon).toBeInTheDocument()
        })

        it('should show the federation selector when the menu icon is clicked', async () => {
            renderWithProviders(<WalletPage />, {
                preloadedState: {
                    federation: {
                        ...state.federation,
                        federations: [mockFederation1, mockFederation2],
                        payFromFederationId: '1',
                    },
                },
            })

            const menuIcon = screen.getByTestId(
                'MainHeaderButtons__HamburgerIcon',
            )

            await user.click(menuIcon)

            const selectFederationTitle = screen.getByLabelText(
                i18n.t('phrases.select-wallet-service'),
            )

            expect(selectFederationTitle).toBeInTheDocument()
        })
    })

    describe('stable balance', () => {
        beforeEach(() => {
            store = setupStore()
            store.dispatch(setFeatureFlags(featureFlags))
            store.dispatch(setFederations([mockFederationWithSPV2]))
            store.dispatch(setSelectedFederationId(mockFederationWithSPV2.id))
        })

        it('should render the tab switcher if stability pool is enabled', async () => {
            renderWithProviders(<WalletPage />, { store })

            expect(screen.getAllByText(i18n.t('words.bitcoin'))).toHaveLength(2)
            expect(screen.getByText('USD')).toBeInTheDocument()
        })

        it('should update the balance card when the stable balance tab is selected', async () => {
            store.dispatch({
                type: fetchCurrencyPrices.fulfilled.type,
                payload: {
                    btcUsdRate: 100000,
                    fiatUsdRates: {},
                },
            })
            store.dispatch(
                setStabilityPoolState({
                    federationId: mockFederationWithSPV2.id,
                    stabilityPoolState: {
                        locked: {
                            btc: 0 as MSats,
                            fiat: 12345 as UsdCents,
                        },
                        staged: {
                            btc: 0 as MSats,
                            fiat: 2500 as UsdCents,
                        },
                        idleBalance: 0 as MSats,
                        pendingUnlock: null,
                        currCycleStartPrice: 10000000,
                    },
                }),
            )

            renderWithProviders(<WalletPage />, {
                store,
                fedimint: createMockFedimintBridge({
                    spv2AverageFeeRate: 0,
                    spv2AvailableLiquidity: 0 as MSats,
                }),
            })

            await user.click(screen.getByText('USD'))

            expect(screen.getByText('123.45 USD')).toBeInTheDocument()
            expect(
                screen.getByText(`25.00 USD ${i18n.t('words.pending')}`),
            ).toBeInTheDocument()
        })

        it('should disable send and receive when stable balance has a pending withdrawal', async () => {
            store.dispatch({
                type: fetchCurrencyPrices.fulfilled.type,
                payload: {
                    btcUsdRate: 100000,
                    fiatUsdRates: {},
                },
            })
            store.dispatch(
                setStabilityPoolState({
                    federationId: mockFederationWithSPV2.id,
                    stabilityPoolState: {
                        locked: { btc: 0 as MSats, fiat: 0 as UsdCents },
                        staged: { btc: 0 as MSats, fiat: 0 as UsdCents },
                        idleBalance: 0 as MSats,
                        pendingUnlock: {
                            btc: 1000000 as MSats,
                            fiat: 5000 as UsdCents,
                        },
                        currCycleStartPrice: 50000,
                    },
                }),
            )
            store.dispatch(setPaymentType('stable-balance'))

            renderWithProviders(<WalletPage />, {
                store,
                fedimint: createMockFedimintBridge({
                    spv2AverageFeeRate: 0,
                    spv2AvailableLiquidity: 0 as MSats,
                }),
            })

            expect(
                screen.getByText(
                    i18n.t('feature.stabilitypool.pending-withdrawal-blocking'),
                ),
            ).toBeInTheDocument()

            await user.click(screen.getByText(i18n.t('words.receive')))
            await user.click(screen.getByText(i18n.t('words.send')))

            expect(mockUseRouter.push).not.toHaveBeenCalled()
        })
    })
})
