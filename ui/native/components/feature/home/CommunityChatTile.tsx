import { Text, Theme, useTheme } from '@rneui/themed'
import { t } from 'i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { selectActiveFederation } from '@fedi/common/redux'

import { DEFAULT_GROUP_NAME } from '../../../constants'
import { useAppSelector } from '../../../state/hooks'
import { MatrixRoom } from '../../../types'
import { AvatarSize } from '../../ui/Avatar'
import { BubbleView } from '../../ui/BubbleView'
import SvgImage from '../../ui/SvgImage'
import ChatAvatar from '../chat/ChatAvatar'
import { FederationLogo } from '../federations/FederationLogo'

type CommunityChatTileProps = {
    room?: MatrixRoom
    imageUrl?: string
    onSelect?: (chat: MatrixRoom) => void
    onLongPress?: (chat: MatrixRoom) => void
}

const CommunityChatTile = ({
    room,
    onSelect = () => null,
    onLongPress = () => null,
}: CommunityChatTileProps) => {
    const { theme } = useTheme()
    const activeFederation = useAppSelector(selectActiveFederation)
    const style = styles(theme)

    if (!room)
        return (
            <BubbleView containerStyle={style.card}>
                <ActivityIndicator size={theme.sizes.mediumAvatar} />
            </BubbleView>
        )

    const hasNewMessages = room?.notificationCount && room.notificationCount > 0

    const subtitle = room.broadcastOnly
        ? t('words.announcements')
        : t('feature.chat.group-chat')

    return (
        <BubbleView containerStyle={style.card}>
            <View
                style={[
                    style.unreadIndicator,
                    hasNewMessages ? { opacity: 1 } : { opacity: 0 },
                ]}
            />
            <Pressable
                style={style.content}
                onLongPress={() => onLongPress(room)}
                delayLongPress={300}
                onPress={() => onSelect(room)}>
                {activeFederation ? (
                    <FederationLogo
                        federation={activeFederation}
                        size={theme.sizes.mediumAvatar}
                        hex
                    />
                ) : (
                    <ChatAvatar
                        room={room}
                        size={AvatarSize.md}
                        maxFontSizeMultiplier={1.2}
                    />
                )}
                <View style={style.textContainer}>
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
                </View>
                <>
                    <SvgImage
                        name="ChevronRightSmall"
                        color={theme.colors.grey}
                        dimensions={{ width: 10, height: 18 }}
                    />
                </>
            </Pressable>
        </BubbleView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        card: {
            paddingVertical: theme.spacing.lg,
            paddingHorizontal: theme.spacing.lg,
            backgroundColor: theme.colors.offWhite100,
            justifyContent: 'center',
            borderRadius: 20,
        },
        content: {
            display: 'flex',
            gap: theme.spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'center',
            justifySelf: 'center',
        },
        textContainer: {
            flex: 1,
            flexDirection: 'column',
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
        unreadIndicator: {
            position: 'absolute',
            zIndex: 1,
            left: 4,
            backgroundColor: theme.colors.red,
            height: theme.sizes.unreadIndicatorSize,
            width: theme.sizes.unreadIndicatorSize,
            borderRadius: theme.sizes.unreadIndicatorSize * 0.5,
        },
    })

export default CommunityChatTile
