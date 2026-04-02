import {
    act,
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import {
    fetchCurrencyPrices,
    setFederations,
    setIsInternetUnreachable,
    setPaymentType,
    setSelectedFederationId,
    setStabilityPoolState,
    setupStore,
} from '@fedi/common/redux'
import { setSimulateRecovery } from '@fedi/common/redux/federation'
import {
    mockFederation1,
    mockFederationWithSPV1,
    mockFederationWithSPV2,
} from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { PublicFederation } from '@fedi/common/types'
import { fetchAutoSelectFederations } from '@fedi/common/utils/FederationUtils'

import i18n from '../../../localization/i18n'
import Wallet from '../../../screens/Wallet'
import { LoadedFederation, MSats, UsdCents } from '../../../types'
import { mockNavigation, mockToast } from '../../setup/jest.setup.mocks'
import { renderWithBridge, renderWithProviders } from '../../utils/render'

jest.mock('@fedi/common/utils/FederationUtils', () => ({
    ...jest.requireActual('@fedi/common/utils/FederationUtils'),
    fetchAutoSelectFederations: jest.fn().mockResolvedValue([]),
}))

const mockAutoSelectFed: PublicFederation = {
    id: 'auto-fed-1',
    name: 'Auto Select Fed 1',
    meta: {
        public: 'true',
        invite_code: 'fed11auto1',
        federation_name: 'Auto Select Fed 1',
    },
}

const walletRoute = { name: 'Wallet' as const, key: 'Wallet' }

describe('Wallet screen', () => {
    const user = userEvent.setup()
    const fedimint = createMockFedimintBridge({
        spv2SubscribeAccountInfo: jest.fn(),
    })
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        jest.clearAllMocks()
        store = setupStore()
    })

    afterEach(() => {
        cleanup()
    })

    describe('no federations joined', () => {
        it('should render the setup options with auto-select and manual paths', () => {
            renderWithProviders(
                <Wallet
                    route={walletRoute}
                    navigation={mockNavigation as any}
                />,
                { store },
            )

            expect(
                screen.queryByText(i18n.t('feature.wallet.setup-title')),
            ).toBeOnTheScreen()
            expect(screen.getByTestId('AutoSelectButton')).toBeOnTheScreen()
            expect(screen.getByTestId('ManualSetupButton')).toBeOnTheScreen()
        })

        it('should navigate to PublicFederations when Manual Setup is pressed', async () => {
            renderWithProviders(
                <Wallet
                    route={walletRoute}
                    navigation={mockNavigation as any}
                />,
                { store },
            )

            await user.press(screen.getByTestId('ManualSetupButton'))

            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'PublicFederations',
            )
        })

        it('should navigate to JoinFederation with invite when Auto-Select is pressed', async () => {
            ;(fetchAutoSelectFederations as jest.Mock).mockResolvedValue([
                mockAutoSelectFed,
            ])

            renderWithProviders(
                <Wallet
                    route={walletRoute}
                    navigation={mockNavigation as any}
                />,
                { store },
            )

            await waitFor(() => {
                expect(screen.getByTestId('AutoSelectButton')).toBeOnTheScreen()
            })

            await user.press(screen.getByTestId('AutoSelectButton'))

            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'JoinFederation',
                { invite: 'fed11auto1' },
            )
        })

        it('should show error toast when Auto-Select is pressed but no federations are available', async () => {
            ;(fetchAutoSelectFederations as jest.Mock).mockResolvedValue([])

            renderWithProviders(
                <Wallet
                    route={walletRoute}
                    navigation={mockNavigation as any}
                />,
                { store },
            )

            await user.press(screen.getByTestId('AutoSelectButton'))

            expect(mockToast.show).toHaveBeenCalledWith({
                content: i18n.t('errors.failed-to-select-wallet-service'),
                status: 'error',
            })
            expect(mockNavigation.navigate).not.toHaveBeenCalled()
        })
    })

    describe('federation joined', () => {
        it('should not show setup options when a federation is joined', async () => {
            store.dispatch(setFederations([mockFederation1]))
            renderWithProviders(
                <Wallet
                    route={walletRoute}
                    navigation={mockNavigation as any}
                />,
                { store },
            )

            expect(
                screen.queryByText(i18n.t('feature.wallet.setup-title')),
            ).not.toBeOnTheScreen()

            const header = screen.getByTestId(
                `${mockFederation1.name.replaceAll(' ', '')}DetailsButton`,
            )
            await user.press(header)

            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'FederationDetails',
                {
                    federationId: mockFederation1.id,
                },
            )
        })

        it('pressing the transaction history button should navigate to transactions screen', async () => {
            store.dispatch(setFederations([mockFederation1]))
            store.dispatch(setSelectedFederationId(mockFederation1.id))
            renderWithProviders(
                <Wallet
                    route={{
                        name: 'Wallet',
                        key: 'Wallet',
                    }}
                    navigation={mockNavigation as any}
                />,
                { store },
            )

            const transactionHistoryButton = screen.getByTestId(
                'BalanceCard__TransactionHistory',
            )

            await user.press(transactionHistoryButton)

            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'Transactions',
                {
                    federationId: mockFederation1.id,
                },
            )
        })

        it('should render the tab switcher if stability pool is enabled', async () => {
            store.dispatch(setFederations([mockFederationWithSPV1]))
            store.dispatch(setSelectedFederationId(mockFederationWithSPV1.id))
            renderWithProviders(
                <Wallet
                    route={{
                        name: 'Wallet',
                        key: 'Wallet',
                    }}
                    navigation={mockNavigation as any}
                />,
                { store },
            )

            const bitcoinTab = screen.getByTestId('bitcoinTab')
            const stableBalanceTab = screen.getByTestId('stable-balanceTab')

            expect(bitcoinTab).toBeOnTheScreen()
            expect(stableBalanceTab).toBeOnTheScreen()
        })

        it('[bitcoin tab selected] should navigate to the respective screen when the send and receive buttons are pressed', async () => {
            store.dispatch(setFederations([mockFederation1]))
            store.dispatch(setSelectedFederationId(mockFederation1.id))
            renderWithProviders(
                <Wallet
                    route={{
                        name: 'Wallet',
                        key: 'Wallet',
                    }}
                    navigation={mockNavigation as any}
                />,
                { store },
            )

            const sendButton = screen.getByText(i18n.t('words.send'))
            const receiveButton = screen.getByText(i18n.t('words.receive'))

            expect(sendButton).toBeOnTheScreen()
            expect(receiveButton).toBeOnTheScreen()

            await user.press(sendButton)
            expect(mockNavigation.navigate).toHaveBeenCalledWith('Send', {
                federationId: mockFederation1.id,
            })

            // When offline, the Send button should lead to SendOfflineAmount
            act(() => store.dispatch(setIsInternetUnreachable(true)))
            await user.press(sendButton)
            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'SendOfflineAmount',
            )

            await user.press(receiveButton)
            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'ReceiveBitcoin',
                {},
            )
        })

        it('[stability tab selected] should navigate to the respective screen when the send and receive buttons are pressed', async () => {
            store.dispatch(setFederations([mockFederationWithSPV2]))
            store.dispatch(setSelectedFederationId(mockFederationWithSPV2.id))
            renderWithBridge(
                <Wallet
                    route={{
                        name: 'Wallet',
                        key: 'Wallet',
                    }}
                    navigation={mockNavigation as any}
                />,
                { store, fedimint },
            )

            const stableBalanceTab = screen.getByTestId('stable-balanceTab')

            await user.press(stableBalanceTab)

            const sendButton = screen.getByText(i18n.t('words.send'))
            const receiveButton = screen.getByText(i18n.t('words.receive'))

            expect(sendButton).toBeOnTheScreen()
            expect(receiveButton).toBeOnTheScreen()

            await user.press(sendButton)

            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'StabilitySend',
                {
                    federationId: mockFederationWithSPV2.id,
                },
            )

            await user.press(receiveButton)
            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'StabilityReceive',
                {
                    federationId: mockFederationWithSPV2.id,
                },
            )
        })
    })

    describe('recovery in progress', () => {
        it('should disable send and receive buttons and show recovery message', () => {
            store.dispatch(setFederations([mockFederation1]))
            store.dispatch(setSelectedFederationId(mockFederation1.id))
            store.dispatch(
                setSimulateRecovery({
                    federationId: mockFederation1.id,
                    enabled: true,
                }),
            )
            renderWithProviders(
                <Wallet
                    route={{
                        name: 'Wallet',
                        key: 'Wallet',
                    }}
                    navigation={mockNavigation as any}
                />,
                { store },
            )

            const sendButton = screen.getByText(i18n.t('words.send'))
            const receiveButton = screen.getByText(i18n.t('words.receive'))

            expect(sendButton).toBeDisabled()
            expect(receiveButton).toBeDisabled()

            const recoveryMessage = screen.getByText(
                i18n.t('feature.recovery.recovery-in-progress-wallet'),
            )
            expect(recoveryMessage).toBeOnTheScreen()
        })
    })

    describe('button disabled states', () => {
        it('should disable the receive button and display the "receives-have-been-disabled" message if the user\'s bitcoin balance exceeds the federation limit', async () => {
            const federationWithMaxBalance = {
                ...mockFederation1,
                meta: {
                    ...mockFederation1.meta,
                    max_balance_msats: '1000000',
                },
                balance: 2000000 as MSats,
            } as LoadedFederation

            store.dispatch(setFederations([federationWithMaxBalance]))
            store.dispatch(setSelectedFederationId(federationWithMaxBalance.id))

            renderWithProviders(
                <Wallet
                    route={{
                        name: 'Wallet',
                        key: 'Wallet',
                    }}
                    navigation={mockNavigation as any}
                />,
                { store },
            )

            const receiveButton = screen.getByText(i18n.t('words.receive'))
            const sendButton = screen.getByText(i18n.t('words.send'))

            expect(receiveButton).toBeDisabled()
            expect(sendButton).not.toBeDisabled()

            const disabledMessage = screen.getByText(
                i18n.t('errors.receives-have-been-disabled'),
            )
            expect(disabledMessage).toBeOnTheScreen()
        })

        it('should disable the send and receive buttons if the federation has ended', async () => {
            const endedFederation = {
                ...mockFederation1,
                meta: {
                    ...mockFederation1.meta,
                    popup_end_timestamp: '1',
                },
            } as LoadedFederation

            store.dispatch(setFederations([endedFederation]))
            store.dispatch(setSelectedFederationId(endedFederation.id))

            renderWithProviders(
                <Wallet
                    route={{
                        name: 'Wallet',
                        key: 'Wallet',
                    }}
                    navigation={mockNavigation as any}
                />,
                { store },
            )

            const receiveButton = screen.getByText(i18n.t('words.receive'))
            const sendButton = screen.getByText(i18n.t('words.send'))

            expect(receiveButton).toBeDisabled()
            expect(sendButton).toBeDisabled()
        })

        it('should disable the receive button and display the "recovery in progress" message if the federation is recovering', async () => {
            const recoveringFederation = {
                ...mockFederation1,
                recovering: true,
            } as LoadedFederation

            store.dispatch(setFederations([recoveringFederation]))
            store.dispatch(setSelectedFederationId(recoveringFederation.id))

            const fedimintWithStability = createMockFedimintBridge({
                stabilityPoolWithdraw: jest.fn(),
            })

            renderWithBridge(
                <Wallet
                    route={{
                        name: 'Wallet',
                        key: 'Wallet',
                    }}
                    navigation={mockNavigation as any}
                />,
                { store, fedimint: fedimintWithStability },
            )

            const receiveButton = screen.getByText(i18n.t('words.receive'))
            const sendButton = screen.getByText(i18n.t('words.send'))

            expect(receiveButton).toBeDisabled()
            expect(sendButton).toBeDisabled()

            const disabledMessage = screen.getByText(
                i18n.t('feature.recovery.recovery-in-progress-wallet'),
            )
            expect(disabledMessage).toBeOnTheScreen()
        })

        it('should disable the receive button and display the "pending-withdrawal-blocking" message if the paymentType is stable-balance and the stable balance is blocked', async () => {
            store.dispatch({
                type: fetchCurrencyPrices.fulfilled.type,
                payload: {
                    btcUsdRate: 100000,
                    fiatUsdRates: {},
                },
            })
            store.dispatch(setFederations([mockFederationWithSPV2]))
            store.dispatch(setSelectedFederationId(mockFederationWithSPV2.id))
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

            const fedimintWithStability = createMockFedimintBridge({
                stabilityPoolWithdraw: jest.fn(),
                spv2SubscribeAccountInfo: jest.fn(),
            })

            renderWithBridge(
                <Wallet
                    route={{
                        name: 'Wallet',
                        key: 'Wallet',
                    }}
                    navigation={mockNavigation as any}
                />,
                { store, fedimint: fedimintWithStability },
            )

            // Switch to stable-balance tab
            act(() => store.dispatch(setPaymentType('stable-balance')))

            const receiveButton = screen.getByText(i18n.t('words.receive'))
            const sendButton = screen.getByText(i18n.t('words.send'))

            expect(receiveButton).toBeDisabled()
            expect(sendButton).toBeDisabled()

            const disabledMessage = screen.getByText(
                i18n.t('feature.stabilitypool.pending-withdrawal-blocking'),
            )
            expect(disabledMessage).toBeOnTheScreen()
        })

        it('should disable the send button if the user has less than 1000 msats in their wallet', async () => {
            // Create a federation with balance less than 1000 msats
            const lowBalanceFederation = {
                ...mockFederation1,
                balance: 500 as MSats, // 500 msats is less than 1000 msats
            } as LoadedFederation

            store.dispatch(setFederations([lowBalanceFederation]))
            store.dispatch(setSelectedFederationId(lowBalanceFederation.id))

            renderWithProviders(
                <Wallet
                    route={{
                        name: 'Wallet',
                        key: 'Wallet',
                    }}
                    navigation={mockNavigation as any}
                />,
                { store },
            )

            const receiveButton = screen.getByText(i18n.t('words.receive'))
            const sendButton = screen.getByText(i18n.t('words.send'))

            expect(sendButton).toBeDisabled()
            expect(receiveButton).not.toBeDisabled()
        })
    })
})
