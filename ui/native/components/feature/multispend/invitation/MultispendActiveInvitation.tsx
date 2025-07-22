import { useNavigation } from '@react-navigation/native'
import { Button, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'

import { useMultispendVoting } from '@fedi/common/hooks/multispend'

import { fedimint } from '../../../../bridge'
import CustomOverlay from '../../../ui/CustomOverlay'
import Flex from '../../../ui/Flex'
import { SafeAreaContainer } from '../../../ui/SafeArea'
import GroupVoters from './GroupVoters'

const MultispendActiveInvitation: React.FC<{
    roomId: string
}> = ({ roomId }) => {
    const navigation = useNavigation()
    const { t } = useTranslation()
    const { theme } = useTheme()
    const {
        isLoading,
        needsToJoin,
        handleAcceptMultispend,
        joinBeforeAcceptContents,
        canVote,
    } = useMultispendVoting({
        t,
        fedimint,
        roomId,
        onJoinFederation: (invite: string) => {
            navigation.navigate('JoinFederation', {
                invite,
            })
        },
    })

    return (
        <SafeAreaContainer edges="bottom">
            <GroupVoters roomId={roomId} />
            {canVote && (
                <Flex gap="md" style={{ paddingHorizontal: theme.spacing.md }}>
                    <Button
                        disabled={isLoading}
                        onPress={handleAcceptMultispend}>
                        {t('words.accept')}
                    </Button>
                    {joinBeforeAcceptContents && (
                        <CustomOverlay
                            show={needsToJoin}
                            contents={joinBeforeAcceptContents}
                        />
                    )}
                </Flex>
            )}
        </SafeAreaContainer>
    )
}

export default MultispendActiveInvitation
