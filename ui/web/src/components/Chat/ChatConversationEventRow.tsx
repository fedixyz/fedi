import React from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { selectMatrixAuth, selectMatrixRoomMembers } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import dateUtils from '@fedi/common/utils/DateUtils'

import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { ChatAvatar } from './ChatAvatar'
import { ChatEvent } from './ChatEvent'
import { ChatEventError } from './ChatEventError'

interface Props {
    roomId: string
    event: MatrixEvent
    showTimestamp: boolean
    showUsername: boolean
    showAvatar: boolean
    showUsernames: boolean
    highlightedMessageId?: string | null
    onReplyTap?: (eventId: string) => void
}

const ChatConversationEventRowComponent: React.FC<Props> = ({
    roomId,
    event,
    showTimestamp,
    showUsername,
    showAvatar,
    showUsernames,
    highlightedMessageId,
    onReplyTap,
}) => {
    const { t } = useTranslation()
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const roomMembers = useAppSelector(s => selectMatrixRoomMembers(s, roomId))

    const sentBy = event.sender || ''
    const roomMember = roomMembers.find(m => m.id === sentBy)
    const isMe = sentBy === matrixAuth?.userId
    const hasLeft = roomMember?.membership === 'leave'
    const isBanned = roomMember?.membership === 'ban'
    const displayName = isBanned
        ? t('feature.chat.removed-member')
        : hasLeft
          ? t('feature.chat.former-member')
          : roomMember?.displayName || '...'

    const shouldShowUsername = showUsernames && showUsername && !isMe
    const reserveAvatarSlot = showUsernames && !isMe
    const shouldShowAvatar = reserveAvatarSlot && showAvatar
    const isHighlighted = highlightedMessageId === event.id

    return (
        <Container
            data-event-id={event.id}
            senderBreak={shouldShowUsername && !showTimestamp}
            highlighted={isHighlighted}>
            {showTimestamp && event.timestamp && (
                <MessageTimestamp>
                    {dateUtils.formatMessageItemTimestamp(
                        event.timestamp / 1000,
                    )}
                </MessageTimestamp>
            )}
            {shouldShowUsername && <Username>{displayName}</Username>}
            <MessageRow>
                {reserveAvatarSlot && (
                    <AvatarSlot visible={shouldShowAvatar}>
                        <ChatAvatar
                            user={roomMember || { id: sentBy }}
                            size="sm"
                        />
                    </AvatarSlot>
                )}
                <MessageContent isMe={isMe}>
                    <ErrorBoundary fallback={() => <ChatEventError />}>
                        <ChatEvent event={event} onReplyTap={onReplyTap} />
                    </ErrorBoundary>
                </MessageContent>
            </MessageRow>
        </Container>
    )
}

export const ChatConversationEventRow = React.memo(
    ChatConversationEventRowComponent,
)

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',

    variants: {
        senderBreak: {
            true: {
                marginTop: 6,
            },
        },
        highlighted: {
            true: {
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                borderRadius: 18,
                margin: '-2px -4px',
                padding: '2px 4px',
                boxShadow: '0 0 8px rgba(0, 122, 255, 0.3)',
            },
        },
    },
})

const MessageRow = styled('div', {
    display: 'flex',
    gap: 8,
})

const AvatarSlot = styled('div', {
    flexShrink: 0,
    marginTop: 2,

    variants: {
        visible: {
            false: {
                visibility: 'hidden',
            },
        },
    },
})

const MessageContent = styled('div', {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',

    variants: {
        isMe: {
            true: {
                alignItems: 'flex-end',
            },
        },
    },
})

const MessageTimestamp = styled('div', {
    textAlign: 'center',
    fontSize: theme.fontSizes.tiny,
    color: theme.colors.darkGrey,
    padding: 16,
})

const Username = styled('div', {
    paddingLeft: 48,
    fontSize: theme.fontSizes.tiny,
    lineHeight: '20px',
    color: theme.colors.darkGrey,
})
