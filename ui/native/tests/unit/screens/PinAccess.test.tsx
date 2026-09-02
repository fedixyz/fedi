import { cleanup, screen } from '@testing-library/react-native'

import { setupStore } from '@fedi/common/redux'
import i18n from '@fedi/native/localization/i18n'

import PinAccess from '../../../screens/PinAccess'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const baseState = setupStore().getState()

const renderWithSeedFlag = (enabled: boolean) =>
    renderWithProviders(
        <PinAccess
            navigation={mockNavigation as any}
            route={mockRoute as any}
        />,
        {
            preloadedState: {
                ...baseState,
                environment: {
                    ...baseState.environment,
                    featureFlags: (enabled
                        ? { mini_app_seed: {} }
                        : {}) as unknown as typeof baseState.environment.featureFlags,
                },
            },
        },
    )

describe('PinAccess screen', () => {
    afterEach(() => {
        cleanup()
    })

    it('should show the mini app seed row while the feature is enabled', () => {
        renderWithSeedFlag(true)

        expect(
            screen.getByText(i18n.t('feature.fedimods.mini-app-seed')),
        ).toBeOnTheScreen()
    })

    it('should hide the mini app seed row while the feature is disabled', () => {
        renderWithSeedFlag(false)

        expect(
            screen.queryByText(i18n.t('feature.fedimods.mini-app-seed')),
        ).toBeNull()
        expect(
            screen.getByText(i18n.t('feature.backup.personal-backup')),
        ).toBeOnTheScreen()
    })
})
