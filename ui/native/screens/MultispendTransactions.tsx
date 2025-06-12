import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text } from '@rneui/themed'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { useMultispendTransactions } from '@fedi/common/hooks/multispend'
import {
    selectMatrixRoom,
    selectMatrixRoomMembers,
    selectMatrixRoomMultispendStatus,
} from '@fedi/common/redux/matrix'
import { makeLog } from '@fedi/common/utils/log'

import MultispendFederationGate from '../components/feature/multispend/MultispendFederationGate'
import MultispendTransactionsList from '../components/feature/multispend/MultispendTransactionsList'
import Flex from '../components/ui/Flex'
import Header from '../components/ui/Header'
import { PressableIcon } from '../components/ui/PressableIcon'
import { useAppSelector } from '../state/hooks'
import { RootStackParamList } from '../types/navigation'
import { useNativeExport } from '../utils/hooks/export'

const log = makeLog('MultispendTransactions')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'MultispendTransactions'
>

const MultispendTransactions: React.FC<Props> = ({ route }) => {
    const { roomId } = route.params
    const { t } = useTranslation()
    const [isLoading, setIsLoading] = useState(false)
    const multispendStatus = useAppSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )
    const { transactions, fetchTransactions } = useMultispendTransactions(
        t,
        roomId,
    )
    const room = useAppSelector(s => selectMatrixRoom(s, roomId))
    const roomMembers = useAppSelector(s => selectMatrixRoomMembers(s, roomId))
    const { exportMultispendTransactionsAsCsv, isExporting } = useNativeExport()

    useEffect(() => {
        setIsLoading(true)
        fetchTransactions()
            .catch(err => {
                log.error('Error refreshing transactions', err)
            })
            .finally(() => setIsLoading(false))
    }, [fetchTransactions, t])

    const handleExport = async () => {
        if (!room) return
        await exportMultispendTransactionsAsCsv(
            room,
            multispendStatus,
            roomMembers,
        )
    }

    return (
        <MultispendFederationGate roomId={roomId}>
            <Flex grow>
                <Header
                    backButton
                    headerCenter={
                        <Text bold numberOfLines={1} adjustsFontSizeToFit>
                            {t('words.transactions')}
                        </Text>
                    }
                    headerRight={
                        isExporting ? (
                            <ActivityIndicator size={20} />
                        ) : (
                            <PressableIcon
                                svgName="Export"
                                onPress={handleExport}
                                svgProps={{ size: 20 }}
                            />
                        )
                    }
                />
                <MultispendTransactionsList
                    roomId={roomId}
                    loading={isLoading}
                    transactions={transactions}
                    refreshTransactions={() =>
                        fetchTransactions({ refresh: true })
                    }
                    loadMoreTransactions={() =>
                        fetchTransactions({ more: true })
                    }
                />
            </Flex>
        </MultispendFederationGate>
    )
}

export default MultispendTransactions
