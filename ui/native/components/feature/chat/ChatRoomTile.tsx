import { Theme, useTheme } from '@rneui/themed'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { selectChatDrafts } from '@fedi/common/redux'
import dateUtils from '@fedi/common/utils/DateUtils'
import {
    getRoomPreviewText,
    shouldShowUnreadIndicator,
} from '@fedi/common/utils/matrix'

import { DEFAULT_GROUP_NAME } from '../../../constants'
import { useAppSelector } from '../../../state/hooks'
import { MatrixRoom } from '../../../types'
import { AvatarSize } from '../../ui/Avatar'
import ChatAvatar from './ChatAvatar'
import ChatTile from './ChatTile'

type ChatRoomTileProps = {
    room: MatrixRoom
    onSelect: (chat: MatrixRoom) => void
    onLongPress?: (chat: MatrixRoom) => void
}

const ChatRoomTile = ({ room, onSelect, onLongPress }: ChatRoomTileProps) => {
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

    const previewMessage = useMemo(() => {
        if (draftMessage)
            return t('feature.chat.draft-text', { text: draftMessage })
        // TODO: Fix previews on chat payments
        return getRoomPreviewText(room, t)
    }, [room, draftMessage, t])

    const style = styles(theme)

    const subtitle = previewMessage
        ? previewMessage
        : // HACK: public rooms don't show a preview message so you have to click into it to paginate backwards
          // TODO: Replace with proper room previews
          room.isPublic && room.broadcastOnly
          ? t('feature.chat.click-here-for-announcements')
          : t('feature.chat.no-messages')

    const subtitleProps = {
        medium: showUnreadIndicator,
        style: previewMessage
            ? showUnreadIndicator
                ? style.messagePreviewUnread
                : style.messagePreview
            : style.emptyMessagePreview,
    }

    return (
        <ChatTile
            onPress={() => onSelect(room)}
            onLongPress={onLongPress ? () => onLongPress(room) : undefined}
            avatar={
                <ChatAvatar
                    room={room}
                    size={AvatarSize.md}
                    maxFontSizeMultiplier={1.2}
                />
            }
            title={room.name || DEFAULT_GROUP_NAME}
            subtitle={subtitle}
            subtitleProps={subtitleProps}
            timestamp={
                room.preview?.timestamp &&
                dateUtils.formatChatTileTimestamp(room.preview.timestamp / 1000)
            }
            showUnreadIndicator={showUnreadIndicator}
            disabled={!room}
            delayLongPress={300}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
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
        namePreview: {
            width: '80%',
        },
        timestamp: {
            color: theme.colors.grey,
            paddingRight: theme.spacing.md,
        },
    })

export default ChatRoomTile
