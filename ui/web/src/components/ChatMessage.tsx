import React from 'react'

import { selectAuthenticatedMember } from '@fedi/common/redux'
import {
    ChatMessageStatus,
    ChatMessage as ChatMessageType,
} from '@fedi/common/types'

import { useAppSelector } from '../hooks'
import { styled, theme } from '../styles'
import { ChatMessagePayment } from './ChatMessagePayment'

interface Props {
    message: ChatMessageType
}

export const ChatMessage: React.FC<Props> = ({ message }) => {
    const authenticatedMember = useAppSelector(selectAuthenticatedMember)

    const { payment, status } = message
    const isMe = message.sentBy === authenticatedMember?.id
    const isQueued = status === ChatMessageStatus.queued

    let content: React.ReactNode =
        typeof message.content === 'string'
            ? message.content.split(/\r?\n/).map((part, index, array) => (
                  <React.Fragment key={index}>
                      {part}
                      {index !== array.length - 1 && <br />}
                  </React.Fragment>
              ))
            : message.content
    let isPayment = false
    if (payment?.status !== undefined) {
        isPayment = true
        content = <ChatMessagePayment message={message} payment={payment} />
    }

    return (
        <MessageContent isMe={isMe} isPayment={isPayment} isQueued={isQueued}>
            {content}
        </MessageContent>
    )
}

const MessageContent = styled('div', {
    width: 'fit-content',
    maxWidth: '90%',
    padding: 8,
    fontSize: theme.fontSizes.caption,
    fontWeight: theme.fontWeights.medium,
    lineHeight: '20px',
    wordWrap: 'break-word',
    borderRadius: 12,
    transition: 'opacity 100ms ease',

    variants: {
        isMe: {
            true: {
                background: theme.colors.blue,
                color: theme.colors.white,
            },
            false: {
                background: theme.colors.extraLightGrey,
                color: theme.colors.primary,
            },
        },
        isPayment: {
            true: {},
        },
        isQueued: {
            true: {
                opacity: 0.5,
            },
        },
    },
    compoundVariants: [
        // Fix a bug where isPayment sometimes doesn't override
        {
            isMe: true,
            isPayment: true,
            css: {
                background: theme.colors.orange,
                color: theme.colors.white,
            },
        },
        {
            isMe: false,
            isPayment: true,
            css: {
                background: theme.colors.orange,
                color: theme.colors.white,
            },
        },
    ],
})
