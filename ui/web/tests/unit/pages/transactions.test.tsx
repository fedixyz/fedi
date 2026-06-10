import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'

import { useTransactionHistoryList } from '@fedi/common/hooks/transactions'
import { createMockTransactionListEntry } from '@fedi/common/tests/mock-data/transactions'
import { makeTestTxnEntry } from '@fedi/common/tests/utils/transaction'

import { mockUseRouter } from '../../../jest.setup'
import TransactionsPage from '../../../src/pages/transactions'
import { renderWithProviders } from '../../utils/render'

jest.mock('@fedi/common/hooks/transactions', () => ({
    ...jest.requireActual('@fedi/common/hooks/transactions'),
    useTransactionHistoryList: jest.fn(),
}))

describe('/pages/transactions', () => {
    const fetchTransactions = jest.fn()
    const loadMoreTransactions = jest.fn()
    const standardTransaction = createMockTransactionListEntry()
    const stableTransaction = makeTestTxnEntry('sPV2Deposit', {
        txnNotes: 'stable transaction',
    })

    beforeEach(() => {
        jest.clearAllMocks()
        mockUseRouter.asPath = ''

        fetchTransactions.mockResolvedValue([])
        loadMoreTransactions.mockResolvedValue([])

        jest.mocked(useTransactionHistoryList).mockReturnValue({
            transactions: [standardTransaction, stableTransaction],
            isLoading: false,
            loading: false,
            refreshTransactions: fetchTransactions,
            loadMoreTransactions,
        })
    })

    it('should render standard and stable transactions returned by transaction history', async () => {
        renderWithProviders(<TransactionsPage />)

        expect(await screen.findByText('test')).toBeInTheDocument()
        expect(screen.getByText('stable transaction')).toBeInTheDocument()
        expect(screen.getByText('Lightning')).toBeInTheDocument()
        expect(screen.getByText('Stable Balance')).toBeInTheDocument()
    })

    it('should render stable transactions when the stable transaction type is selected', async () => {
        mockUseRouter.asPath = '/transactions#type=stable'
        jest.mocked(useTransactionHistoryList).mockReturnValue({
            transactions: [stableTransaction],
            isLoading: false,
            loading: false,
            refreshTransactions: fetchTransactions,
            loadMoreTransactions,
        })

        renderWithProviders(<TransactionsPage />)

        expect(
            await screen.findByText('stable transaction'),
        ).toBeInTheDocument()
        expect(screen.queryByText('test')).not.toBeInTheDocument()
    })
})
