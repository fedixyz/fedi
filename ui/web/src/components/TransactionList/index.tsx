import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import { useTxnDisplayUtils } from '@fedi/common/hooks/transactions'
import {
    isStabilityTransactionHistoryEntry,
    updateTransactionNotes,
} from '@fedi/common/redux/transactions'
import type { Federation, TransactionListEntry } from '@fedi/common/types'
import {
    makeTxnDetailTitleText,
    makeTxnStatusBadge,
    makeTxnStatusText,
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
        makeTxnNotesText,
    } = useTxnDisplayUtils(t, federationId, isStabilityPool)

    return (
        <HistoryList
            rows={transactions}
            loading={loading}
            onEndReached={loadMoreTransactions}
            makeIcon={txn => {
                const isStabilityTransaction =
                    isStabilityTransactionHistoryEntry(txn)
                const badge = makeTxnStatusBadge(txn)
                const isArrowBadge =
                    badge === 'incoming' || badge === 'outgoing'

                return (
                    <TransactionIcon
                        badge={badge}
                        badgeColor={
                            isStabilityTransaction && isArrowBadge
                                ? theme.colors.moneyGreen
                                : undefined
                        }
                        color={
                            isStabilityTransaction
                                ? theme.colors.moneyGreen
                                : theme.colors.orange
                        }
                        icon={
                            isStabilityTransaction
                                ? 'UsdCircleFilled'
                                : 'BitcoinCircle'
                        }
                    />
                )
            }}
            makeRowProps={txn => ({
                status: makeTxnStatusText(t, txn),
                amount: makeTxnAmountText(txn),
                currencyText: getCurrencyText(txn),
                timestamp: txn.createdAt,
                notes: makeTxnNotesText(txn),
            })}
            makeDetailProps={txn => ({
                txn,
                title: makeTxnDetailTitleText(t, txn),
                items: isStabilityPool
                    ? makeStabilityTxnDetailItems(txn)
                    : makeTxnDetailItems(txn),
                feeItems: isStabilityPool
                    ? makeStabilityTxnFeeDetailItems(txn)
                    : undefined,
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
