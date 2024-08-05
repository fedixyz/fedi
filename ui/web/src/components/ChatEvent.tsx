import React from 'react'

import { selectMatrixAuth } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { isPaymentEvent } from '@fedi/common/utils/matrix'

import { useAppSelector } from '../hooks'
import { styled, theme } from '../styles'
import { ChatPaymentEvent } from './ChatPaymentEvent'

interface Props {
    event: MatrixEvent
}

export const ChatEvent: React.FC<Props> = ({ event }) => {
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const isMe = event.senderId === matrixAuth?.userId
    const isQueued = false
    let isPayment = false

    // Default to using the body as the content
    let content: React.ReactNode =
        typeof event.content.body === 'string'
            ? event.content.body.split(/\r?\n/).map((part, index, array) => (
                  <React.Fragment key={index}>
                      {part}
                      {index !== array.length - 1 && <br />}
                  </React.Fragment>
              ))
            : event.content.body

    // For certain message types, use custom components
    if (isPaymentEvent(event)) {
        isPayment = true
        content = <ChatPaymentEvent event={event} />
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
