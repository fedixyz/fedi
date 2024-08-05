import React from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { selectMatrixAuth, selectMatrixRoomMembers } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import dateUtils from '@fedi/common/utils/DateUtils'

import { useAppSelector } from '../hooks'
import { styled, theme } from '../styles'
import { ChatAvatar } from './ChatAvatar'
import { ChatEvent } from './ChatEvent'
import { ChatEventError } from './ChatEventError'

interface Props {
    roomId: string
    collection: MatrixEvent[][]
    showUsernames?: boolean
}

export const ChatEventCollection: React.FC<Props> = ({
    roomId,
    collection,
    showUsernames,
}) => {
    const { t } = useTranslation()
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const roomMembers = useAppSelector(s => selectMatrixRoomMembers(s, roomId))

    const earliestEvent = collection.slice(-1)[0].slice(-1)[0]

    return (
        <Container>
            <MessageTimestamp>
                {dateUtils.formatMessageItemTimestamp(
                    earliestEvent.timestamp / 1000,
                )}
            </MessageTimestamp>
            <MessageCollection>
                {collection.map(events => {
                    const sentBy = events[0].senderId || ''
                    const roomMember = roomMembers.find(m => m.id === sentBy)
                    const isMe = sentBy === matrixAuth?.userId
                    const hasLeft = roomMember?.membership === 'leave'
                    const isBanned = roomMember?.membership === 'ban'
                    const displayName = isBanned
                        ? t('feature.chat.removed-member')
                        : hasLeft
                        ? t('feature.chat.former-member')
                        : roomMember?.displayName || '...'
                    return (
                        <div key={events[0].id}>
                            {showUsernames && !isMe && (
                                <Username>{displayName}</Username>
                            )}
                            <MessageAvatarWrap isMe={isMe}>
                                <ChatAvatar
                                    user={roomMember || { id: sentBy }}
                                    size="sm"
                                />
                                <Messages isMe={isMe}>
                                    {events.map(event => (
                                        <ErrorBoundary
                                            key={event.id}
                                            fallback={() => <ChatEventError />}>
                                            <ChatEvent event={event} />
                                        </ErrorBoundary>
                                    ))}
                                </Messages>
                            </MessageAvatarWrap>
                        </div>
                    )
                })}
            </MessageCollection>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
})

const MessageAvatarWrap = styled('div', {
    display: 'flex',
    gap: 8,

    '> *:first-child': {
        flexShrink: 0,
    },

    variants: {
        isMe: {
            true: {
                flexDirection: 'row-reverse',
                '> *:first-child': {
                    display: 'none',
                },
            },
            false: {
                '> *:first-child': {
                    marginTop: 2,
                },
            },
        },
    },
})

const MessageCollection = styled('div', {
    display: 'flex',
    flexDirection: 'column-reverse',
    gap: 12,
})

const MessageTimestamp = styled('div', {
    textAlign: 'center',
    fontSize: theme.fontSizes.tiny,
    color: theme.colors.darkGrey,
    padding: 16,
})

const Messages = styled('div', {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    display: 'flex',
    flexDirection: 'column-reverse',
    gap: 6,

    variants: {
        isMe: {
            true: {
                alignItems: 'flex-end',
            },
        },
    },
})

const Username = styled('div', {
    paddingLeft: 48,
    fontSize: theme.fontSizes.tiny,
    lineHeight: '20px',
    color: theme.colors.darkGrey,
})
