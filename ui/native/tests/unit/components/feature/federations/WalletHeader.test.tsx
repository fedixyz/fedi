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
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { renderWithProviders } from '@fedi/native/tests/utils/render'

import WalletHeader from '../../../../../components/feature/federations/WalletHeader'
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
})
