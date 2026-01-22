import React from 'react'
import { useTranslation } from 'react-i18next'

import { selectMatrixAuth, selectMatrixRoomMembers } from '@fedi/common/redux'
import { MatrixEvent, ReplyMessageData } from '@fedi/common/types'
import {
    isFileEvent,
    isFederationInviteEvent,
    isFormEvent,
    isImageEvent,
    isPaymentEvent,
    isTextEvent,
    isVideoEvent,
    matrixIdToUsername,
} from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { ChatFederationInviteEvent } from './ChatFederationInviteEvent'
import { ChatFileEvent } from './ChatFileEvent'
import { ChatFormEvent } from './ChatFormEvent'
import { ChatImageEvent } from './ChatImageEvent'
import { ChatPaymentEvent } from './ChatPaymentEvent'
import { ChatRepliedMessage } from './ChatRepliedMessage'
import { ChatSwipeableEventContainer } from './ChatSwipeableEventContainer'
import { ChatTextEvent } from './ChatTextEvent'
import { ChatVideoEvent } from './ChatVideoEvent'

interface Props {
    event: MatrixEvent
    onReplyTap?: (eventId: string) => void
}

export const ChatEvent: React.FC<Props> = ({ event, onReplyTap }) => {
    const { t } = useTranslation()
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const roomMembers = useAppSelector(s => {
        if (!event.roomId) return []
        const members = selectMatrixRoomMembers(s, event.roomId)
        return members || []
    })
    const isMe = event.sender === matrixAuth?.userId

    // Images and videos require a different wrapper that has a percentage width
    // rather than a "fit-content" width. This allows the image to be scaled
    // properly futher down.
    if (isImageEvent(event)) {
        return (
            <ChatSwipeableEventContainer event={event} isMe={isMe}>
                <AttachmentContent isMe={isMe}>
                    <ChatImageEvent event={event} />
                </AttachmentContent>
            </ChatSwipeableEventContainer>
        )
    }

    if (isVideoEvent(event)) {
        return (
            <ChatSwipeableEventContainer event={event} isMe={isMe}>
                <AttachmentContent isMe={isMe}>
                    <ChatVideoEvent event={event} />
                </AttachmentContent>
            </ChatSwipeableEventContainer>
        )
    }

    if (isFileEvent(event)) {
        return (
            <ChatSwipeableEventContainer event={event} isMe={isMe}>
                <AttachmentContent isMe={isMe}>
                    <ChatFileEvent event={event} />
                </AttachmentContent>
            </ChatSwipeableEventContainer>
        )
    }

    // Text events are used to render replies
    if (isTextEvent(event)) {
        // Used for replies
        const replyData: ReplyMessageData = event.inReply as ReplyMessageData
        const senderName =
            roomMembers?.find(member => member.id === replyData?.sender)
                ?.displayName || matrixIdToUsername(replyData?.sender)

        return (
            <ChatSwipeableEventContainer event={event} isMe={isMe}>
                <TextContent isMe={isMe} showSpeechBubble>
                    {!!replyData && (
                        <ChatRepliedMessage
                            data={replyData}
                            isMe={isMe}
                            senderName={senderName}
                            onReplyTap={onReplyTap}
                        />
                    )}
                    <ChatTextEvent event={event} />
                </TextContent>
            </ChatSwipeableEventContainer>
        )
    }

    if (isFederationInviteEvent(event)) {
        return (
            <TextContent isMe={isMe}>
                <ChatFederationInviteEvent event={event} isMe={isMe} />
            </TextContent>
        )
    }

    const content = isPaymentEvent(event) ? (
        <ChatPaymentEvent event={event} />
    ) : isFormEvent(event) ? (
        <ChatFormEvent event={event} />
    ) : (
        <>{t('feature.chat.message-could-not-be-displayed')}</>
    )

    return (
        <TextContent
            isMe={isMe}
            isPayment={isPaymentEvent(event)}
            isForm={isFormEvent(event)}>
            {content}
        </TextContent>
    )
}

const AttachmentContent = styled('div', {
    display: 'flex',
    flexDirection: 'row-reverse',
    width: '90%',

    variants: {
        isMe: {
            true: {
                flexDirection: 'row',
            },
        },
    },
})

const TextContent = styled('div', {
    background: theme.colors.blue,
    borderRadius: theme.spacing.md,
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
        showSpeechBubble: {
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
        // Apply speech bubble style to text messages only
        {
            isMe: true,
            showSpeechBubble: true,
            css: {
                borderBottomRightRadius: theme.spacing.xs,
            },
        },
        {
            isMe: false,
            showSpeechBubble: true,
            css: {
                borderBottomLeftRadius: theme.spacing.xs,
            },
        },
    ],
})
