import { cleanup, screen, userEvent } from '@testing-library/react-native'

import { useWalletServiceFederationId } from '@fedi/common/hooks/fi'
import { setFederations, setupStore } from '@fedi/common/redux'
import {
    mockFederation1,
    mockFederation2,
} from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import i18n from '@fedi/native/localization/i18n'
import { renderWithBridge } from '@fedi/native/tests/utils/render'

import SelectWalletOverlay from '../../../../../components/feature/send/SelectWalletOverlay'
import { mockNavigation } from '../../../../setup/jest.setup.mocks'

// the real hook parses the fi invite code through the bridge; the overlay
// only needs the id it produces
jest.mock('@fedi/common/hooks/fi', () => ({
    useWalletServiceFederationId: jest.fn(),
}))

const mockUseWalletServiceFederationId = jest.mocked(
    useWalletServiceFederationId,
)

describe('SelectWalletOverlay', () => {
    let store: ReturnType<typeof setupStore>
    let user: ReturnType<typeof userEvent.setup>
    const fedimint = createMockFedimintBridge()
    const yourLabel = i18n.t('feature.wallet-service.list-your-wallet-service')
    const otherLabel = i18n.t(
        'feature.wallet-service.list-other-wallet-service',
    )
    const founderLabel = i18n.t('feature.wallet-service.founder')

    const renderOverlay = (onDismiss = jest.fn()) =>
        renderWithBridge(<SelectWalletOverlay open onDismiss={onDismiss} />, {
            store,
            fedimint,
        })

    beforeEach(() => {
        jest.clearAllMocks()
        store = setupStore()
        user = userEvent.setup()
        store.dispatch(setFederations([mockFederation1, mockFederation2]))
        mockUseWalletServiceFederationId.mockReturnValue(null)
    })

    afterEach(() => {
        cleanup()
    })

    it('should render a flat list with no headings, chip or gear when no wallet service is owned', () => {
        renderOverlay()

        expect(screen.queryByText(yourLabel)).not.toBeOnTheScreen()
        expect(screen.queryByText(otherLabel)).not.toBeOnTheScreen()
        expect(screen.queryByText(founderLabel)).not.toBeOnTheScreen()
        expect(
            screen.queryByTestId(
                `WalletServiceSettingsButton-${mockFederation1.id}`,
            ),
        ).not.toBeOnTheScreen()
        expect(
            screen.getByTestId(`SelectWalletListItem-${mockFederation1.id}`),
        ).toBeOnTheScreen()
        expect(
            screen.getByTestId(`SelectWalletListItem-${mockFederation2.id}`),
        ).toBeOnTheScreen()
    })

    it('should stay flat when the owned wallet service is not a loaded federation', () => {
        mockUseWalletServiceFederationId.mockReturnValue('not-loaded')

        renderOverlay()

        expect(screen.queryByText(yourLabel)).not.toBeOnTheScreen()
        expect(screen.queryByText(founderLabel)).not.toBeOnTheScreen()
    })

    it('should group the owned wallet service under its own heading with a Founder chip and a gear', () => {
        mockUseWalletServiceFederationId.mockReturnValue(mockFederation2.id)

        renderOverlay()

        expect(screen.getByText(yourLabel)).toBeOnTheScreen()
        expect(screen.getByText(otherLabel)).toBeOnTheScreen()
        expect(
            screen.getByTestId(`FounderChip-${mockFederation2.id}`),
        ).toBeOnTheScreen()
        expect(
            screen.queryByTestId(`FounderChip-${mockFederation1.id}`),
        ).not.toBeOnTheScreen()
        expect(
            screen.getByTestId(
                `WalletServiceSettingsButton-${mockFederation2.id}`,
            ),
        ).toBeOnTheScreen()
        expect(
            screen.queryByTestId(
                `WalletServiceSettingsButton-${mockFederation1.id}`,
            ),
        ).not.toBeOnTheScreen()
    })

    it('should hide the other heading when the owned wallet service is the only federation', () => {
        // setFederations merges by id, so start from an empty store
        store = setupStore()
        store.dispatch(setFederations([mockFederation2]))
        mockUseWalletServiceFederationId.mockReturnValue(mockFederation2.id)

        renderOverlay()

        expect(screen.getByText(yourLabel)).toBeOnTheScreen()
        expect(screen.queryByText(otherLabel)).not.toBeOnTheScreen()
    })

    it('should open wallet service settings and dismiss when the gear is pressed', async () => {
        const onDismiss = jest.fn()
        mockUseWalletServiceFederationId.mockReturnValue(mockFederation2.id)

        renderOverlay(onDismiss)

        await user.press(
            screen.getByTestId(
                `WalletServiceSettingsButton-${mockFederation2.id}`,
            ),
        )

        expect(mockNavigation.navigate).toHaveBeenCalledWith(
            'WalletServiceSettings',
        )
        expect(mockNavigation.navigate).toHaveBeenCalledTimes(1)
        expect(onDismiss).toHaveBeenCalledTimes(1)
    })
})
