import { useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import { useTxnDisplayUtils } from '@fedi/common/hooks/transactions'
import { selectActiveFederationId, selectCurrency } from '@fedi/common/redux'
import { updateTransactionNotes } from '@fedi/common/redux/transactions'
import type { Transaction } from '@fedi/common/types'
import {
    makeStabilityTxnDetailTitleText,
    makeStabilityTxnStatusSubtext,
    makeStabilityTxnStatusText,
} from '@fedi/common/utils/wallet'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { HistoryIcon } from '../transaction-history/HistoryIcon'
import { HistoryList } from '../transaction-history/HistoryList'
import { CurrencyAvatar } from './CurrencyAvatar'

type StabilityTransactionsListProps = {
    transactions: Transaction[]
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
    const { theme } = useTheme()
    const toast = useToast()
    const selectedCurrency = useAppSelector(selectCurrency)
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const {
        makeStabilityTxnDetailAmountText,
        makeStabilityTxnAmountText,
        makeStabilityTxnDetailItems,
        makeStabilityTxnFeeDetailItems,
    } = useTxnDisplayUtils(t)

    return (
        <HistoryList
            rows={transactions}
            loading={loading}
            makeIcon={() => (
                <HistoryIcon>
                    <CurrencyAvatar size={theme.sizes.historyIcon} />
                </HistoryIcon>
            )}
            makeRowProps={txn => ({
                status: makeStabilityTxnStatusText(t, txn),
                notes: makeStabilityTxnStatusSubtext(t, txn),
                amount: makeStabilityTxnAmountText(txn),
                currencyText: selectedCurrency,
                timestamp: txn.createdAt,
            })}
            makeDetailProps={txn => ({
                title: makeStabilityTxnDetailTitleText(t, txn),
                items: makeStabilityTxnDetailItems(txn),
                amount: makeStabilityTxnDetailAmountText(txn),
                notes: txn.notes,
                onSaveNotes: async (notes: string) => {
                    try {
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
                    }
                },
            })}
            onEndReached={loadMoreTransactions}
            makeFeeItems={makeStabilityTxnFeeDetailItems}
        />
    )
}

export default StabilityTransactionsList
