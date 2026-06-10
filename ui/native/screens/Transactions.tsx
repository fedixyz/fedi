import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import { useTransactionHistoryList } from '@fedi/common/hooks/transactions'
import { makeLog } from '@fedi/common/utils/log'

import TransactionsList from '../components/feature/transaction-history/TransactionsList'
import { Column } from '../components/ui/Flex'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('Transactions')

export type Props = NativeStackScreenProps<RootStackParamList, 'Transactions'>

const Transactions: React.FC<Props> = ({ route }: Props) => {
    const { federationId } = route.params
    const { t } = useTranslation()
    const toast = useToast()
    const handleFetchError = useCallback(
        (err: unknown) => {
            log.error('Error refreshing transactions', err)
            toast.error(t, err)
        },
        [t, toast],
    )
    const { transactions, loading, loadMoreTransactions } =
        useTransactionHistoryList({
            federationId,
            type: 'transactions',
            initialLoading: false,
            onError: handleFetchError,
        })

    return (
        <Column grow>
            <TransactionsList
                transactions={transactions}
                loading={loading}
                loadMoreTransactions={loadMoreTransactions}
                federationId={federationId}
            />
        </Column>
    )
}

export default Transactions
