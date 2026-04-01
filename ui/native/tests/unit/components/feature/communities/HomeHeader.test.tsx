import { cleanup, screen, userEvent } from '@testing-library/react-native'

import { setupStore } from '@fedi/common/redux'
import { setCommunities } from '@fedi/common/redux/federation'
import {
    mockCommunity,
    mockCommunity2,
} from '@fedi/common/tests/mock-data/federation'
import { renderWithProviders } from '@fedi/native/tests/utils/render'

import HomeHeader from '../../../../../components/feature/home/HomeHeader'

describe('HomeHeader', () => {
    let store: ReturnType<typeof setupStore>
    let user: ReturnType<typeof userEvent.setup>
    let onOpenCommunitiesOverlay: jest.Mock

    beforeEach(() => {
        store = setupStore()
        user = userEvent.setup()
        onOpenCommunitiesOverlay = jest.fn()
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('the menu button should be hidden if there are less than 2 communities joined', async () => {
        store.dispatch(setCommunities([mockCommunity]))

        renderWithProviders(
            <HomeHeader onOpenCommunitiesOverlay={onOpenCommunitiesOverlay} />,
            { store },
        )

        const menuButton = await screen.queryByTestId(
            'MainHeaderButtons__HamburgerIcon',
        )

        expect(menuButton).not.toBeOnTheScreen()
    })

    it('the menu button should be visible if there are 2 or more communities joined', async () => {
        store.dispatch(setCommunities([mockCommunity, mockCommunity2]))

        renderWithProviders(
            <HomeHeader onOpenCommunitiesOverlay={onOpenCommunitiesOverlay} />,
            { store },
        )

        const menuButton = await screen.getByTestId(
            'MainHeaderButtons__HamburgerIcon',
        )

        expect(menuButton).toBeOnTheScreen()
    })

    it('should request opening the CommunitiesOverlay when the menu button is pressed', async () => {
        store.dispatch(setCommunities([mockCommunity, mockCommunity2]))

        renderWithProviders(
            <HomeHeader onOpenCommunitiesOverlay={onOpenCommunitiesOverlay} />,
            { store },
        )

        const menuButton = await screen.getByTestId(
            'MainHeaderButtons__HamburgerIcon',
        )

        await user.press(menuButton)

        expect(onOpenCommunitiesOverlay).toHaveBeenCalledTimes(1)
    })
})
