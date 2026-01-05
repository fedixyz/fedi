import Clipboard from '@react-native-clipboard/clipboard'
import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { encodeFediMatrixRoomUri } from '@fedi/common/utils/matrix'

import { NavigationHook } from '../../../types/navigation'
import { Row } from '../../ui/Flex'
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

    const style = styles(theme)

    return (
        <Button
            size="sm"
            color={theme.colors.secondary}
            onPress={() =>
                navigation.navigate('ConfirmJoinPublicGroup', {
                    groupId,
                })
            }
            onLongPress={copyToClipboard}
            title={
                <Row center style={style.contents}>
                    <SvgImage
                        containerStyle={style.icon}
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
                        style={style.groupNameText}>
                        {`${groupConfig.name}`}
                    </Text> */}
                </Row>
            }
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        contents: {
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
