import React from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { selectMatrixAuth, selectMatrixRoomMembers } from '@fedi/common/redux'
import dateUtils from '@fedi/common/utils/DateUtils'
import { ChatConversationRow } from '@fedi/common/utils/chatConversationRows'

import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { ChatAvatar } from './ChatAvatar'
import { ChatEvent } from './ChatEvent'
import { ChatEventError } from './ChatEventError'

interface Props {
    roomId: string
    row: ChatConversationRow
    highlightedMessageId?: string | null
    onReplyTap?: (eventId: string) => void
}

export const ChatConversationEventRow: React.FC<Props> = ({
    roomId,
    row,
    highlightedMessageId,
    onReplyTap,
}) => {
    const { t } = useTranslation()
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const roomMembers = useAppSelector(s => selectMatrixRoomMembers(s, roomId))

    const { event } = row
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

    const showUsername = row.showUsernames && row.showUsername && !isMe
    const reserveAvatarSlot = row.showUsernames && !isMe
    const showAvatar = reserveAvatarSlot && row.showAvatar
    const isHighlighted = highlightedMessageId === event.id

    return (
        <Container
            data-event-id={event.id}
            senderBreak={showUsername && !row.showTimestamp}
            highlighted={isHighlighted}>
            {row.showTimestamp && event.timestamp && (
                <MessageTimestamp>
                    {dateUtils.formatMessageItemTimestamp(
                        event.timestamp / 1000,
                    )}
                </MessageTimestamp>
            )}
            {showUsername && <Username>{displayName}</Username>}
            <MessageRow>
                {reserveAvatarSlot && (
                    <AvatarSlot visible={showAvatar}>
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
