import React from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import {
    selectAuthenticatedMember,
    selectChatMemberMap,
} from '@fedi/common/redux'
import { ChatMessage as ChatMessageType } from '@fedi/common/types'
import dateUtils from '@fedi/common/utils/DateUtils'

import { useAppSelector } from '../hooks'
import { styled, theme } from '../styles'
import { Avatar } from './Avatar'
import { ChatMessage } from './ChatMessage'
import { ChatMessageError } from './ChatMessageError'

interface Props {
    collection: ChatMessageType[][]
    showUsernames?: boolean
}

export const ChatMessageCollection: React.FC<Props> = ({
    collection,
    showUsernames,
}) => {
    const { t } = useTranslation()
    const authenticatedMember = useAppSelector(selectAuthenticatedMember)
    const memberMap = useAppSelector(selectChatMemberMap)

    const earliestMessage = collection.slice(-1)[0].slice(-1)[0]

    return (
        <Container>
            <MessageTimestamp>
                {dateUtils.formatMessageItemTimestamp(earliestMessage.sentAt)}
            </MessageTimestamp>
            <MessageCollection>
                {collection.map(messages => {
                    const sentBy = messages[0].sentBy
                    const member = memberMap[sentBy]
                    const isMe = sentBy === authenticatedMember?.id
                    return (
                        <div key={messages[0].id}>
                            {showUsernames && !isMe && (
                                <Username>
                                    {member?.username ||
                                        t('feature.chat.unknown-member')}
                                </Username>
                            )}
                            <MessageAvatarWrap isMe={isMe}>
                                <Avatar id={sentBy} name={sentBy} size="sm" />
                                <Messages isMe={isMe}>
                                    {messages.map(msg => (
                                        <ErrorBoundary
                                            key={msg.id}
                                            fallback={() => (
                                                <ChatMessageError />
                                            )}>
                                            <ChatMessage message={msg} />
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
