import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import { useTxnDisplayUtils } from '@fedi/common/hooks/transactions'
import { selectActiveFederationId } from '@fedi/common/redux'
import { updateTransactionNotes } from '@fedi/common/redux/transactions'
import type { TransactionListEntry } from '@fedi/common/types'
import { makeTransactionAmountState } from '@fedi/common/utils/wallet'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { HistoryList } from '../transaction-history/HistoryList'
import { TransactionIcon } from '../transaction-history/TransactionIcon'

type StabilityTransactionsListProps = {
    transactions: TransactionListEntry[]
    loading?: boolean
    loadMoreTransactions: () => void
}

const StabilityTransactionsList = ({
    transactions,
    loading,
    loadMoreTransactions,
}: StabilityTransactionsListProps) => {
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const toast = useToast()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const [isUpdating, setIsUpdating] = useState(false)
    const {
        makeStabilityTxnDetailItems,
        getCurrencyText,
        makeStabilityTxnFeeDetailItems,
        makeTxnAmountText,
        makeTxnTypeText,
        makeTxnNotesText,
        makeTxnStatusText,
        makeStabilityTxnDetailTitleText,
    } = useTxnDisplayUtils(t, true)

    return (
        <HistoryList
            rows={transactions}
            loading={loading}
            makeIcon={txn => <TransactionIcon txn={txn} />}
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
                id: txn.id,
                title: makeStabilityTxnDetailTitleText(txn),
                items: makeStabilityTxnDetailItems(txn),
                amount: makeTxnAmountText(txn, true),
                notes: txn.txnNotes,
                onSaveNotes: async (notes: string) => {
                    if (isUpdating) return // Prevent multiple simultaneous updates

                    try {
                        setIsUpdating(true)
                        if (!activeFederationId)
                            throw new Error('errors.unknown-error')
                        await dispatch(
                            updateTransactionNotes({
                                fedimint,
                                notes,
                                federationId: activeFederationId,
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
