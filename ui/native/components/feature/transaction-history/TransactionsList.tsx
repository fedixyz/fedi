import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import { useTxnDisplayUtils } from '@fedi/common/hooks/transactions'
import { selectActiveFederationId } from '@fedi/common/redux'
import { updateTransactionNotes } from '@fedi/common/redux/transactions'
import { Transaction } from '@fedi/common/types'
import {
    makeTxnDetailTitleText,
    makeTxnStatusText,
} from '@fedi/common/utils/wallet'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { HistoryList } from './HistoryList'
import { TransactionIcon } from './TransactionIcon'

type TransactionsListProps = {
    transactions: Transaction[]
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
        preferredCurrency,
        makeTxnNotesText,
        makeTxnAmountText,
        makeTxnDetailAmountText,
        makeTxnFeeDetailItems,
        makeTxnDetailItems,
    } = useTxnDisplayUtils(t)

    return (
        <HistoryList
            rows={transactions}
            loading={loading}
            makeIcon={txn => <TransactionIcon txn={txn} />}
            makeRowProps={txn => ({
                status: makeTxnStatusText(t, txn),
                amount: makeTxnAmountText(txn),
                currencyText: preferredCurrency,
                timestamp: txn.createdAt,
                notes: makeTxnNotesText(txn),
            })}
            makeDetailProps={txn => ({
                title: makeTxnDetailTitleText(t, txn),
                items: makeTxnDetailItems(txn),
                amount: makeTxnDetailAmountText(txn),
                notes: txn.notes,
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
