import { useTranslation } from 'react-i18next'

import {
    useMultispendTxnDisplayUtils,
    useTxnDisplayUtils,
} from '@fedi/common/hooks/transactions'
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
        makeMultispendTxnStatusBadge,
    } = useMultispendTxnDisplayUtils(t, roomId)

    const { getShowAskFedi } = useTxnDisplayUtils(t)

    return (
        <HistoryList
            rows={transactions}
            loading={loading}
            makeShowAskFedi={txn => getShowAskFedi(txn)}
            makeIcon={txn => (
                <TransactionIcon
                    txn={txn}
                    customBadge={makeMultispendTxnStatusBadge(txn)}
                />
            )}
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
                title: '',
                items: makeMultispendTxnDetailItems(txn),
                amount: makeMultispendTxnAmountText(txn, true),
                notes: makeMultispendTxnNotesText(txn),
                txn,
            })}
            onRefresh={refreshTransactions}
            onEndReached={loadMoreTransactions}
            // TODO: implement fee items for multispend
            makeFeeItems={() => []}
        />
    )
}

export default MultispendTransactionsList
