import { cleanup, screen, userEvent } from '@testing-library/react-native'
import React from 'react'

import { setFeatureFlags, setFiStatus, setupStore } from '@fedi/common/redux'
import type { FeatureCatalog } from '@fedi/common/types/bindings'
import { isDev } from '@fedi/common/utils/environment'
import i18n from '@fedi/native/localization/i18n'

import PublicFederations from '../../../screens/PublicFederations'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

// the discover tab's fetch dispatches after mount, and the shared react-native
// mock has no `unstable_batchedUpdates` for react-redux to notify through. The
// public list is not what these tests exercise, so stub the fetch away. The
// Guardianito hook is stubbed for the same reason: the legacy path only needs
// to render its CTA here, not run a bot lookup.
jest.mock('@fedi/common/hooks/federation', () => ({
    ...jest.requireActual('@fedi/common/hooks/federation'),
    useLatestPublicFederations: jest.fn(),
    useGuardianito: jest.fn(() => ({
        myGuardianitoBot: null,
        beginBotCreation: jest.fn(),
        isLoading: false,
        showGoToChatButton: false,
    })),
}))

// `selectIsWalletServiceCreationEnabled` is forced on in dev, and the react-native
// jest preset sets `__DEV__`. Pinning `isDev` to false is what makes the flag the
// thing under test rather than the environment.
jest.mock('@fedi/common/utils/environment', () => ({
    ...jest.requireActual('@fedi/common/utils/environment'),
    isDev: jest.fn(() => false),
}))

const mockIsDev = isDev as jest.Mock

const makeStore = ({ walletServiceCreation = false } = {}) => {
    const store = setupStore()
    store.dispatch(
        setFeatureFlags(
            (walletServiceCreation
                ? { wallet_service_creation: {} }
                : {}) as FeatureCatalog,
        ),
    )
    store.dispatch(setFiStatus({ type: 'idle' }))
    return store
}

const renderCreateTab = async (
    store: ReturnType<typeof setupStore> = makeStore(),
) => {
    const user = userEvent.setup()

    renderWithProviders(
        <PublicFederations
            navigation={mockNavigation as any}
            route={mockRoute as any}
        />,
        { store },
    )

    await user.press(await screen.findByTestId('createTab'))

    return { user }
}

describe('PublicFederations screen', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockIsDev.mockReturnValue(false)
    })

    afterEach(() => {
        cleanup()
    })

    it('should offer the wallet service flow on the create tab when the flag is on', async () => {
        await renderCreateTab(makeStore({ walletServiceCreation: true }))

        expect(
            await screen.findByRole('button', { name: i18n.t('words.create') }),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(
                i18n.t('feature.onboarding.create-button-label'),
            ),
        ).not.toBeOnTheScreen()
    })

    it('should fall back to the legacy create flow when the flag is off', async () => {
        await renderCreateTab(makeStore({ walletServiceCreation: false }))

        expect(
            await screen.findByText(
                i18n.t('feature.onboarding.create-button-label'),
            ),
        ).toBeOnTheScreen()
    })

    it('should force the wallet service flow on in dev regardless of the flag', async () => {
        mockIsDev.mockReturnValue(true)

        await renderCreateTab(makeStore({ walletServiceCreation: false }))

        expect(
            await screen.findByRole('button', { name: i18n.t('words.create') }),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(
                i18n.t('feature.onboarding.create-button-label'),
            ),
        ).not.toBeOnTheScreen()
    })
})
