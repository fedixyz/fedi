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
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'

import i18n from '../../../localization/i18n'
import ReceiveBitcoin from '../../../screens/ReceiveBitcoin'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

describe('ReceiveBitcoin screen', () => {
    const user = userEvent.setup()
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        jest.clearAllMocks()
        store = setupStore()
    })

    afterEach(() => {
        cleanup()
    })

    it('should enable the lnurl tab when the bridge reports lnurl support', async () => {
        store.dispatch(setFederations([mockFederation1]))
        store.dispatch(setPayFromFederationId(mockFederation1.id))
        const fedimint = createMockFedimintBridge({
            supportsRecurringdLnurl: true,
            getRecurringdLnurl: 'lnurl1test',
            supportsSafeOnchainDeposit: false,
        })

        renderWithProviders(
            <ReceiveBitcoin
                navigation={mockNavigation as any}
                route={mockRoute as any}
            />,
            { store, fedimint },
        )

        const lnurlTab = await screen.findByTestId('lnurlTab')
        await waitFor(() => expect(lnurlTab).toBeEnabled())

        await user.press(lnurlTab)

        expect(
            await screen.findByText(
                i18n.t('feature.receive.lnurl-receive-notice-1'),
                { exact: false },
            ),
        ).toBeOnTheScreen()
    })

    it('should disable the lnurl tab when the bridge reports no lnurl support', async () => {
        store.dispatch(
            setFederations([
                {
                    ...mockFederation1,
                    meta: { onchain_deposits_disabled: 'false' },
                },
            ]),
        )
        store.dispatch(setPayFromFederationId(mockFederation1.id))
        const fedimint = createMockFedimintBridge({
            supportsRecurringdLnurl: false,
            supportsSafeOnchainDeposit: true,
        })

        renderWithProviders(
            <ReceiveBitcoin
                navigation={mockNavigation as any}
                route={mockRoute as any}
            />,
            { store, fedimint },
        )

        const lnurlTab = await screen.findByTestId('lnurlTab')
        await waitFor(() =>
            expect(fedimint.supportsRecurringdLnurl).toHaveBeenCalledWith(
                mockFederation1.id,
            ),
        )
        expect(lnurlTab).toBeDisabled()
    })
})
