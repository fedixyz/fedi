import { useRouter } from 'next/router'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useMatrixRoomPreview } from '@fedi/common/hooks/matrix'
import { MatrixRoom } from '@fedi/common/types'
import dateUtils from '@fedi/common/utils/DateUtils'
import { shouldShowUnreadIndicator } from '@fedi/common/utils/matrix'

import { theme } from '../../styles'
import { getMatrixPreviewIcon } from '../../utils/matrix'
import { ChatAvatar } from './ChatAvatar'
import { ChatTile } from './ChatTile'

interface Props {
    room: MatrixRoom
}

export const ChatListItem: React.FC<Props> = ({ room }) => {
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

    const timestamp = useMemo(() => {
        if (!room.preview?.timestamp) return undefined
        return dateUtils.formatChatTileTimestamp(room.preview.timestamp / 1000)
    }, [room.preview?.timestamp])

    return (
        <ChatTile
            href={`/chat/room/${room.id}`}
            active={isActive}
            avatar={<ChatAvatar room={room} css={{ flexShrink: 0 }} />}
            title={room.name}
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
}
