import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { useTxnDisplayUtils } from '@fedi/common/hooks/transactions'
import { updateTransactionNotes } from '@fedi/common/redux/transactions'
import type { Federation, TransactionListEntry } from '@fedi/common/types'
import { makeTransactionAmountState } from '@fedi/common/utils/transaction'

import { useAppDispatch } from '../../../state/hooks'
import { HistoryList } from '../transaction-history/HistoryList'
import { TransactionIcon } from '../transaction-history/TransactionIcon'

type StabilityTransactionsListProps = {
    transactions: TransactionListEntry[]
    loading?: boolean
    loadMoreTransactions: () => void
    federationId: Federation['id']
}

const StabilityTransactionsList = ({
    transactions,
    loading,
    loadMoreTransactions,
    federationId,
}: StabilityTransactionsListProps) => {
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const { t } = useTranslation()
    const toast = useToast()
    const [isUpdating, setIsUpdating] = useState(false)
    const {
        makeStabilityTxnDetailItems,
        getCurrencyText,
        getShowAskFedi,
        makeStabilityTxnFeeDetailItems,
        makeTxnAmountText,
        makeTxnTypeText,
        makeTxnNotesText,
        makeTxnStatusText,
        makeTxnDetailTitleText,
    } = useTxnDisplayUtils(t, federationId, true)

    return (
        <HistoryList
            federationId={federationId}
            rows={transactions}
            loading={loading}
            makeIcon={txn => <TransactionIcon txn={txn} />}
            makeShowAskFedi={txn => getShowAskFedi(txn)}
            makeRowProps={txn => ({
                status: makeTxnStatusText(txn),
                notes: makeTxnNotesText(txn),
                amount: makeTxnAmountText(txn, false),
                currencyText: getCurrencyText(txn),
                timestamp: txn.createdAt,
                type: makeTxnTypeText(txn),
                amountState: makeTransactionAmountState(txn),
            })}
            makeDetailProps={txn => ({
                title: makeTxnDetailTitleText(txn),
                items: makeStabilityTxnDetailItems(txn),
                amount: makeTxnAmountText(txn, true),
                notes: makeTxnNotesText(txn),
                txn,
                onSaveNotes: async (notes: string) => {
                    if (isUpdating) return // Prevent multiple simultaneous updates

                    try {
                        setIsUpdating(true)
                        if (!federationId)
                            throw new Error('errors.unknown-error')
                        await dispatch(
                            updateTransactionNotes({
                                fedimint,
                                notes,
                                federationId,
                                transactionId: txn.id,
                            }),
                        ).unwrap()
                    } catch (err) {
                        toast.error(t, err)
                    } finally {
                        setIsUpdating(false)
                    }
                },
            })}
            onEndReached={loadMoreTransactions}
            makeFeeItems={makeStabilityTxnFeeDetailItems}
        />
    )
}

export default StabilityTransactionsList
