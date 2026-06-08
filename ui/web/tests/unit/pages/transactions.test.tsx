import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'

import { useTransactionHistory } from '@fedi/common/hooks/transactions'
import { createMockTransactionListEntry } from '@fedi/common/tests/mock-data/transactions'
import { makeTestTxnEntry } from '@fedi/common/tests/utils/transaction'

import { mockUseRouter } from '../../../jest.setup'
import TransactionsPage from '../../../src/pages/transactions'
import { renderWithProviders } from '../../utils/render'

jest.mock('@fedi/common/hooks/transactions', () => ({
    ...jest.requireActual('@fedi/common/hooks/transactions'),
    useTransactionHistory: jest.fn(),
}))

describe('/pages/transactions', () => {
    const fetchTransactions = jest.fn()
    const fetchStabilityTransactions = jest.fn()
    const standardTransaction = createMockTransactionListEntry()
    const stableTransaction = makeTestTxnEntry('sPV2Deposit', {
        txnNotes: 'stable transaction',
    })

    beforeEach(() => {
        jest.clearAllMocks()
        mockUseRouter.asPath = ''

        fetchTransactions.mockResolvedValue([])
        fetchStabilityTransactions.mockResolvedValue([])

        jest.mocked(useTransactionHistory).mockReturnValue({
            transactions: [standardTransaction, stableTransaction],
            stabilityPoolTxns: [],
            fetchTransactions,
            fetchStabilityTransactions,
        })
    })

    it('should render standard and stable transactions returned by transaction history', async () => {
        renderWithProviders(<TransactionsPage />)

        expect(await screen.findByText('test')).toBeInTheDocument()
        expect(screen.getByText('stable transaction')).toBeInTheDocument()
    })

    it('should render stable transactions when the stable transaction type is selected', async () => {
        mockUseRouter.asPath = '/transactions#type=stable'
        jest.mocked(useTransactionHistory).mockReturnValue({
            transactions: [standardTransaction],
            stabilityPoolTxns: [stableTransaction],
            fetchTransactions,
            fetchStabilityTransactions,
        })

        renderWithProviders(<TransactionsPage />)

        expect(
            await screen.findByText('stable transaction'),
        ).toBeInTheDocument()
        expect(screen.queryByText('test')).not.toBeInTheDocument()
    })
})
