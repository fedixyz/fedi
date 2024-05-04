import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { useTransactionHistory } from '@fedi/common/hooks/transactions'
import { refreshActiveStabilityPool } from '@fedi/common/redux'

import { fedimint } from '../bridge'
import StabilityTransactionsList from '../components/feature/stabilitypool/StabilityTransactionsList'
import { useAppDispatch } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StabilityHistory'
>

const StabilityHistory: React.FC<Props> = () => {
    const [isLoading, setIsLoading] = useState(true)
    const dispatch = useAppDispatch()
    const { stabilityPoolTxns, fetchTransactions } =
        useTransactionHistory(fedimint)

    const refreshStabilityPoolHistory = useCallback(async () => {
        await fetchTransactions()
        await dispatch(refreshActiveStabilityPool({ fedimint }))
    }, [dispatch, fetchTransactions])

    useEffect(() => {
        refreshStabilityPoolHistory().finally(() => setIsLoading(false))
    }, [dispatch, refreshStabilityPoolHistory])

    return (
        <View style={styles.container}>
            <StabilityTransactionsList
                transactions={stabilityPoolTxns}
                loading={isLoading}
                loadMoreTransactions={fetchTransactions}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'space-evenly',
    },
})

export default StabilityHistory
