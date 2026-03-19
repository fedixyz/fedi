import { act, screen, userEvent } from '@testing-library/react-native'

import {
    setFederations,
    setIsInternetUnreachable,
    setupStore,
} from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'

import FederationTile from '../../../../../components/feature/federations/FederationTile'
import i18n from '../../../../../localization/i18n'
import { LoadedFederation } from '../../../../../types'
import { mockNavigation } from '../../../../setup/jest.setup.mocks'
import { renderWithBridge } from '../../../../utils/render'

// Parent Test:
// - unit/screens/Federations.test.tsx

const federationWithStabilityPool = {
    ...mockFederation1,
    meta: {
        stability_pool_disabled: 'false',
        multispend_disabled: 'false',
    },
    clientConfig: {
        global: {},
        modules: {
            multi_sig_stability_pool: {
                kind: 'multi_sig_stability_pool',
            },
        },
    },
} as LoadedFederation

describe('FederationTile', () => {
    const user = userEvent.setup()
    let store: ReturnType<typeof setupStore>
    const fedimint = createMockFedimintBridge({
        spv2SubscribeAccountInfo: jest.fn(),
    })

    beforeEach(() => {
        jest.clearAllMocks()

        store = setupStore()
    })

    describe('expanded', () => {
        it('should render the federation name, logo, bitcoin wallet + buttons, stability wallet + buttons', async () => {
            act(() =>
                store.dispatch(setFederations([federationWithStabilityPool])),
            )
            renderWithBridge(
                <FederationTile
                    federation={mockFederation1 as LoadedFederation}
                    expanded={true}
                    setExpandedWalletId={() => {}}
                />,
                { store, fedimint },
            )

            const federationName = screen.getByText(
                (mockFederation1 as LoadedFederation).name,
            )
            const federationLogo = screen.getByTestId(
                'FederationLogo__Fallback',
            )
            const bitcoinWalletHeader = screen.getByText(
                i18n.t('words.bitcoin'),
            )
            const sendButton = screen.getByText(i18n.t('words.send'))
            const receiveButton = screen.getByText(i18n.t('words.receive'))
            const stabilityWalletHeader = screen.getByText(
                new RegExp(i18n.t('feature.stabilitypool.stable-balance')),
            )
            const moveButton = screen.getByText(i18n.t('words.move'))
            const transferButton = screen.getByText(i18n.t('words.transfer'))

            expect(federationName).toBeOnTheScreen()
            expect(federationLogo).toBeOnTheScreen()
            expect(bitcoinWalletHeader).toBeOnTheScreen()
            expect(sendButton).toBeOnTheScreen()
            expect(receiveButton).toBeOnTheScreen()
            expect(stabilityWalletHeader).toBeOnTheScreen()
            expect(moveButton).toBeOnTheScreen()
            expect(transferButton).toBeOnTheScreen()
        })

        it('should navigate to FederationDetails when the header is pressed', async () => {
            renderWithBridge(
                <FederationTile
                    federation={mockFederation1 as LoadedFederation}
                    expanded={true}
                    setExpandedWalletId={() => {}}
                />,
                {
                    store,
                    fedimint,
                },
            )

            const collapsedWallet = screen.getByTestId(
                (mockFederation1 as LoadedFederation).name
                    .concat('DetailsButton')
                    .replaceAll(' ', ''),
            )

            await user.press(collapsedWallet)

            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'FederationDetails',
                {
                    federationId: mockFederation1.id,
                },
            )
        })

        it('should navigate to the respective screen when the send and receive buttons are pressed', async () => {
            act(() => store.dispatch(setFederations([mockFederation1])))
            renderWithBridge(
                <FederationTile
                    federation={mockFederation1 as LoadedFederation}
                    expanded={true}
                    setExpandedWalletId={() => {}}
                />,
                { store, fedimint },
            )

            const sendButton = screen.getByText(i18n.t('words.send'))
            const receiveButton = screen.getByText(i18n.t('words.receive'))

            expect(sendButton).toBeOnTheScreen()
            expect(receiveButton).toBeOnTheScreen()

            await user.press(sendButton)
            expect(mockNavigation.navigate).toHaveBeenCalledWith('Send', {
                federationId: mockFederation1.id,
            })

            // the Send button should navigate to SendOfflineAmount when offline
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

            act(() =>
                store.dispatch(
                    setFederations([
                        {
                            ...mockFederation1,
                            meta: {
                                max_invoice_msats: '0',
                            },
                        } as LoadedFederation,
                    ]),
                ),
            )
        })

        it('should navigate to the respective screen when the move/transfer buttons are pressed', async () => {
            act(() =>
                store.dispatch(setFederations([federationWithStabilityPool])),
            )
            renderWithBridge(
                <FederationTile
                    federation={mockFederation1 as LoadedFederation}
                    expanded={true}
                    setExpandedWalletId={() => {}}
                />,
                {
                    store,
                    fedimint: createMockFedimintBridge({
                        spv2SubscribeAccountInfo: jest.fn(),
                    }),
                },
            )

            const moveButton = screen.getByText(i18n.t('words.move'))
            expect(moveButton).toBeOnTheScreen()

            await user.press(moveButton)
            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'StabilityMove',
                {
                    federationId: mockFederation1.id,
                },
            )

            const transferButton = screen.getByText(i18n.t('words.transfer'))
            expect(transferButton).toBeOnTheScreen()

            await user.press(transferButton)
            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'StabilityTransfer',
                {
                    federationId: mockFederation1.id,
                },
            )
        })
    })

    describe('collapsed', () => {
        it('should render the federation name, logo, bitcoin wallet + buttons, stability wallet + buttons', async () => {
            act(() =>
                store.dispatch(setFederations([federationWithStabilityPool])),
            )
            renderWithBridge(
                <FederationTile
                    federation={mockFederation1 as LoadedFederation}
                    expanded={false}
                    setExpandedWalletId={() => {}}
                />,
                { store, fedimint },
            )

            const federationName = screen.getByText(
                (mockFederation1 as LoadedFederation).name,
            )
            const federationLogo = screen.getByTestId(
                'FederationLogo__Fallback',
            )
            const bitcoinWalletHeader = screen.getByText(
                i18n.t('words.bitcoin'),
            )
            const sendButton = screen.queryByText(i18n.t('words.send'))
            const receiveButton = screen.queryByText(i18n.t('words.receive'))
            const stabilityWalletHeader = screen.getByText(
                new RegExp(i18n.t('feature.stabilitypool.stable-balance')),
            )
            const moveButton = screen.queryByText(i18n.t('words.move'))
            const transferButton = screen.queryByText(i18n.t('words.transfer'))

            expect(federationName).toBeOnTheScreen()
            expect(federationLogo).toBeOnTheScreen()
            expect(bitcoinWalletHeader).toBeOnTheScreen()
            expect(sendButton).not.toBeOnTheScreen()
            expect(receiveButton).not.toBeOnTheScreen()
            expect(stabilityWalletHeader).toBeOnTheScreen()
            expect(moveButton).not.toBeOnTheScreen()
            expect(transferButton).not.toBeOnTheScreen()
        })

        it('should call `setExpandedWalletId` when the stability wallet or bitcoin wallet header is pressed', async () => {
            const mockSetExpandedWalletId = jest.fn()
            act(() =>
                store.dispatch(setFederations([federationWithStabilityPool])),
            )
            renderWithBridge(
                <FederationTile
                    federation={mockFederation1 as LoadedFederation}
                    expanded={false}
                    setExpandedWalletId={mockSetExpandedWalletId}
                />,
                { store, fedimint },
            )

            const bitcoinWalletPressable = screen.getByTestId(
                `BitcoinWallet__Expand-${mockFederation1.id}`,
            )
            const stabilityWalletPressable = screen.getByTestId(
                `StabilityWallet__Expand-${mockFederation1.id}`,
            )

            await user.press(bitcoinWalletPressable)

            expect(mockSetExpandedWalletId).toHaveBeenCalledWith(
                mockFederation1.id,
            )

            await user.press(stabilityWalletPressable)

            expect(mockSetExpandedWalletId).toHaveBeenCalledWith(
                mockFederation1.id,
            )
        })
    })
})
