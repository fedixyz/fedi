import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import {
    selectPaymentFederation,
    selectPaymentType,
    setFederations,
    setPayFromFederationId,
    setupStore,
} from '@fedi/common/redux'
import { setSimulateRecovery } from '@fedi/common/redux/federation'
import {
    mockFederation1,
    mockFederation2,
} from '@fedi/common/tests/mock-data/federation'
import { renderWithProviders } from '@fedi/native/tests/utils/render'

import WalletHeader from '../../../../../components/feature/federations/WalletHeader'
import i18n from '../../../../../localization/i18n'
import { LoadedFederation } from '../../../../../types'

describe('WalletHeader', () => {
    let store: ReturnType<typeof setupStore>
    let user: ReturnType<typeof userEvent.setup>

    beforeEach(() => {
        store = setupStore()
        user = userEvent.setup()
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should show the SelectWalletOverlay when the menu button is pressed', async () => {
        renderWithProviders(<WalletHeader />)

        const menuButton = await screen.getByTestId(
            'MainHeaderButtons__HamburgerIcon',
        )

        expect(menuButton).toBeOnTheScreen()

        await user.press(menuButton)

        const federationSelectTitle = await screen.getByText('Select Wallet')

        expect(federationSelectTitle).toBeOnTheScreen()
    })

    it('should hide the SelectWalletOverlay when the backdrop is pressed', async () => {
        renderWithProviders(<WalletHeader />)

        const menuButton = await screen.getByTestId(
            'MainHeaderButtons__HamburgerIcon',
        )

        expect(menuButton).toBeOnTheScreen()

        await user.press(menuButton)

        const federationSelectTitle = await screen.getByText('Select Wallet')

        expect(federationSelectTitle).toBeOnTheScreen()

        const backdrop = await screen.getByTestId('RNE__Overlay__backdrop')

        expect(backdrop).toBeOnTheScreen()

        await user.press(backdrop)

        waitFor(() => {
            expect(federationSelectTitle).not.toBeOnTheScreen()
        })
    })

    it("should switch the tab and payment federation when a federation's bitcoin balance is selected", async () => {
        store.dispatch(setFederations([mockFederation1]))
        store.dispatch(setPayFromFederationId(null))

        renderWithProviders(<WalletHeader />, {
            store,
        })

        const menuButton = await screen.getByTestId(
            'MainHeaderButtons__HamburgerIcon',
        )

        expect(menuButton).toBeOnTheScreen()

        await user.press(menuButton)

        const federation1Item = await screen.getByTestId(
            `SelectWalletListItem-${mockFederation1.id}`,
        )

        expect(federation1Item).toBeOnTheScreen()

        const bitcoinButtonFederation1 = await screen.getByTestId(
            `BitcoinButton-${mockFederation1.id}`,
        )

        await user.press(bitcoinButtonFederation1)

        expect(selectPaymentType(store.getState())).toBe('bitcoin')
        expect(selectPaymentFederation(store.getState())).toStrictEqual(
            mockFederation1,
        )
    })

    it("should switch the tab and payment federation when a federation's stable balance is selected", async () => {
        const federationWithSP = {
            ...mockFederation1,
            meta: { 'fedi:stability_pool_disabled': 'false' },
        } as LoadedFederation

        store.dispatch(setFederations([federationWithSP]))
        store.dispatch(setPayFromFederationId(null))

        renderWithProviders(<WalletHeader />, {
            store,
        })

        const menuButton = await screen.getByTestId(
            'MainHeaderButtons__HamburgerIcon',
        )

        expect(menuButton).toBeOnTheScreen()

        await user.press(menuButton)

        const federation1Item = await screen.getByTestId(
            `SelectWalletListItem-${federationWithSP.id}`,
        )

        expect(federation1Item).toBeOnTheScreen()

        const bitcoinButtonFederation1 = await screen.getByTestId(
            `StableBalanceButton-${federationWithSP.id}`,
        )

        await user.press(bitcoinButtonFederation1)

        expect(selectPaymentType(store.getState())).toBe('stable-balance')
        expect(selectPaymentFederation(store.getState())).toStrictEqual(
            federationWithSP,
        )
    })

    describe('recovering federation', () => {
        it('should show recovering label and hide balance rows for a recovering federation', async () => {
            store.dispatch(setFederations([mockFederation1]))
            store.dispatch(
                setSimulateRecovery({
                    federationId: mockFederation1.id,
                    enabled: true,
                }),
            )

            renderWithProviders(<WalletHeader />, { store })

            const menuButton = screen.getByTestId(
                'MainHeaderButtons__HamburgerIcon',
            )
            await user.press(menuButton)

            const federationItem = screen.getByTestId(
                `SelectWalletListItem-${mockFederation1.id}`,
            )
            expect(federationItem).toBeOnTheScreen()

            const recoveringLabel = screen.getByText(
                i18n.t('feature.federations.recovering-label'),
            )
            expect(recoveringLabel).toBeOnTheScreen()

            expect(
                screen.queryByTestId(`BitcoinButton-${mockFederation1.id}`),
            ).not.toBeOnTheScreen()
        })

        it('should show balance rows for non-recovering federation alongside recovering one', async () => {
            store.dispatch(setFederations([mockFederation1, mockFederation2]))
            store.dispatch(
                setSimulateRecovery({
                    federationId: mockFederation1.id,
                    enabled: true,
                }),
            )

            renderWithProviders(<WalletHeader />, { store })

            const menuButton = screen.getByTestId(
                'MainHeaderButtons__HamburgerIcon',
            )
            await user.press(menuButton)

            const bitcoinButtonRecoveringFederation = screen.queryByTestId(
                `BitcoinButton-${mockFederation1.id}`,
            )
            expect(bitcoinButtonRecoveringFederation).not.toBeOnTheScreen()

            const bitcoinButtonNonRecoveringFederation = screen.queryByTestId(
                `BitcoinButton-${mockFederation2.id}`,
            )
            expect(bitcoinButtonNonRecoveringFederation).toBeOnTheScreen()
        })
    })
})
