import { cleanup, screen, userEvent } from '@testing-library/react-native'

import * as transactionsModule from '@fedi/common/hooks/transactions'
import { createMockTransactionListEntry } from '@fedi/common/tests/mock-data/transactions'
import i18n from '@fedi/native/localization/i18n'

import Transactions from '../../../screens/Transactions'
import { mockNavigation } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const txn = createMockTransactionListEntry()
const txn2 = createMockTransactionListEntry({
    id: 'txn234',
    amount: 5000000,
})
const transactions = [txn, txn2]
const mockUseTransactionHistoryList = (
    transactionsList: typeof transactions,
) => {
    jest.spyOn(transactionsModule, 'useTransactionHistoryList').mockReturnValue(
        {
            transactions: transactionsList,
            isLoading: false,
            loading: false,
            refreshTransactions: jest.fn(),
            loadMoreTransactions: jest.fn(),
        },
    )
}

describe('screens/Transactions', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    describe('When there are no transactions', () => {
        it('should render "no transactions" text', async () => {
            mockUseTransactionHistoryList([])

            renderWithProviders(
                <Transactions
                    navigation={mockNavigation as any}
                    route={{ params: { federationId: '1' } } as any}
                />,
            )

            const text = await screen.findByText(
                i18n.t('phrases.no-transactions'),
            )
            expect(text).toBeOnTheScreen()
        })
    })

    describe('When there are transactions', () => {
        it('should render the list of transactions', async () => {
            mockUseTransactionHistoryList(transactions)

            renderWithProviders(
                <Transactions
                    navigation={mockNavigation as any}
                    route={{ params: { federationId: '1' } } as any}
                />,
            )

            const items = await screen.findAllByTestId('transaction-item')
            expect(items).toHaveLength(2)
        })
    })

    describe('When a transaction is clicked on', () => {
        it('should show the transaction overlay', async () => {
            mockUseTransactionHistoryList(transactions)

            renderWithProviders(
                <Transactions
                    navigation={mockNavigation as any}
                    route={{ params: { federationId: '1' } } as any}
                />,
            )

            const items = await screen.findAllByTestId('transaction-item')

            // Press the first item
            await user.press(items[0])

            expect(screen.getByTestId('center-overlay')).toBeOnTheScreen()
            expect(screen.getByText('You received')).toBeOnTheScreen()
            expect(screen.getByText('1,000 SATS')).toBeOnTheScreen()
        })
    })
})
