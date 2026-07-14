import { useRouter } from 'next/router'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useMatrixRoomPreview } from '@fedi/common/hooks/matrix'
import {
    selectChatTileName,
    selectIsUnpreviewablePrivateGroup,
} from '@fedi/common/redux'
import { MatrixRoom } from '@fedi/common/types'
import dateUtils from '@fedi/common/utils/DateUtils'
import {
    areChatListRoomRenderFieldsEqual,
    shouldShowUnreadIndicator,
} from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../hooks'
import { theme } from '../../styles'
import { getMatrixPreviewIcon } from '../../utils/matrix'
import { ChatAvatar } from './ChatAvatar'
import { ChatTile } from './ChatTile'

interface Props {
    room: MatrixRoom
}

export const ChatListItem = React.memo(function ChatListItem({ room }: Props) {
    const { query } = useRouter()

    const isActive = room.id === query?.path?.[1]

    const showUnreadIndicator = useMemo(
        () =>
            !isActive &&
            shouldShowUnreadIndicator(
                room.notificationCount,
                room.isMarkedUnread,
            ),
        [isActive, room.notificationCount, room.isMarkedUnread],
    )

    const { t } = useTranslation()
    const { text, isUnread, isNotice } = useMatrixRoomPreview({
        roomId: room.id,
        t,
    })
    const name = useAppSelector(s => selectChatTileName(s, room.id))
    const isUnpreviewablePrivateGroup = useAppSelector(s =>
        selectIsUnpreviewablePrivateGroup(s, room.id),
    )

    const timestamp = useMemo(() => {
        if (!room.preview?.timestamp) return undefined
        return dateUtils.formatChatTileTimestamp(room.preview.timestamp / 1000)
    }, [room.preview?.timestamp])

    return (
        <ChatTile
            href={`/chat/room/${room.id}`}
            active={isActive}
            avatar={<ChatAvatar room={room} css={{ flexShrink: 0 }} />}
            title={
                name ||
                (isUnpreviewablePrivateGroup
                    ? t('feature.chat.private-group')
                    : t('feature.chat.new-group'))
            }
            icon={getMatrixPreviewIcon(room.preview)}
            subtitle={text}
            subtitleProps={{
                weight: showUnreadIndicator ? 'bold' : 'normal',
                css: {
                    color: isUnread
                        ? theme.colors.primary
                        : isNotice
                          ? theme.colors.grey
                          : theme.colors.darkGrey,
                    fontStyle: isNotice ? 'italic' : undefined,
                },
            }}
            timestamp={timestamp}
            showUnreadIndicator={showUnreadIndicator}
        />
    )
}, areChatListItemPropsEqual)

function areChatListItemPropsEqual(prev: Props, next: Props) {
    return areChatListRoomRenderFieldsEqual(prev.room, next.room)
}
