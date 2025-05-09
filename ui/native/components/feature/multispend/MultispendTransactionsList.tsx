import { useTranslation } from 'react-i18next'

import { useMultispendTxnDisplayUtils } from '@fedi/common/hooks/transactions'
import { RpcRoomId } from '@fedi/common/types/bindings'
import { MultispendTransactionListEntry } from '@fedi/common/types/fedimint'

import { HistoryList } from '../transaction-history/HistoryList'
import { TransactionIcon } from '../transaction-history/TransactionIcon'

type MultispendTransactionsListProps = {
    roomId: RpcRoomId
    transactions: MultispendTransactionListEntry[]
    loading?: boolean
    refreshTransactions?: () => void
    loadMoreTransactions?: () => void
}

const MultispendTransactionsList = ({
    roomId,
    transactions,
    loading,
    refreshTransactions,
    loadMoreTransactions,
}: MultispendTransactionsListProps) => {
    const { t } = useTranslation()
    const {
        makeMultispendTxnStatusText,
        makeMultispendTxnCurrencyText,
        makeMultispendTxnAmountText,
        makeMultispendTxnNotesText,
        makeMultispendTxnTimestampText,
        makeMultispendTxnAmountStateText,
        makeMultispendTxnDetailItems,
    } = useMultispendTxnDisplayUtils(t, roomId)

    return (
        <HistoryList
            rows={transactions}
            loading={loading}
            makeIcon={txn => <TransactionIcon txn={txn} />}
            makeRowProps={txn => ({
                status: makeMultispendTxnStatusText(txn),
                notes: makeMultispendTxnNotesText(txn),
                amount: makeMultispendTxnAmountText(txn),
                currencyText: makeMultispendTxnCurrencyText(),
                timestamp: makeMultispendTxnTimestampText(txn),
                type: t('words.multispend'),
                amountState: makeMultispendTxnAmountStateText(txn),
            })}
            makeDetailProps={txn => ({
                id: txn.id,
                title: '',
                items: makeMultispendTxnDetailItems(txn),
                amount: makeMultispendTxnAmountText(txn, true),
                notes: makeMultispendTxnNotesText(txn),
            })}
            onRefresh={refreshTransactions}
            onEndReached={loadMoreTransactions}
            // TODO: implement fee items for multispend
            makeFeeItems={() => []}
        />
    )
}

export default MultispendTransactionsList
