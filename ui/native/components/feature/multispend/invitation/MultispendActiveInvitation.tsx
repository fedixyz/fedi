import { useNavigation } from '@react-navigation/native'
import { Button, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useMultispendVoting } from '@fedi/common/hooks/multispend'

import { fedimint } from '../../../../bridge'
import CustomOverlay from '../../../ui/CustomOverlay'
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
        canAccept,
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

    const style = styles(theme)

    return (
        <SafeAreaContainer edges="bottom">
            <GroupVoters roomId={roomId} />
            {canAccept && (
                <View style={style.buttonContainer}>
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
                </View>
            )}
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        buttonContainer: {
            gap: theme.spacing.md,
            paddingHorizontal: theme.spacing.md,
        },
    })

export default MultispendActiveInvitation
