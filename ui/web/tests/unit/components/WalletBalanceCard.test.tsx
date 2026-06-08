import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setPaymentType, setupStore } from '@fedi/common/redux'

import { mockUseRouter } from '../../../jest.setup'
import { WalletBalanceCard } from '../../../src/components/WalletBalanceCard'
import { transactionsRoute } from '../../../src/constants/routes'
import { renderWithProviders } from '../../utils/render'

jest.mock('../../../src/hooks', () => ({
    ...jest.requireActual('../../../src/hooks'),
    useStabilityPoolWithMountRefresh: () => ({
        formattedStableBalance: '10.00 USD',
        formattedStableBalancePending: '0.00 USD',
    }),
}))

describe('/components/WalletBalanceCard', () => {
    const federationId = 'test-federation-id'
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should navigate to bitcoin transactions when bitcoin balance is selected', async () => {
        const store = setupStore()
        store.dispatch(setPaymentType('bitcoin'))

        renderWithProviders(<WalletBalanceCard federationId={federationId} />, {
            store,
        })

        await user.click(screen.getByRole('button'))

        expect(mockUseRouter.push).toHaveBeenCalledWith(
            `${transactionsRoute}#id=${federationId}`,
        )
    })

    it('should navigate to stable transactions when stable balance is selected', async () => {
        const store = setupStore()
        store.dispatch(setPaymentType('stable-balance'))

        renderWithProviders(<WalletBalanceCard federationId={federationId} />, {
            store,
        })

        await user.click(screen.getByRole('button'))

        expect(mockUseRouter.push).toHaveBeenCalledWith(
            `${transactionsRoute}#id=${federationId}&type=stable`,
        )
    })
})
