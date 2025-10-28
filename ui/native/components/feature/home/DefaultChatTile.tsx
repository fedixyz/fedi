import { Text, Theme, useTheme } from '@rneui/themed'
import { t } from 'i18next'
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native'

import { DEFAULT_GROUP_NAME } from '../../../constants'
import { MatrixRoom } from '../../../types'
import { BubbleView } from '../../ui/BubbleView'
import Flex from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'

type DefaultChatTileProps = {
    room?: MatrixRoom
    imageUrl?: string
    onSelect?: (chat: MatrixRoom) => void
    onLongPress?: (chat: MatrixRoom) => void
}

const DefaultChatTile = ({
    room,
    onSelect = () => null,
    onLongPress = () => null,
}: DefaultChatTileProps) => {
    const { theme } = useTheme()
    const style = styles(theme)

    if (!room)
        return (
            <BubbleView containerStyle={style.card}>
                <ActivityIndicator size={theme.sizes.mediumAvatar} />
            </BubbleView>
        )

    const subtitle = room.broadcastOnly
        ? t('words.announcements')
        : t('feature.chat.group-chat')

    return (
        <BubbleView containerStyle={style.card}>
            <Pressable
                style={style.content}
                onLongPress={() => onLongPress(room)}
                delayLongPress={300}
                onPress={() => onSelect(room)}>
                <Flex center shrink={false} style={style.chatIcon}>
                    <SvgImage name="Chat" />
                </Flex>
                <Flex grow basis={false}>
                    <Text style={style.title} numberOfLines={1} bold>
                        {room.name || DEFAULT_GROUP_NAME}
                    </Text>
                    <Text
                        small
                        style={style.subtitle}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        medium>
                        {subtitle}
                    </Text>
                </Flex>
                <SvgImage name="ChevronRight" color={theme.colors.grey} />
            </Pressable>
        </BubbleView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        chatIcon: {
            width: 40,
            height: 40,
            position: 'relative',
        },
        card: {
            paddingVertical: theme.spacing.lg,
            paddingHorizontal: theme.spacing.lg,
            borderColor: theme.colors.extraLightGrey,
            borderWidth: 1,
            justifyContent: 'center',
            borderRadius: 16,
        },
        content: {
            display: 'flex',
            gap: theme.spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'center',
        },
        title: {
            letterSpacing: -0.16,
            lineHeight: 20,
        },
        subtitle: {
            color: theme.colors.grey,
            lineHeight: 15,
            letterSpacing: -0.12,
        },
    })

export default DefaultChatTile
