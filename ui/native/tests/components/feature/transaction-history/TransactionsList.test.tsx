import { cleanup, screen } from '@testing-library/react-native'

import { createMockTransactionListEntry } from '@fedi/common/tests/mock-data/transactions'

import TransactionsList from '../../../../components/feature/transaction-history/TransactionsList'
import { renderWithProviders } from '../../../utils/render'

const txn = createMockTransactionListEntry()
const txn2 = createMockTransactionListEntry({
    id: 'txn234',
    amount: 5000000,
})

const transactions = [txn, txn2]

describe('components/feature/transaction-history/TransactionsList', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    describe('When the component is rendered', () => {
        it('should display the list of transactions', async () => {
            renderWithProviders(
                <TransactionsList
                    transactions={transactions}
                    loading={false}
                    loadMoreTransactions={() => Promise.resolve()}
                    federationId="1"
                />,
            )

            const items = await screen.findAllByTestId('transaction-item')
            expect(items).toHaveLength(2)
        })
    })
})
