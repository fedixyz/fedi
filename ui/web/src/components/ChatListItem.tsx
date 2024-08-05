import Link from 'next/link'
import { useRouter } from 'next/router'
import React, { useMemo } from 'react'

import { MatrixRoom } from '@fedi/common/types'
import dateUtils from '@fedi/common/utils/DateUtils'

import { styled, theme } from '../styles'
import { ChatAvatar } from './ChatAvatar'
import { NotificationDot } from './NotificationDot'
import { Text } from './Text'
import { shouldShowUnreadIndicator } from '@fedi/common/utils/matrix'

interface Props {
    room: MatrixRoom
}

export const ChatListItem: React.FC<Props> = ({ room }) => {
    const { query } = useRouter()

    const isActive = room.id === query?.path?.[1]

    const showUnreadIndicator = useMemo(
        () =>
            !isActive && shouldShowUnreadIndicator(
                room.notificationCount,
                room.isMarkedUnread,
            ),
        [isActive, room.notificationCount, room.isMarkedUnread],
    )

    return (
        <Container
            key={room.id}
            active={isActive}
            href={`/chat/room/${room.id}`}>
            <NotificationDot visible={showUnreadIndicator}>
                <ChatAvatar room={room} css={{ flexShrink: 0 }} />
            </NotificationDot>
            <Content>
                <TopContent>
                    <Text
                        weight="bold"
                        ellipsize
                        css={{ flex: 1, minWidth: 0 }}>
                        {room.name}
                    </Text>
                    {room.preview?.timestamp && (
                        <Text variant="small" css={{ flexShrink: 0 }}>
                            {dateUtils.formatChatTileTimestamp(
                                room.preview.timestamp / 1000,
                            )}
                        </Text>
                    )}
                </TopContent>
                <Text
                    variant="small"
                    ellipsize
                    weight={showUnreadIndicator ? 'bold' : 'normal'}
                    css={{
                        color: showUnreadIndicator
                            ? theme.colors.primary
                            : theme.colors.darkGrey,
                    }}>
                    {room.preview?.body}
                </Text>
            </Content>
        </Container>
    )
}

const Container = styled(Link, {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 12,

    '&:hover, &:focus': {
        background: theme.colors.primary05,
    },

    variants: {
        active: {
            true: {
                background: theme.colors.primary05,
            },
        },
    },
})

const Content = styled('div', {
    flex: 1,
    minWidth: 0,
})

const TopContent = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
})
