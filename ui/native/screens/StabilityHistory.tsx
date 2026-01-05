import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useTransactionHistory } from '@fedi/common/hooks/transactions'
import { refreshStabilityPool } from '@fedi/common/redux'

import StabilityTransactionsList from '../components/feature/stabilitypool/StabilityTransactionsList'
import { useAppDispatch } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StabilityHistory'
>

const StabilityHistory: React.FC<Props> = ({ route }: Props) => {
    const { federationId } = route.params

    const [isLoading, setIsLoading] = useState(true)
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()

    const { stabilityPoolTxns, fetchTransactions } =
        useTransactionHistory(federationId)

    const refreshStabilityPoolHistory = useCallback(async () => {
        await fetchTransactions()
        await dispatch(refreshStabilityPool({ fedimint, federationId }))
    }, [dispatch, fetchTransactions, federationId, fedimint])

    useEffect(() => {
        refreshStabilityPoolHistory().finally(() => setIsLoading(false))
    }, [dispatch, refreshStabilityPoolHistory])

    return (
        <View style={styles.container}>
            <StabilityTransactionsList
                federationId={federationId}
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
