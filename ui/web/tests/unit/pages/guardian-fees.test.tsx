import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useGuardianFeesDashboard } from '@fedi/common/hooks/guardianFees'
import type { MSats } from '@fedi/common/types'

import { mockUseRouter } from '../../../jest.setup'
import i18n from '../../../src/localization/i18n'
import GuardianFeesPage from '../../../src/pages/guardian-fees/[id]'
import { renderWithProviders } from '../../utils/render'

jest.mock('@fedi/common/hooks/guardianFees', () => ({
    useGuardianFeesDashboard: jest.fn(),
}))

const mockUseGuardianFeesDashboard =
    useGuardianFeesDashboard as jest.MockedFunction<
        typeof useGuardianFeesDashboard
    >

describe('/pages/guardian-fees/[id]', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
        mockUseRouter.isReady = true
        mockUseRouter.query = { id: '1' }
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

    it('should render guardian fee history rows and detail module totals', async () => {
        renderWithProviders(<GuardianFeesPage />)

        expect(
            screen.getByText(i18n.t('feature.guardian-fees.fee-history')),
        ).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /2026-04-22/ }))

        expect(screen.getByText(i18n.t('words.lightning'))).toBeInTheDocument()
        expect(screen.getByText(i18n.t('words.onchain'))).toBeInTheDocument()
        expect(screen.getByText(/10 SATS/)).toBeInTheDocument()
        expect(screen.getByText(/30 SATS/)).toBeInTheDocument()
    })
})
