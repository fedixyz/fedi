import { useNavigation } from '@react-navigation/native'
import { Button, Text } from '@rneui/themed'
import { useTranslation } from 'react-i18next'

import { selectMatrixRoomMultispendStatus } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { reset } from '../../../state/navigation'
import { Column } from '../../ui/Flex'
import { SafeAreaContainer } from '../../ui/SafeArea'
import FederationGate from '../federations/FederationGate'

const MultispendFederationGate: React.FC<{
    children: React.ReactNode
    roomId: string
}> = ({ children, roomId }) => {
    const multispendStatus = useAppSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )

    const { t } = useTranslation()
    const navigation = useNavigation()

    if (!multispendStatus)
        return (
            <SafeAreaContainer edges="all">
                <Column grow center gap="md">
                    <Text h2>
                        {t('feature.multispend.multispend-unavailable')}
                    </Text>
                    <Text caption center>
                        {t(
                            'feature.multispend.multispend-unavailable-description',
                        )}
                    </Text>
                </Column>
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

    const inviteCode =
        multispendStatus.status === 'activeInvitation'
            ? multispendStatus.state.invitation.federationInviteCode
            : multispendStatus.finalized_group.invitation.federationInviteCode

    const federationId =
        multispendStatus.status === 'activeInvitation'
            ? multispendStatus.state.federationId
            : multispendStatus.finalized_group.federationId

    return (
        <FederationGate
            federationId={federationId}
            inviteCode={inviteCode}
            fallbackContent={children}>
            {children}
        </FederationGate>
    )
}

export default MultispendFederationGate
