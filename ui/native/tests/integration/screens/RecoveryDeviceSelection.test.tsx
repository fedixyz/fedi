import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'

import {
    refreshOnboardingStatus,
    restoreMnemonic,
    selectOnboardingCompleted,
} from '@fedi/common/redux'
import { createIntegrationTestBuilder } from '@fedi/common/tests/utils/remote-bridge-setup'

import i18n from '../../../localization/i18n'
import RecoveryDeviceSelection from '../../../screens/RecoveryDeviceSelection'
import { reset } from '../../../state/navigation'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithBridge } from '../../utils/render'

const UNREGISTERED_TEST_MNEMONIC = [
    'plastic',
    'assault',
    'exotic',
    'arrange',
    'approve',
    'grocery',
    'april',
    'desk',
    'monitor',
    'sense',
    'edit',
    'captain',
]

describe('/screens/RecoveryDeviceSelection', () => {
    const builder = createIntegrationTestBuilder(waitFor)
    const context = builder.getContext()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('shows the unrecognized-seed state and can continue anyway to an onboarded state', async () => {
        const {
            bridge: { fedimint },
            store,
        } = context

        await act(async () => {
            await store
                .dispatch(
                    restoreMnemonic({
                        fedimint,
                        mnemonic: UNREGISTERED_TEST_MNEMONIC,
                    }),
                )
                .unwrap()
            await store.dispatch(refreshOnboardingStatus(fedimint))
        })

        await waitFor(() => {
            const state = store.getState()
            expect(state.recovery.deviceIndexRequired).toBe(true)
            expect(state.recovery.registeredDevices).not.toBeNull()
            if (!state.recovery.registeredDevices) {
                throw new Error('registered devices not loaded')
            }
            expect(state.recovery.registeredDevices).toHaveLength(0)
        })

        renderWithBridge(
            <RecoveryDeviceSelection
                navigation={mockNavigation as any}
                route={mockRoute as any}
            />,
            { store, fedimint },
        )

        expect(
            await screen.findByText(
                i18n.t('feature.recovery.device-not-found'),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.recovery.device-not-found-description'),
            ),
        ).toBeOnTheScreen()
        expect(screen.getByText(i18n.t('phrases.start-over'))).toBeOnTheScreen()
        expect(
            screen.getByText(i18n.t('feature.recovery.continue-anyways')),
        ).toBeOnTheScreen()

        fireEvent.press(
            screen.getByText(i18n.t('feature.recovery.continue-anyways')),
        )

        await waitFor(() => {
            expect(selectOnboardingCompleted(store.getState())).toBe(true)
        })
    })

    it('can reset unrecognized-seed recovery and navigate back to choose recovery method', async () => {
        const {
            bridge: { fedimint },
            store,
        } = context

        await act(async () => {
            await store
                .dispatch(
                    restoreMnemonic({
                        fedimint,
                        mnemonic: UNREGISTERED_TEST_MNEMONIC,
                    }),
                )
                .unwrap()
            await store.dispatch(refreshOnboardingStatus(fedimint))
        })

        await waitFor(() => {
            const state = store.getState()
            expect(state.recovery.deviceIndexRequired).toBe(true)
            expect(state.recovery.registeredDevices).not.toBeNull()
            if (!state.recovery.registeredDevices) {
                throw new Error('registered devices not loaded')
            }
            expect(state.recovery.registeredDevices).toHaveLength(0)
        })

        renderWithBridge(
            <RecoveryDeviceSelection
                navigation={mockNavigation as any}
                route={mockRoute as any}
            />,
            { store, fedimint },
        )

        fireEvent.press(await screen.findByText(i18n.t('phrases.start-over')))

        await waitFor(() => {
            expect(mockNavigation.dispatch).toHaveBeenCalledWith(
                reset('ChooseRecoveryMethod'),
            )
        })

        await waitFor(async () => {
            const status = await fedimint.bridgeStatus()
            expect(status.type).toBe('onboarding')
            if (status.type !== 'onboarding') {
                throw new Error('bridge not in onboarding state')
            }
            expect(status.stage.type).toBe('init')
        })
    })
})
