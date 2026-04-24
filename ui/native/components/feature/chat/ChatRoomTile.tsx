import { Theme, useTheme } from '@rneui/themed'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useMatrixRoomPreview } from '@fedi/common/hooks/matrix'
import dateUtils from '@fedi/common/utils/DateUtils'
import { areChatListRoomRenderFieldsEqual } from '@fedi/common/utils/matrix'

import { DEFAULT_GROUP_NAME } from '../../../constants'
import { MatrixRoom } from '../../../types'
import { getMatrixPreviewIcon } from '../../../utils/matrix'
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

    const { text, isUnread, isNotice } = useMatrixRoomPreview({
        roomId: room.id,
        t,
    })

    const style = styles(theme)

    let subtitleStyle = style.messagePreview

    if (isUnread) subtitleStyle = style.messagePreviewUnread
    if (isNotice) subtitleStyle = style.emptyMessagePreview

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
            icon={getMatrixPreviewIcon(room.preview)}
            title={room.name || DEFAULT_GROUP_NAME}
            subtitle={text}
            subtitleProps={{
                medium: isUnread,
                style: subtitleStyle,
            }}
            timestamp={
                room.preview?.timestamp &&
                dateUtils.formatChatTileTimestamp(room.preview.timestamp / 1000)
            }
            showUnreadIndicator={isUnread}
            disabled={!room}
            delayLongPress={300}
        />
    )
}

const areChatRoomTilePropsEqual = (
    prev: ChatRoomTileProps,
    next: ChatRoomTileProps,
) => {
    if (prev.onSelect !== next.onSelect) return false
    if (prev.onLongPress !== next.onLongPress) return false
    return areChatListRoomRenderFieldsEqual(prev.room, next.room)
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

export default memo(ChatRoomTile, areChatRoomTilePropsEqual)
