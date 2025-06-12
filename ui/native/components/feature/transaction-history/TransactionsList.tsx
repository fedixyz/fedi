import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import { useTxnDisplayUtils } from '@fedi/common/hooks/transactions'
import { selectActiveFederationId } from '@fedi/common/redux'
import { updateTransactionNotes } from '@fedi/common/redux/transactions'
import { TransactionListEntry } from '@fedi/common/types'
import { makeTransactionAmountState } from '@fedi/common/utils/wallet'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { HistoryList } from './HistoryList'
import { TransactionIcon } from './TransactionIcon'

type TransactionsListProps = {
    transactions: TransactionListEntry[]
    loading?: boolean
    loadMoreTransactions?: () => void
}

const TransactionsList: React.FC<TransactionsListProps> = ({
    transactions,
    loading,
    loadMoreTransactions,
}) => {
    const [isUpdating, setIsUpdating] = useState(false)
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const toast = useToast()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const {
        getCurrencyText,
        getShowAskFedi,
        makeTxnNotesText,
        makeTxnAmountText,
        makeTxnFeeDetailItems,
        makeTxnDetailItems,
        makeTxnTypeText,
        makeTxnStatusText,
        makeTxnDetailTitleText,
    } = useTxnDisplayUtils(t)

    return (
        <HistoryList
            rows={transactions}
            loading={loading}
            makeIcon={txn => <TransactionIcon txn={txn} />}
            makeShowAskFedi={txn => getShowAskFedi(txn)}
            makeRowProps={txn => ({
                id: txn.id,
                status: makeTxnStatusText(txn),
                amount: makeTxnAmountText(txn),
                currencyText: getCurrencyText(txn),
                timestamp: txn.createdAt,
                notes: makeTxnNotesText(txn),
                type: makeTxnTypeText(txn),
                amountState: makeTransactionAmountState(txn),
            })}
            makeDetailProps={txn => ({
                title: makeTxnDetailTitleText(txn),
                items: makeTxnDetailItems(txn),
                amount: makeTxnAmountText(txn, true),
                notes: txn.txnNotes,
                txn,
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
            makeFeeItems={makeTxnFeeDetailItems}
            onEndReached={loadMoreTransactions}
        />
    )
}

export default TransactionsList
