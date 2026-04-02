import '@testing-library/jest-dom'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'

import {
    selectOnboardingCompleted,
    refreshOnboardingStatus,
    restoreMnemonic,
} from '@fedi/common/redux'
import { createIntegrationTestBuilder } from '@fedi/common/tests/utils/remote-bridge-setup'

import { mockUseRouter } from '../../jest.setup'
import { Onboarding } from '../../src/components/Onboarding'
import i18n from '../../src/localization/i18n'
import WelcomePage from '../../src/pages/index'
import { renderWithBridge } from '../utils/render'

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

describe('web recovery device selection', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    beforeEach(() => {
        jest.clearAllMocks()
        mockUseRouter.pathname = '/onboarding'
        mockUseRouter.asPath = '/onboarding'
    })

    it('completes recovery from an unrecognized seed via continue anyway', async () => {
        const {
            store,
            bridge: { fedimint },
        } = context

        const { unmount: unmountWelcome } = renderWithBridge(<WelcomePage />, {
            store,
            fedimint,
        })

        expect(
            screen.getByRole('link', {
                name: i18n.t('phrases.recover-my-account'),
            }),
        ).toHaveAttribute('href', '/onboarding/recover')

        unmountWelcome()

        const { unmount: unmountRecoveryHome } = renderWithBridge(
            <Onboarding step="recover" />,
            { store, fedimint },
        )

        expect(
            screen.getByRole('link', {
                name: i18n.t('feature.recovery.start-personal-recovery'),
            }),
        ).toHaveAttribute('href', '/onboarding/recover/personal')

        unmountRecoveryHome()

        const { container, unmount } = renderWithBridge(
            <Onboarding step="recover/personal" />,
            { store, fedimint },
        )

        const inputs = Array.from(container.querySelectorAll('input'))
        expect(inputs).toHaveLength(12)

        inputs.forEach((input, index) => {
            fireEvent.change(input, {
                target: { value: UNREGISTERED_TEST_MNEMONIC[index] },
            })
        })

        fireEvent.click(screen.getByText('Recover wallet'))

        expect(
            await screen.findByText(
                i18n.t('feature.recovery.you-completed-personal-recovery'),
            ),
        ).toBeInTheDocument()

        fireEvent.click(screen.getByText(i18n.t('words.continue')))

        await waitFor(() => {
            expect(mockUseRouter.push).toHaveBeenCalledWith(
                '/onboarding/recover/wallet-transfer',
            )
        })

        unmount()

        renderWithBridge(<Onboarding step="recover/wallet-transfer" />, {
            store,
            fedimint,
        })

        expect(
            screen.getByRole('link', { name: i18n.t('words.continue') }),
        ).toHaveAttribute('href', '/onboarding/recover/select-device')

        cleanup()

        renderWithBridge(<Onboarding step="recover/select-device" />, {
            store,
            fedimint,
        })

        expect(await screen.findByText('Unknown Wallet')).toBeInTheDocument()
        expect(screen.getByText('Start over')).toBeInTheDocument()
        expect(screen.getByText('Continue anyway')).toBeInTheDocument()

        mockUseRouter.push.mockClear()
        fireEvent.click(screen.getByText('Continue anyway'))

        await waitFor(() => {
            expect(mockUseRouter.push).toHaveBeenCalledWith('/home')
            expect(selectOnboardingCompleted(store.getState())).toBe(true)
        })
    })

    it('returns to recovery method selection after try another seed', async () => {
        const {
            store,
            bridge: { fedimint },
        } = context

        const { unmount: unmountWelcome } = renderWithBridge(<WelcomePage />, {
            store,
            fedimint,
        })

        expect(
            screen.getByRole('link', {
                name: i18n.t('phrases.recover-my-account'),
            }),
        ).toHaveAttribute('href', '/onboarding/recover')

        unmountWelcome()

        const { unmount: unmountRecoveryHome } = renderWithBridge(
            <Onboarding step="recover" />,
            { store, fedimint },
        )

        expect(
            screen.getByRole('link', {
                name: i18n.t('feature.recovery.start-personal-recovery'),
            }),
        ).toHaveAttribute('href', '/onboarding/recover/personal')

        unmountRecoveryHome()

        await store
            .dispatch(
                restoreMnemonic({
                    fedimint,
                    mnemonic: UNREGISTERED_TEST_MNEMONIC,
                }),
            )
            .unwrap()
        await store.dispatch(refreshOnboardingStatus(fedimint))

        await waitFor(() => {
            const state = store.getState()
            expect(state.recovery.deviceIndexRequired).toBe(true)
            expect(state.recovery.registeredDevices).not.toBeNull()
            if (!state.recovery.registeredDevices) {
                throw new Error('registered devices not loaded')
            }
            expect(state.recovery.registeredDevices).toHaveLength(0)
        })

        renderWithBridge(<Onboarding step="recover/select-device" />, {
            store,
            fedimint,
        })

        fireEvent.click(await screen.findByText('Start over'))

        await waitFor(() => {
            expect(mockUseRouter.push).toHaveBeenCalledWith(
                '/onboarding/recover',
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
