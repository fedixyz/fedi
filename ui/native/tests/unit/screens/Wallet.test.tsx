import { screen, userEvent } from '@testing-library/react-native'

import {
    setFederations,
    setLastUsedFederationId,
    setupStore,
} from '@fedi/common/redux'
import {
    mockFederation1,
    mockFederation2,
} from '@fedi/common/tests/mock-data/federation'

import i18n from '../../../localization/i18n'
import Wallet from '../../../screens/Wallet'
import { resetToJoinFederation } from '../../../state/navigation'
import { LoadedFederation } from '../../../types'
import { mockNavigation } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

// Related Tests:
// - unit/components/feature/federations/FederationTile.test.tsx
// - unit/components/feature/federations/FederationsHeader.test.tsx

describe('Wallet screen', () => {
    const user = userEvent.setup()
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

    describe('with federations joined', () => {
        it('[1 federation] should render the featured federation as the last-used federation', () => {
            store.dispatch(setFederations([mockFederation1]))
            store.dispatch(setLastUsedFederationId(mockFederation1.id))
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

            const featuredFederationName = screen.queryByText(
                (mockFederation1 as LoadedFederation).name,
            )

            expect(featuredFederationName).toBeOnTheScreen()
        })

        it('[>1 federation] should render the featured federation and non-featured federations', () => {
            store.dispatch(setFederations([mockFederation1, mockFederation2]))
            store.dispatch(setLastUsedFederationId(mockFederation2.id))
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

            const featuredFederationName = screen.queryByText(
                (mockFederation2 as LoadedFederation).name,
            )
            const nonFeaturedFederationName = screen.queryByText(
                (mockFederation1 as LoadedFederation).name,
            )

            expect(featuredFederationName).toBeOnTheScreen()
            expect(nonFeaturedFederationName).toBeOnTheScreen()
        })
    })
})
