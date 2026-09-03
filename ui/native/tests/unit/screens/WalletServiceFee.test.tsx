import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'
import React from 'react'

import { setupStore } from '@fedi/common/redux'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import {
    RpcFiFormationSnapshot,
    RpcFiOperationResult,
} from '@fedi/common/types/bindings'
import i18n from '@fedi/native/localization/i18n'

import WalletServiceFee from '../../../screens/WalletServiceFee'
import {
    mockNavigation,
    mockRoute,
    mockToast,
} from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const makeFormedFormation = (): RpcFiFormationSnapshot => ({
    formationId: 'formation-1',
    phase: 'formed',
    intent: {
        federationName: 'My Wallet Service',
        federationSize: 7,
        guardianFeePpm: 0,
        plan: 'infiniteBestEffort',
        maxTotalMsats: null,
    },
    seats: [],
    freshness: 'fresh',
    actionRequired: null,
    paymentOutputsStarted: true,
    milestones: {
        ecashSent: true,
        guardiansConfirmed: true,
        walletServiceCreated: true,
    },
    inviteCode: null,
    lastError: null,
})

// what the bridge republishes while launch reconciliation still holds the FI
// operation lock: the formed phase is downgraded and freshness is unsynced
const makeReconcilingFormation = (): RpcFiFormationSnapshot => ({
    ...makeFormedFormation(),
    phase: 'publishingSeatBindings',
    freshness: 'unsynced',
    milestones: {
        ecashSent: true,
        guardiansConfirmed: true,
        walletServiceCreated: false,
    },
})

const renderFee = ({
    mode = 'onboarding',
    setGuardianFeeResult,
    formation = makeFormedFormation(),
    hasFormedBefore = false,
}: {
    mode?: 'onboarding' | 'edit'
    setGuardianFeeResult?: RpcFiOperationResult
    formation?: RpcFiFormationSnapshot
    hasFormedBefore?: boolean
} = {}) => {
    const user = userEvent.setup()
    const fedimint = createMockFedimintBridge({
        fiClientSetGuardianFee: Promise.resolve(
            setGuardianFeeResult ?? { type: 'success' },
        ),
    })
    const store = setupStore({
        fi: {
            status: { type: 'formation', formation },
            clientError: null,
            creationHighWaterMark: hasFormedBefore
                ? {
                      formationId: formation.formationId,
                      stage: 3,
                      isComplete: true,
                      hasFormed: true,
                  }
                : null,
            draft: { name: '', size: 7 },
            selectionPreview: null,
            eligiblePayers: null,
            operationError: null,
            replacementPreview: null,
            payerError: null,
            liquidity: {
                operation: null,
                hasRead: true,
                errorCode: null,
                isRequesting: false,
            },
        },
    })

    renderWithProviders(
        <WalletServiceFee
            navigation={mockNavigation as any}
            route={{ ...mockRoute, params: { mode } } as any}
        />,
        { store, fedimint },
    )

    return { user, fedimint }
}

// the CTA is "Continue" while onboarding and "Save fee" from settings
const findCtaButton = (mode: 'onboarding' | 'edit' = 'onboarding') =>
    screen.findByRole('button', {
        name: i18n.t(
            mode === 'onboarding'
                ? 'words.continue'
                : 'feature.wallet-service.fee-save',
        ),
    })

// the custom field is placeheld with the floor percentage
const getCustomInput = () =>
    screen.getByPlaceholderText(
        i18n.t('feature.wallet-service.fee-custom-placeholder', { min: 0.15 }),
    )

describe('WalletServiceFee screen', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should title the screen for onboarding when the mode is onboarding', async () => {
        renderFee({ mode: 'onboarding' })

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.fee-onboarding-title'),
            ),
        ).toBeOnTheScreen()
    })

    it('should title the screen plainly when the mode is edit', async () => {
        renderFee({ mode: 'edit' })

        expect(
            await screen.findByText(i18n.t('feature.wallet-service.fee-title')),
        ).toBeOnTheScreen()
    })

    it('should render the three preset rates and a custom option', async () => {
        renderFee()

        expect(await screen.findByText('0.15%')).toBeOnTheScreen()
        expect(screen.getByText('0.5%')).toBeOnTheScreen()
        expect(screen.getByText('1.0%')).toBeOnTheScreen()
        expect(
            screen.getByText(i18n.t('feature.wallet-service.fee-custom')),
        ).toBeOnTheScreen()
    })

    it('should not offer a way to skip the fee step', async () => {
        renderFee({ mode: 'onboarding' })

        await screen.findByText('0.15%')
        expect(screen.queryByText(/skip/i)).not.toBeOnTheScreen()
    })

    it('should show the minimum error when the custom rate is below the floor', async () => {
        const { user } = renderFee()

        await user.press(await screen.findByTestId('fee-option-custom'))
        await user.type(getCustomInput(), '0.1')

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.fee-min-error', { min: 0.15 }),
            ),
        ).toBeOnTheScreen()
    })

    it('should show the maximum error when the custom rate is above the ceiling', async () => {
        const { user } = renderFee()

        await user.press(await screen.findByTestId('fee-option-custom'))
        await user.type(getCustomInput(), '22')

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.fee-max-error', { max: 21 }),
            ),
        ).toBeOnTheScreen()
    })

    it('should save the default rate when nothing is changed', async () => {
        const { user, fedimint } = renderFee()

        await user.press(await findCtaButton())

        await waitFor(() => {
            expect(fedimint.fiClientSetGuardianFee).toHaveBeenCalledWith(5000)
        })
        expect(fedimint.fiClientSetGuardianFee).toHaveBeenCalledTimes(1)
    })

    it.each([
        ['fee-option-1500', 1500],
        ['fee-option-5000', 5000],
        ['fee-option-10000', 10000],
    ] as const)(
        'should save %s as its exact ppm value',
        async (testID, expectedPpm) => {
            const { user, fedimint } = renderFee()

            await user.press(await screen.findByTestId(testID))
            await user.press(await findCtaButton())

            await waitFor(() => {
                expect(fedimint.fiClientSetGuardianFee).toHaveBeenCalledWith(
                    expectedPpm,
                )
            })
        },
    )

    it('should save a custom percentage as its exact ppm value', async () => {
        const { user, fedimint } = renderFee()

        await user.press(await screen.findByTestId('fee-option-custom'))
        await user.type(getCustomInput(), '0.15')
        await user.press(await findCtaButton())

        await waitFor(() => {
            expect(fedimint.fiClientSetGuardianFee).toHaveBeenCalledWith(1500)
        })
    })

    // the fee is the last creation step: the Lightning provider is attached
    // by the ready screen's fourth milestone, not by a step of its own
    // the fee is step 4 of 5: onboarding carries on to the Lightning step,
    // where the provider is actually requested
    it('should continue to the lightning step without a toast in onboarding mode', async () => {
        const { user } = renderFee({ mode: 'onboarding' })

        await user.press(await findCtaButton())

        await waitFor(() => {
            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'WalletServiceLightningProvider',
            )
        })
        expect(mockToast.show).not.toHaveBeenCalled()
    })

    it('should toast the saved rate and go back in edit mode', async () => {
        const { user } = renderFee({ mode: 'edit' })

        await user.press(await findCtaButton('edit'))

        await waitFor(() => {
            expect(mockNavigation.goBack).toHaveBeenCalledTimes(1)
        })
        expect(mockToast.show).toHaveBeenCalledWith(
            i18n.t('feature.wallet-service.fee-saved', { rate: '0.5%' }),
        )
        expect(mockNavigation.navigate).not.toHaveBeenCalled()
    })

    // regression for #12005: after an interrupted formation resumes, the
    // sticky "has formed before" flag must not enable the fee CTA while the
    // bridge is still reconciling and would reject with "already in progress"
    it('should disable the CTA and explain while the resumed formation is still reconciling', async () => {
        renderFee({
            formation: makeReconcilingFormation(),
            hasFormedBefore: true,
        })

        expect(await findCtaButton()).toBeDisabled()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.fee-finishing-setup'),
            ),
        ).toBeOnTheScreen()
        // the never-formed warning is the wrong message for this state
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.error-maintenance-wrong-state'),
            ),
        ).not.toBeOnTheScreen()
    })

    it('should enable the CTA without a banner once the formation is live and fresh', async () => {
        renderFee({ hasFormedBefore: true })

        expect(await findCtaButton()).toBeEnabled()
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.fee-finishing-setup'),
            ),
        ).not.toBeOnTheScreen()
    })

    it('should stay on the screen and toast when the bridge rejects the fee', async () => {
        const { user } = renderFee({
            setGuardianFeeResult: {
                type: 'error',
                error: {
                    code: 'maintenanceWrongState',
                    message: 'not formed',
                    detail: null,
                },
            },
        })

        await user.press(await findCtaButton())

        await waitFor(() => {
            expect(mockToast.show).toHaveBeenCalledWith({
                content: `${i18n.t(
                    'feature.wallet-service.error-maintenance-wrong-state',
                )} ${i18n.t('feature.wallet-service.try-again-hint')}`,
                status: 'error',
            })
        })
        expect(mockNavigation.navigate).not.toHaveBeenCalled()
    })
})
