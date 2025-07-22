import React from 'react'

import { selectMatrixAuth } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import {
    isFormEvent,
    isImageEvent,
    isPaymentEvent,
    isTextEvent,
    isVideoEvent,
} from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { ChatFormEvent } from './ChatFormEvent'
import { ChatImageEvent } from './ChatImageEvent'
import { ChatPaymentEvent } from './ChatPaymentEvent'
import { ChatTextEvent } from './ChatTextEvent'
import { ChatVideoEvent } from './ChatVideoEvent'

interface Props {
    event: MatrixEvent
}

export const ChatEvent: React.FC<Props> = ({ event }) => {
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const isMe = event.senderId === matrixAuth?.userId

    const content = isImageEvent(event) ? (
        <ChatImageEvent event={event} />
    ) : isVideoEvent(event) ? (
        <ChatVideoEvent event={event} />
    ) : isPaymentEvent(event) ? (
        <ChatPaymentEvent event={event} />
    ) : isFormEvent(event) ? (
        <ChatFormEvent event={event} />
    ) : isTextEvent(event) ? (
        <ChatTextEvent event={event} />
    ) : (
        event.content.body
    )

    return (
        <MessageContent
            isMe={isMe}
            isMedia={isImageEvent(event) || isVideoEvent(event)}
            isPayment={isPaymentEvent(event)}
            isForm={isFormEvent(event)}>
            {content}
        </MessageContent>
    )
}

const MessageContent = styled('div', {
    background: theme.colors.blue,
    borderRadius: theme.sizes.xxs,
    color: theme.colors.white,
    fontSize: theme.fontSizes.caption,
    fontWeight: theme.fontWeights.medium,
    lineHeight: '20px',
    maxWidth: '90%',
    padding: 8,
    overflow: 'hidden',
    transition: 'opacity 100ms ease',
    width: 'fit-content',
    wordWrap: 'break-word',

    variants: {
        isForm: {
            true: {},
        },
        isPayment: {
            true: {},
        },
        isMe: {
            false: {
                background: theme.colors.extraLightGrey,
                color: theme.colors.primary,

                // Style links for messages from others
                '& a': {
                    color: theme.colors.blue,
                },
            },
            true: {
                // Style links for messages from me
                '& a': {
                    color: theme.colors.secondary,
                },
            },
        },
        isMedia: {
            true: {
                padding: 0,
                width: '90%',
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
        {
            isMe: true,
            isForm: true,
            css: {
                background: theme.colors.extraLightGrey,
                color: theme.colors.darkGrey,
            },
        },
    ],
})
