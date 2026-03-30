import { act, screen, userEvent } from '@testing-library/react-native'
import { View as mockView } from 'react-native'

import {
    setFederations,
    setIsInternetUnreachable,
    setSelectedFederationId,
    setupStore,
} from '@fedi/common/redux'
import { setSimulateRecovery } from '@fedi/common/redux/federation'
import {
    mockFederation1,
    mockFederation2,
    mockFederationWithSPV1,
    mockFederationWithSPV2,
} from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'

import i18n from '../../../localization/i18n'
import Wallet from '../../../screens/Wallet'
import { resetToJoinFederation } from '../../../state/navigation'
import { LoadedFederation } from '../../../types'
import { mockNavigation } from '../../setup/jest.setup.mocks'
import { renderWithBridge, renderWithProviders } from '../../utils/render'

jest.mock('react-native-progress', () => {
    return { Circle: mockView }
})

describe('Wallet screen', () => {
    const user = userEvent.setup()
    const fedimint = createMockFedimintBridge({
        spv2SubscribeAccountInfo: jest.fn(),
    })
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        store = setupStore()
    })

    describe('no federations joined', () => {
        it('should render the empty state if there are no federations', () => {
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

            const noFederationsHeader = screen.queryByText(
                i18n.t('feature.federations.no-federations'),
            )
            const joinFederationsCaption = screen.queryByText(
                i18n.t('feature.wallet.join-federation'),
            )
            const joinAFederationButton = screen.queryByText(
                i18n.t('phrases.join-a-federation'),
            )

            expect(noFederationsHeader).toBeOnTheScreen()
            expect(joinFederationsCaption).toBeOnTheScreen()
            expect(joinAFederationButton).toBeOnTheScreen()
        })

        it('should navigate to the PublicFederations screen if the join button is pressed', async () => {
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

            const joinAFederationButton = screen.getByText(
                i18n.t('phrases.join-a-federation'),
            )

            await user.press(joinAFederationButton)

            expect(mockNavigation.dispatch).toHaveBeenCalledWith(
                resetToJoinFederation(),
            )
        })
    })

    describe('federation joined', () => {
        it('should display the active federation name, wallet, balance, and wallet buttons', () => {
            store.dispatch(setFederations([mockFederation1, mockFederation2]))
            store.dispatch(setSelectedFederationId(mockFederation2.id))
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

            const name = screen.getByText(
                (mockFederation2 as LoadedFederation).name,
            )
            const bitcoinHeader = screen.getByText(i18n.t('words.bitcoin'))
            const sendButton = screen.getByText(i18n.t('words.send'))
            const receiveButton = screen.getByText(i18n.t('words.receive'))

            expect(name).toBeOnTheScreen()
            expect(bitcoinHeader).toBeOnTheScreen()
            expect(sendButton).toBeOnTheScreen()
            expect(receiveButton).toBeOnTheScreen()
        })

        it('pressing the federation header should navigate to federation details screen', async () => {
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
            act(() => store.dispatch(setFederations([mockFederationWithSPV1])))
            act(() =>
                store.dispatch(
                    setSelectedFederationId(mockFederationWithSPV1.id),
                ),
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
                {
                    federationId: mockFederation1.id,
                },
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
})
