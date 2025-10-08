import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import { useTxnDisplayUtils } from '@fedi/common/hooks/transactions'
import { updateTransactionNotes } from '@fedi/common/redux/transactions'
import { Federation, TransactionListEntry } from '@fedi/common/types'
import {
    getTxnDirection,
    makeTxnDetailTitleText,
    makeTxnStatusText,
} from '@fedi/common/utils/wallet'

import { useAppDispatch } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { HistoryList } from '../HistoryList'
import { TransactionIcon } from './TransactionIcon'

type TransactionsListProps = {
    transactions: TransactionListEntry[]
    loading?: boolean
    federationId: Federation['id']
}

const TransactionsList: React.FC<TransactionsListProps> = ({
    transactions,
    loading,
    federationId,
}) => {
    const [isUpdating, setIsUpdating] = useState(false)
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const toast = useToast()
    const { makeTxnAmountText, makeTxnDetailItems, makeTxnNotesText } =
        useTxnDisplayUtils(t, federationId)

    return (
        <HistoryList
            rows={transactions}
            loading={loading}
            makeIcon={txn => <TransactionIcon txn={txn} />}
            makeRowProps={txn => ({
                status: makeTxnStatusText(t, txn),
                amount: txn.amount,
                direction:
                    (txn.kind === 'lnReceive' || txn.kind === 'lnPay') &&
                    txn.state?.type === 'canceled'
                        ? undefined
                        : getTxnDirection(txn) === 'receive'
                          ? 'incoming'
                          : 'outgoing',
                timestamp: txn.createdAt,
                notes: makeTxnNotesText(txn),
            })}
            makeDetailProps={txn => ({
                title: makeTxnDetailTitleText(t, txn),
                items: makeTxnDetailItems(txn),
                amount: makeTxnAmountText(txn),
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
