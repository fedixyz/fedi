import { cleanup, screen } from '@testing-library/react-native'

import { setupStore } from '@fedi/common/redux'
import { setCommunities } from '@fedi/common/redux/federation'
import {
    mockCommunity,
    mockCommunity2,
} from '@fedi/common/tests/mock-data/federation'
import { renderWithProviders } from '@fedi/native/tests/utils/render'

import HomeHeader from '../../../../../components/feature/home/HomeHeader'

describe('WalletHeader', () => {
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        store = setupStore()
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('the menu button should be hidden if there are less than 2 communities joined', async () => {
        store.dispatch(setCommunities([mockCommunity]))

        renderWithProviders(<HomeHeader />, { store })

        const menuButton = await screen.queryByTestId(
            'MainHeaderButtons__HamburgerIcon',
        )

        expect(menuButton).not.toBeOnTheScreen()
    })

    it('the menu button should be visible if there are 2 or more communities joined', async () => {
        store.dispatch(setCommunities([mockCommunity, mockCommunity2]))

        renderWithProviders(<HomeHeader />, { store })

        const menuButton = await screen.getByTestId(
            'MainHeaderButtons__HamburgerIcon',
        )

        expect(menuButton).toBeOnTheScreen()
    })
})
