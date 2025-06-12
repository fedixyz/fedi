import { Text, Theme, useTheme } from '@rneui/themed'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { selectChatDrafts } from '@fedi/common/redux'
import dateUtils from '@fedi/common/utils/DateUtils'
import { shouldShowUnreadIndicator } from '@fedi/common/utils/matrix'

import { DEFAULT_GROUP_NAME } from '../../../constants'
import { useAppSelector } from '../../../state/hooks'
import { MatrixRoom } from '../../../types'
import { AvatarSize } from '../../ui/Avatar'
import Flex from '../../ui/Flex'
import ChatAvatar from './ChatAvatar'

type ChatTileProps = {
    room: MatrixRoom
    onSelect: (chat: MatrixRoom) => void
    onLongPress: (chat: MatrixRoom) => void
}

const ChatTile = ({ room, onSelect, onLongPress }: ChatTileProps) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    const chatDrafts = useAppSelector(selectChatDrafts)
    const draftMessage = chatDrafts[room.id] ?? null
    const showUnreadIndicator = useMemo(
        () =>
            shouldShowUnreadIndicator(
                room.notificationCount,
                room.isMarkedUnread,
            ),
        [room.notificationCount, room.isMarkedUnread],
    )
    const previewTextWeight = useMemo(
        () => (showUnreadIndicator ? { medium: true } : {}),
        [showUnreadIndicator],
    )
    const previewMessage = useMemo(() => {
        if (room.isBlocked) return t('feature.chat.user-is-blocked')
        if (draftMessage)
            return t('feature.chat.draft-text', { text: draftMessage })

        return room?.preview?.body
    }, [room, draftMessage, t])

    const previewMessageIsDeleted = useMemo(
        () => room?.preview?.isDeleted,
        [room?.preview],
    )

    const style = styles(theme)

    return (
        <Pressable
            style={({ pressed }) => [
                style.container,
                pressed && room
                    ? { backgroundColor: theme.colors.primary05 }
                    : {},
            ]}
            disabled={!room}
            onLongPress={() => onLongPress(room)}
            delayLongPress={300}
            onPress={() => onSelect(room)}>
            <View style={style.iconContainer}>
                <View
                    style={[
                        style.unreadIndicator,
                        showUnreadIndicator ? { opacity: 1 } : { opacity: 0 },
                    ]}
                />
                <Flex
                    row
                    align="center"
                    justify="start"
                    style={style.chatTypeIconContainer}>
                    <ChatAvatar
                        room={room}
                        size={AvatarSize.md}
                        maxFontSizeMultiplier={1.2}
                    />
                </Flex>
            </View>
            <Flex grow row style={style.content}>
                <Flex grow basis={false} style={style.preview}>
                    <Text style={style.namePreview} numberOfLines={1} bold>
                        {room.name || DEFAULT_GROUP_NAME}
                    </Text>
                    {previewMessage ? (
                        <Text
                            caption
                            style={[
                                style.messagePreview,
                                showUnreadIndicator
                                    ? style.messagePreviewUnread
                                    : undefined,
                            ]}
                            numberOfLines={2}
                            {...previewTextWeight}>
                            {previewMessage}
                        </Text>
                    ) : (
                        <Text
                            caption
                            style={style.emptyMessagePreview}
                            numberOfLines={2}
                            {...previewTextWeight}>
                            {/* 
                                HACK: public rooms don't show a preview message so you have to click into it to paginate backwards
                                TODO: Replace with proper room previews
                            */}
                            {previewMessageIsDeleted
                                ? t('feature.chat.message-deleted')
                                : room.isPublic && room.broadcastOnly
                                  ? t(
                                        'feature.chat.click-here-for-announcements',
                                    )
                                  : t('feature.chat.no-messages')}
                        </Text>
                    )}
                </Flex>
                <Flex align="end" justify="start" gap="xs">
                    {room.preview?.timestamp && (
                        <Text
                            small
                            style={style.timestamp}
                            adjustsFontSizeToFit
                            maxFontSizeMultiplier={1.4}>
                            {dateUtils.formatChatTileTimestamp(
                                room.preview.timestamp / 1000,
                            )}
                        </Text>
                    )}
                    {/* TODO: Implement pinned chat groups */}
                    {/* {chat.pinned && (
                        <SvgImage
                            name="Pin"
                            size={SvgImageSize.xs}
                            containerStyle={style.pinIcon}
                            color={theme.colors.grey}
                        />
                    )} */}
                </Flex>
            </Flex>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: theme.spacing.md,
            width: '100%',
            borderRadius: theme.borders.defaultRadius,
        },
        iconContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            flexShrink: 0,
        },
        content: {
            height: theme.sizes.mediumAvatar,
        },
        preview: {
            alignSelf: 'center',
        },
        messagePreview: {
            color: theme.colors.darkGrey,
        },
        messagePreviewUnread: {
            color: theme.colors.primary,
        },
        emptyMessagePreview: {
            color: theme.colors.grey,
            fontStyle: 'italic',
        },
        chatTypeIconContainer: {
            marginRight: theme.spacing.md,
        },
        pinIcon: {
            alignItems: 'flex-end',
            color: theme.colors.grey,
        },
        unreadIndicator: {
            backgroundColor: theme.colors.red,
            height: theme.sizes.unreadIndicatorSize,
            width: theme.sizes.unreadIndicatorSize,
            paddingHorizontal: theme.spacing.xs,
            borderRadius: theme.sizes.unreadIndicatorSize * 0.5,
            transform: [
                {
                    translateX: theme.sizes.unreadIndicatorSize * -0.3,
                },
            ],
        },
        namePreview: {
            width: '80%',
        },
        timestamp: {
            color: theme.colors.grey,
            paddingRight: theme.spacing.md,
        },
    })

export default ChatTile
