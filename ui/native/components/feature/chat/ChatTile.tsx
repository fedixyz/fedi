import { Text, Theme, useTheme } from '@rneui/themed'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import dateUtils from '@fedi/common/utils/DateUtils'
import { shouldShowUnreadIndicator } from '@fedi/common/utils/matrix'

import { DEFAULT_GROUP_NAME } from '../../../constants'
import { MatrixRoom } from '../../../types'
import { AvatarSize } from '../../ui/Avatar'
import ChatAvatar from './ChatAvatar'

type ChatTileProps = {
    room: MatrixRoom
    onSelect: (chat: MatrixRoom) => void
    onLongPress: (chat: MatrixRoom) => void
}

const ChatTile = ({ room, onSelect, onLongPress }: ChatTileProps) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

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
    const previewMessage = useMemo(
        () =>
            room.isBlocked
                ? t('feature.chat.user-is-blocked')
                : room?.preview?.body,
        [room?.preview, room.isBlocked, t],
    )
    const previewMessageIsDeleted = useMemo(
        () => room?.preview?.isDeleted,
        [room?.preview],
    )

    return (
        <Pressable
            style={({ pressed }) => [
                styles(theme).container,
                pressed && room
                    ? { backgroundColor: theme.colors.primary05 }
                    : {},
            ]}
            disabled={!room}
            onLongPress={() => onLongPress(room)}
            delayLongPress={300}
            onPress={() => onSelect(room)}>
            <View style={styles(theme).iconContainer}>
                <View
                    style={[
                        styles(theme).unreadIndicator,
                        showUnreadIndicator ? { opacity: 1 } : { opacity: 0 },
                    ]}
                />
                <View style={styles(theme).chatTypeIconContainer}>
                    <ChatAvatar
                        room={room}
                        size={AvatarSize.md}
                        maxFontSizeMultiplier={1.2}
                    />
                </View>
            </View>
            <View style={styles(theme).content}>
                <View style={styles(theme).preview}>
                    <Text
                        style={styles(theme).namePreview}
                        numberOfLines={1}
                        bold>
                        {room.name || DEFAULT_GROUP_NAME}
                    </Text>
                    {previewMessage ? (
                        <Text
                            caption
                            style={[
                                styles(theme).messagePreview,
                                showUnreadIndicator
                                    ? styles(theme).messagePreviewUnread
                                    : undefined,
                            ]}
                            numberOfLines={2}
                            {...previewTextWeight}>
                            {previewMessage}
                        </Text>
                    ) : (
                        <Text
                            caption
                            style={styles(theme).emptyMessagePreview}
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
                </View>
                <View style={styles(theme).metadata}>
                    {room.preview?.timestamp && (
                        <Text
                            small
                            style={styles(theme).timestamp}
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
                            containerStyle={styles(theme).pinIcon}
                            color={theme.colors.grey}
                        />
                    )} */}
                </View>
            </View>
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
            flex: 1,
            flexDirection: 'row',
            height: theme.sizes.mediumAvatar,
        },
        preview: {
            flex: 1,
            flexDirection: 'column',
            alignSelf: 'center',
        },
        metadata: {
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'flex-start',
            gap: theme.spacing.xs,
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
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-start',
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
