import '@testing-library/jest-dom'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setupStore } from '@fedi/common/redux'
import { mockFederationWithSPV2 } from '@fedi/common/tests/mock-data/federation'
import {
    createMockFedimintBridge,
    MockFedimintBridge,
} from '@fedi/common/tests/utils/fedimint'
import { LoadedFederation, Sats, SupportedCurrency } from '@fedi/common/types'
import { StabilityDeposit } from '@fedi/web/src/components/Stability/Deposit'
import i18n from '@fedi/web/src/localization/i18n'
import { AppState } from '@fedi/web/src/state/store'
import { renderWithProviders } from '@fedi/web/tests/utils/render'

import { mockUseRouter } from '../../../../jest.setup'

const mockUseDepositForm = jest.fn()
const mockUseMonitorStabilityPool = jest.fn()
const stableFederation: LoadedFederation = {
    ...mockFederationWithSPV2,
    clientConfig: {
        global: {},
        modules: {
            multi_sig_stability_pool: {
                kind: 'multi_sig_stability_pool',
                min_allowed_seek: 1000,
                max_allowed_provide_fee_rate_ppb: 0,
                min_allowed_cancellation_bps: 0,
                cycle_duration: { secs: 600, nanos: 0 },
            },
        },
    },
}

jest.mock('@fedi/common/hooks/amount', () => ({
    ...jest.requireActual('@fedi/common/hooks/amount'),
    useDepositForm: (federationId: string) => mockUseDepositForm(federationId),
}))

jest.mock('@fedi/common/hooks/stabilitypool', () => ({
    ...jest.requireActual('@fedi/common/hooks/stabilitypool'),
    useMonitorStabilityPool: (federationId: string) =>
        mockUseMonitorStabilityPool(federationId),
}))

jest.mock('@fedi/web/src/components/AmountInput', () => ({
    AmountInput: ({
        amount,
        federationId,
        maximumAmount,
        minimumAmount,
        submitAttempts,
    }: {
        amount: number
        federationId: string
        maximumAmount: number
        minimumAmount: number
        submitAttempts: number
    }) => (
        <div>
            amount:{amount} federation:{federationId} min:{minimumAmount} max:
            {maximumAmount} attempts:{submitAttempts}
        </div>
    ),
}))

describe('/components/Stability/Deposit', () => {
    const user = userEvent.setup()
    let fedimint: MockFedimintBridge
    let state: AppState

    beforeEach(() => {
        jest.clearAllMocks()
        mockUseRouter.query = { id: stableFederation.id }
        mockUseRouter.push.mockClear()
        mockUseDepositForm.mockReturnValue({
            inputAmount: 2000 as Sats,
            setInputAmount: jest.fn(),
            minimumAmount: 1,
            maximumAmount: 2000,
        })
        fedimint = createMockFedimintBridge({
            estimateSPv2DepositFees: new Promise(() => undefined),
        })
    })

    const renderComponent = () => {
        const store = setupStore()
        state = store.getState() as AppState

        return renderWithProviders(<StabilityDeposit />, {
            fedimint,
            preloadedState: {
                currency: {
                    ...state.currency,
                    overrideCurrency: SupportedCurrency.USD,
                    currencyLocale: 'en-US',
                    btcUsdRate: 100000,
                },
                environment: {
                    ...state.environment,
                    transactionDisplayType: 'fiat',
                    amountInputType: 'sats',
                },
                federation: {
                    ...state.federation,
                    federations: [stableFederation],
                    selectedFederationId: stableFederation.id,
                    recentlyUsedFederationIds: [stableFederation.id],
                    payFromFederationId: stableFederation.id,
                },
            },
        })
    }

    it('should render the route federation in the wallet switcher', () => {
        renderComponent()

        expect(
            screen.getByLabelText('stability-balance-tile'),
        ).toHaveTextContent(stableFederation.name)
    })

    it('should show the confirmation dialog when next is clicked', async () => {
        renderComponent()

        await user.click(
            screen.getByRole('button', { name: i18n.t('words.next') }),
        )

        const dialog = screen.getByRole('dialog', {
            name: i18n.t('feature.stabilitypool.confirm-deposit'),
        })

        expect(dialog).toBeInTheDocument()
        expect(within(dialog).getByText('2.00')).toBeInTheDocument()
    })
})
