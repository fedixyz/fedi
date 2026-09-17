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

type DashboardResult = ReturnType<typeof useGuardianFeesDashboard>

const makeDashboard = (
    overrides: Partial<DashboardResult> = {},
): DashboardResult => ({
    currentBalance: 100_000 as MSats,
    outstandingBalance: 25_000 as MSats,
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
    isOutstandingLoading: false,
    hasOutstandingError: false,
    isWithdrawing: false,
    withdrawAll: jest.fn(),
    ...overrides,
})

const renderScreen = () =>
    renderWithProviders(
        <GuardianFees
            navigation={mockNavigation as any}
            route={{ params: { federationId: '1' } } as any}
        />,
    )

describe('screens/GuardianFees', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
        mockUseGuardianFeesDashboard.mockReturnValue(makeDashboard())
    })

    afterEach(() => {
        cleanup()
    })

    it('should render guardian fee history rows and detail module totals', async () => {
        renderScreen()

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

    it('should report the fees awaiting payout in labelled units', () => {
        renderScreen()

        expect(
            screen.getByText(
                i18n.t('feature.guardian-fees.outstanding-balance'),
            ),
        ).toBeOnTheScreen()
        expect(screen.getByText(/25 SATS/)).toBeOnTheScreen()
        expect(screen.queryByText('25000')).toBeNull()
    })

    it('should explain why the fees have not arrived yet', () => {
        renderScreen()

        expect(
            screen.getByText(
                i18n.t('feature.guardian-fees.outstanding-explainer'),
            ),
        ).toBeOnTheScreen()
    })

    it('should wait for the figure rather than show an unread zero', () => {
        mockUseGuardianFeesDashboard.mockReturnValue(
            makeDashboard({
                outstandingBalance: 0 as MSats,
                isOutstandingLoading: true,
            }),
        )
        renderScreen()

        expect(
            screen.getByText(
                i18n.t('feature.guardian-fees.outstanding-balance'),
            ),
        ).toBeOnTheScreen()
        expect(screen.queryByText(/^0 SATS$/)).toBeNull()
    })

    it('should keep the explanation but drop the figure when the read fails', () => {
        mockUseGuardianFeesDashboard.mockReturnValue(
            makeDashboard({
                outstandingBalance: 0 as MSats,
                hasOutstandingError: true,
            }),
        )
        renderScreen()

        expect(
            screen.queryByText(
                i18n.t('feature.guardian-fees.outstanding-balance'),
            ),
        ).toBeNull()
        expect(
            screen.getByText(
                i18n.t('feature.guardian-fees.outstanding-explainer'),
            ),
        ).toBeOnTheScreen()
    })
})
