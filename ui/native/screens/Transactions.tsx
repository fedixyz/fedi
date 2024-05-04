import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { useTransactionHistory } from '@fedi/common/hooks/transactions'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import TransactionsList from '../components/feature/transaction-history/TransactionsList'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('Transactions')

export type Props = NativeStackScreenProps<RootStackParamList, 'Transactions'>

const Transactions: React.FC<Props> = () => {
    const { t } = useTranslation()
    const toast = useToast()
    const [isLoading, setIsLoading] = useState(false)
    const { transactions, fetchTransactions } = useTransactionHistory(fedimint)

    useEffect(() => {
        setIsLoading(true)
        fetchTransactions()
            .catch(err => {
                log.error('Error refreshing transactions', err)
                toast.error(t, err)
            })
            .finally(() => setIsLoading(false))
    }, [fetchTransactions, t, toast])

    return (
        <View style={styles.container}>
            <TransactionsList
                transactions={transactions}
                loading={transactions.length === 0 && isLoading}
                loadMoreTransactions={() => fetchTransactions({ more: true })}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
})

export default Transactions
