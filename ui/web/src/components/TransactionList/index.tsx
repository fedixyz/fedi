import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import { useTxnDisplayUtils } from '@fedi/common/hooks/transactions'
import { updateTransactionNotes } from '@fedi/common/redux/transactions'
import type { Federation, TransactionListEntry } from '@fedi/common/types'
import {
    makeTxnDetailTitleText,
    makeTxnIconDisplay,
    makeTxnStatusBadge,
    makeTxnStatusText,
    type TxnIconColor,
} from '@fedi/common/utils/transaction'

import { useAppDispatch } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { theme } from '../../styles'
import { HistoryList } from '../HistoryList'
import { TransactionIcon } from './TransactionIcon'

type TransactionsListProps = {
    transactions: TransactionListEntry[]
    loading?: boolean
    loadMoreTransactions?: () => Promise<unknown> | void
    federationId: Federation['id']
    isStabilityPool?: boolean
}

const getTxnIconColor = (color: TxnIconColor) => {
    return color === 'stable' ? theme.colors.moneyGreen : theme.colors.orange
}

const TransactionsList: React.FC<TransactionsListProps> = ({
    transactions,
    loading,
    loadMoreTransactions,
    federationId,
    isStabilityPool = false,
}) => {
    const [isUpdating, setIsUpdating] = useState(false)
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const toast = useToast()
    const {
        getCurrencyText,
        makeStabilityTxnDetailItems,
        makeStabilityTxnFeeDetailItems,
        makeTxnAmountText,
        makeTxnDetailItems,
        makeTxnFeeDetailItems,
        makeTxnNotesText,
        makeTxnTypeText,
    } = useTxnDisplayUtils(t, federationId, isStabilityPool)

    return (
        <HistoryList
            rows={transactions}
            loading={loading}
            onEndReached={loadMoreTransactions}
            makeIcon={txn => {
                const badge = makeTxnStatusBadge(txn)
                const iconDisplay = makeTxnIconDisplay(txn)

                return (
                    <TransactionIcon
                        badge={badge}
                        color={getTxnIconColor(iconDisplay.color)}
                        icon={iconDisplay.icon}
                    />
                )
            }}
            makeRowProps={txn => ({
                status: makeTxnStatusText(t, txn),
                amount: makeTxnAmountText(txn),
                currencyText: getCurrencyText(txn),
                timestamp: txn.createdAt,
                notes: makeTxnNotesText(txn),
                type: makeTxnTypeText(txn),
            })}
            makeDetailProps={txn => ({
                txn,
                title: makeTxnDetailTitleText(t, txn),
                items: isStabilityPool
                    ? makeStabilityTxnDetailItems(txn)
                    : makeTxnDetailItems(txn),
                feeItems: isStabilityPool
                    ? makeStabilityTxnFeeDetailItems(txn)
                    : makeTxnFeeDetailItems(txn),
                amount: makeTxnAmountText(txn, true),
                notes: makeTxnNotesText(txn),
                onSaveNotes: async (notes: string) => {
                    if (isUpdating) return // Prevent multiple updates

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
                        toast.error(t, err, 'errors.unknown-error')
                    } finally {
                        setIsUpdating(false)
                    }
                },
            })}
        />
    )
}

export default TransactionsList
