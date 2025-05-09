import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useMultispendTransactions } from '@fedi/common/hooks/multispend'
import { makeLog } from '@fedi/common/utils/log'

import MultispendTransactionsList from '../components/feature/multispend/MultispendTransactionsList'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { RootStackParamList } from '../types/navigation'

const log = makeLog('MultispendTransactions')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'MultispendTransactions'
>

const MultispendTransactions: React.FC<Props> = ({ route }) => {
    const { roomId } = route.params
    const { t } = useTranslation()
    const { theme } = useTheme()
    const [isLoading, setIsLoading] = useState(false)
    const { transactions, fetchTransactions } = useMultispendTransactions(
        t,
        roomId,
    )

    const style = styles(theme)

    useEffect(() => {
        setIsLoading(true)
        fetchTransactions()
            .catch(err => {
                log.error('Error refreshing transactions', err)
            })
            .finally(() => setIsLoading(false))
    }, [fetchTransactions, t])

    return (
        <SafeAreaContainer edges="notop" style={style.container}>
            <MultispendTransactionsList
                roomId={roomId}
                loading={isLoading}
                transactions={transactions}
                refreshTransactions={() => fetchTransactions({ refresh: true })}
                loadMoreTransactions={() => fetchTransactions({ more: true })}
            />
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
        },
        content: {
            flex: 1,
            paddingHorizontal: theme.spacing.md,
        },
        header: {
            gap: theme.spacing.xl,
            paddingVertical: theme.spacing.xl,
            alignItems: 'center',
        },
        headerText: { textAlign: 'center' },
        learnMoreContainer: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
        learnMoreButton: {
            padding: theme.spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
    })

export default MultispendTransactions
