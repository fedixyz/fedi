import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Button } from '@rneui/themed'
import { useTranslation } from 'react-i18next'

import { useObserveMultispendAccountInfo } from '@fedi/common/hooks/matrix'
import { useMultispendDisplayUtils } from '@fedi/common/hooks/multispend'
import { selectMatrixRoomMultispendStatus } from '@fedi/common/redux'

import MultispendFederationGate from '../components/feature/multispend/MultispendFederationGate'
import MultispendWalletHeader from '../components/feature/multispend/MultispendWalletHeader'
import MultispendFinalized from '../components/feature/multispend/finalized/MultispendFinalized'
import MultispendActiveInvitation from '../components/feature/multispend/invitation/MultispendActiveInvitation'
import Flex from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppSelector } from '../state/hooks'
import { reset } from '../state/navigation'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'GroupMultispend'
>

const GroupMultispend: React.FC<Props> = ({ route, navigation }: Props) => {
    const { roomId } = route.params

    useObserveMultispendAccountInfo(roomId)

    const multispendStatus = useAppSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )

    const { t } = useTranslation()
    const { shouldShowHeader } = useMultispendDisplayUtils(t, roomId)

    if (!multispendStatus)
        return (
            <SafeAreaContainer edges="all">
                <Flex grow center gap="md">
                    <Text h2>
                        {t('feature.multispend.multispend-unavailable')}
                    </Text>
                    <Text caption center>
                        {t(
                            'feature.multispend.multispend-unavailable-description',
                        )}
                    </Text>
                </Flex>
                <Button
                    title={t('phrases.go-back')}
                    onPress={() => {
                        navigation.dispatch(
                            reset('ChatRoomConversation', { roomId }),
                        )
                    }}
                />
            </SafeAreaContainer>
        )

    return (
        <MultispendFederationGate roomId={roomId}>
            <Flex grow>
                {shouldShowHeader && <MultispendWalletHeader roomId={roomId} />}
                {multispendStatus.status === 'activeInvitation' && (
                    <MultispendActiveInvitation roomId={roomId} />
                )}
                {multispendStatus.status === 'finalized' && (
                    <MultispendFinalized roomId={roomId} />
                )}
            </Flex>
        </MultispendFederationGate>
    )
}

export default GroupMultispend
