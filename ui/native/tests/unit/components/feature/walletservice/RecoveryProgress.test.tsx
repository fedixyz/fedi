import { cleanup, screen } from '@testing-library/react-native'

import { WALLET_SERVICE_RECOVERY_STAGES } from '@fedi/common/redux'

import { RecoveryProgress } from '../../../../../components/feature/walletservice/RecoveryProgress'
import i18n from '../../../../../localization/i18n'
import { renderWithProviders } from '../../../../utils/render'

describe('components/feature/walletservice/RecoveryProgress', () => {
    afterEach(() => {
        cleanup()
    })

    it('should render every ordered stage', () => {
        renderWithProviders(<RecoveryProgress stage="found" />)

        WALLET_SERVICE_RECOVERY_STAGES.forEach(name => {
            expect(
                screen.getByTestId(`recovery-stage-${name}`),
            ).toBeOnTheScreen()
        })
    })

    it('lights rows before the active stage as done and the active one as active', () => {
        renderWithProviders(<RecoveryProgress stage="rejoining" />)

        // one spinner, on the stage actually being waited for
        expect(screen.getAllByTestId('milestone-spinner')).toHaveLength(1)
    })

    it('should name the balance restoration wait, which is the longest step', () => {
        renderWithProviders(<RecoveryProgress stage="restoringBalance" />)

        expect(
            screen.getByText(
                i18n.t(
                    'feature.wallet-service.recovery-stage-restoringBalance',
                ),
            ),
        ).toBeOnTheScreen()
    })

    // the last stage is only ever done: reaching it is the operation completing
    it('should show no spinner once ready', () => {
        renderWithProviders(<RecoveryProgress stage="ready" />)

        expect(screen.queryByTestId('milestone-spinner')).not.toBeOnTheScreen()
    })

    // a rejoin the bridge has given up on freezes at the stage it reached,
    // rather than continuing to imply progress toward a retry that will not
    // happen
    it('freezes the checklist at frozenAt: done up to it, nothing beyond, nothing active', () => {
        renderWithProviders(
            <RecoveryProgress stage="rejoining" frozenAt="verifying" />,
        )

        expect(screen.getByTestId('recovery-stage-found')).toBeOnTheScreen()
        expect(screen.getByTestId('recovery-stage-verifying')).toBeOnTheScreen()
        expect(
            screen.queryByTestId('recovery-stage-rejoining'),
        ).not.toBeOnTheScreen()
        expect(screen.queryByTestId('milestone-spinner')).not.toBeOnTheScreen()
    })
})
