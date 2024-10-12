import Clipboard from '@react-native-clipboard/clipboard'
import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { encodeFediMatrixRoomUri } from '@fedi/common/utils/matrix'

import { NavigationHook } from '../../../types/navigation'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

type Props = {
    groupId: string
}

const EmbeddedJoinGroupButton: React.FC<Props> = ({ groupId }: Props) => {
    const navigation = useNavigation<NavigationHook>()
    const toast = useToast()
    const { t } = useTranslation()
    const { theme } = useTheme()

    const copyToClipboard = () => {
        const invitationLink = encodeFediMatrixRoomUri(groupId)
        Clipboard.setString(invitationLink as string)
        toast.show({
            content: t('feature.chat.copied-group-invite-code'),
            status: 'success',
        })
    }

    return (
        <Button
            size="sm"
            color={theme.colors.secondary}
            containerStyle={styles(theme).container}
            onPress={() =>
                navigation.navigate('ConfirmJoinPublicGroup', {
                    groupId,
                })
            }
            onLongPress={copyToClipboard}
            title={
                <View style={styles(theme).contents}>
                    <SvgImage
                        containerStyle={styles(theme).icon}
                        size={SvgImageSize.xs}
                        name={'SocialPeople'}
                        // TODO: Implement room preview to show group type
                        // name={
                        //     groupConfig.broadcastOnly
                        //         ? 'SpeakerPhone'
                        //         : 'SocialPeople'
                        // }
                    />
                    <Text medium caption>
                        {`${t('feature.chat.join-group')} `}
                    </Text>
                    {/* TODO: Implement room preview to show group name */}
                    {/* <Text
                        bold
                        caption
                        numberOfLines={1}
                        style={styles(theme).groupNameText}>
                        {`${groupConfig.name}`}
                    </Text> */}
                </View>
            }
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {},
        contents: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '100%',
        },
        icon: {
            marginRight: theme.spacing.sm,
        },
        groupNameText: {
            maxWidth: '70%',
        },
    })

export default EmbeddedJoinGroupButton
