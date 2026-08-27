import { cleanup, screen } from '@testing-library/react-native'

import { WALLET_SERVICE_LIGHTNING_STAGES } from '@fedi/common/redux'

import { LightningAttachProgress } from '../../../components/feature/walletservice/LightningAttachProgress'
import i18n from '../../../localization/i18n'
import { renderWithProviders } from '../../utils/render'

describe('components/LightningAttachProgress', () => {
    afterEach(() => {
        cleanup()
    })

    it('should render every ordered stage', () => {
        renderWithProviders(<LightningAttachProgress stage="requested" />)

        WALLET_SERVICE_LIGHTNING_STAGES.forEach(name => {
            expect(
                screen.getByTestId(`lightning-stage-${name}`),
            ).toBeOnTheScreen()
        })
    })

    it('should mark earlier stages done and the current one active', () => {
        renderWithProviders(<LightningAttachProgress stage="verifying" />)

        // one spinner, on the stage actually being waited for
        expect(screen.getAllByTestId('milestone-spinner')).toHaveLength(1)
    })

    it('should name the verification wait, which is the longest step', () => {
        renderWithProviders(<LightningAttachProgress stage="verifying" />)

        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.lightning-stage-verifying'),
            ),
        ).toBeOnTheScreen()
    })

    // the last stage is only ever done: reaching it is the operation completing
    it('should show no spinner once ready', () => {
        renderWithProviders(<LightningAttachProgress stage="ready" />)

        expect(screen.queryByTestId('milestone-spinner')).not.toBeOnTheScreen()
    })

    /**
     * `actionRequired` is an operator decision point, not a step on the way to
     * ready. Rendering it as one lit step among five would present a stop as
     * progress, and its own contract forbids retrying it automatically.
     */
    it('should replace the list entirely when the provider needs an operator', () => {
        renderWithProviders(<LightningAttachProgress stage="actionRequired" />)

        expect(
            screen.getByTestId('lightning-stage-actionRequired'),
        ).toBeOnTheScreen()
        WALLET_SERVICE_LIGHTNING_STAGES.forEach(name => {
            expect(
                screen.queryByTestId(`lightning-stage-${name}`),
            ).not.toBeOnTheScreen()
        })
    })

    it('should say the provider will not retry on its own', () => {
        renderWithProviders(<LightningAttachProgress stage="actionRequired" />)

        expect(
            screen.getByText(
                i18n.t(
                    'feature.wallet-service.lightning-stage-action-required-detail',
                ),
            ),
        ).toBeOnTheScreen()
    })
})
