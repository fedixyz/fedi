import { cleanup, screen, userEvent } from '@testing-library/react-native'

import { useGuardianFeesDashboard } from '@fedi/common/hooks/guardianFees'
import type { MSats } from '@fedi/common/types'

import i18n from '../../../localization/i18n'
import GuardianFees from '../../../screens/GuardianFees'
import { mockNavigation } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

jest.mock('@fedi/common/hooks/guardianFees', () => ({
    useGuardianFeesDashboard: jest.fn(),
}))

const mockUseGuardianFeesDashboard =
    useGuardianFeesDashboard as jest.MockedFunction<
        typeof useGuardianFeesDashboard
    >

describe('screens/GuardianFees', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
        mockUseGuardianFeesDashboard.mockReturnValue({
            currentBalance: 100_000 as MSats,
            dayBuckets: [
                {
                    dayKey: '2026-04-22',
                    totalAmountRemitted: 40_000 as MSats,
                    remittanceCount: 2,
                    moduleTotals: [
                        { module: 'ln', totalAmount: 10_000 as MSats },
                        { module: 'wallet', totalAmount: 30_000 as MSats },
                    ],
                },
            ],
            isBalanceLoading: false,
            isWithdrawing: false,
            withdrawAll: jest.fn(),
        })
    })

    afterEach(() => {
        cleanup()
    })

    it('should render guardian fee history rows and detail module totals', async () => {
        renderWithProviders(
            <GuardianFees
                navigation={mockNavigation as any}
                route={{ params: { federationId: '1' } } as any}
            />,
        )

        expect(
            screen.getByText(i18n.t('feature.guardian-fees.fee-history')),
        ).toBeOnTheScreen()

        const items = await screen.findAllByTestId('transaction-item')
        expect(items).toHaveLength(1)

        await user.press(items[0])

        expect(screen.getByText(i18n.t('words.lightning'))).toBeOnTheScreen()
        expect(screen.getByText(i18n.t('words.onchain'))).toBeOnTheScreen()
        expect(screen.getByText(/10 SATS/)).toBeOnTheScreen()
        expect(screen.getByText(/30 SATS/)).toBeOnTheScreen()
    })
})
