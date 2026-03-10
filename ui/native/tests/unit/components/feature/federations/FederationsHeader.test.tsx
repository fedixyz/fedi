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
import {
    mockFederation1,
    mockFederation2,
} from '@fedi/common/tests/mock-data/federation'
import { renderWithProviders } from '@fedi/native/tests/utils/render'

import FederationsHeader from '../../../../../components/feature/federations/FederationsHeader'

describe('FederationsHeader', () => {
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

    it('should show the SelectFederationOverlay when the menu button is pressed', async () => {
        renderWithProviders(<FederationsHeader />)

        const menuButton = await screen.getByTestId(
            'MainHeaderButtons__HamburgerIcon',
        )

        expect(menuButton).toBeOnTheScreen()

        await user.press(menuButton)

        const federationSelectTitle =
            await screen.getByText('Select Federation')

        expect(federationSelectTitle).toBeOnTheScreen()
    })

    it('should hide the SelectFederationOverlay when the backdrop is pressed', async () => {
        renderWithProviders(<FederationsHeader />)

        const menuButton = await screen.getByTestId(
            'MainHeaderButtons__HamburgerIcon',
        )

        expect(menuButton).toBeOnTheScreen()

        await user.press(menuButton)

        const federationSelectTitle =
            await screen.getByText('Select Federation')

        expect(federationSelectTitle).toBeOnTheScreen()

        const backdrop = await screen.getByTestId('RNE__Overlay__backdrop')

        expect(backdrop).toBeOnTheScreen()

        await user.press(backdrop)

        waitFor(() => {
            expect(federationSelectTitle).not.toBeOnTheScreen()
        })
    })

    it('should switch the payment federation when a federation is clicked', async () => {
        store.dispatch(setFederations([mockFederation1, mockFederation2]))
        store.dispatch(setPayFromFederationId(null))

        renderWithProviders(<FederationsHeader />, {
            store,
        })

        const menuButton = await screen.getByTestId(
            'MainHeaderButtons__HamburgerIcon',
        )

        expect(menuButton).toBeOnTheScreen()

        await user.press(menuButton)

        const federationSelectTitle =
            await screen.getByText('Select Federation')

        expect(federationSelectTitle).toBeOnTheScreen()

        const federation1Item = await screen.getByTestId(
            `SelectFederationListItem-${mockFederation1.id}`,
        )
        const federation2Item = await screen.getByTestId(
            `SelectFederationListItem-${mockFederation2.id}`,
        )

        await user.press(federation1Item)

        expect(store.getState().federation.payFromFederationId).toBe(
            mockFederation1.id,
        )

        await user.press(federation2Item)

        expect(store.getState().federation.payFromFederationId).toBe(
            mockFederation2.id,
        )
    })
})
