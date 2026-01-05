import { Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { selectMatrixAuth } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { deriveUrlsFromText } from '@fedi/common/utils/chat'
import {
    arePollEventsEqual,
    isBolt11PaymentEvent,
    isDeletedEvent,
    isEncryptedEvent,
    isFileEvent,
    isFederationInviteEvent,
    isCommunityInviteEvent,
    isFormEvent,
    isImageEvent,
    isMultispendEvent,
    isPaymentEvent,
    isPollEvent,
    isPreviewMediaEvent,
    isTextEvent,
    isVideoEvent,
} from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../../state/hooks'
import { Row, Column } from '../../ui/Flex'
import ChatMultispendEvent from '../multispend/chat-events/ChatMultispendEvent'
import ChatBolt11PaymentEvent from './ChatBolt11PaymentEvent'
import ChatCommunityInviteEvent from './ChatCommunityInviteEvent'
import ChatDeletedEvent from './ChatDeletedEvent'
import ChatEmbeddedLinkPreview from './ChatEmbeddedLinkPreview'
import ChatEncryptedEvent from './ChatEncryptedEvent'
import ChatFederationInviteEvent from './ChatFederationInviteEvent'
import ChatFileEvent from './ChatFileEvent'
import ChatFormEvent from './ChatFormEvent'
import ChatImageEvent from './ChatImageEvent'
import ChatPaymentEvent from './ChatPaymentEvent'
import ChatPollEvent from './ChatPollEvent'
import ChatPreviewMediaEvent from './ChatPreviewMediaEvent'
import ChatTextEvent from './ChatTextEvent'
import { ChatUserActionsOverlay } from './ChatUserActionsOverlay'
import ChatVideoEvent from './ChatVideoEvent'
import { MessageItemError } from './MessageItemError'

type Props = {
    event: MatrixEvent
    last?: boolean
    fullWidth?: boolean
    isPublic?: boolean
    onReplyTap?: (eventId: string) => void
    highlightedMessageId?: string | null
    isInViewport?: boolean
}

const ChatEvent: React.FC<Props> = ({
    event,
    last = false,
    fullWidth = true,
    // Defaults to true so we don't default to loading chat events with media
    isPublic = true,
    onReplyTap,
    isInViewport,
}: Props) => {
    const { theme } = useTheme()
    const [hasWidePreview, setHasWidePreview] = useState(false)
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

    const isMe =
        event.sender === matrixAuth?.userId && !isMultispendEvent(event)
    const isQueued = false
    const isText = isTextEvent(event)

    const bubbleContainerStyles: StyleProp<ViewStyle | TextStyle>[] = [
        styles(theme).bubbleContainer,
    ]
    // Set alignment (left/right) based on sender

    if (isMe) {
        bubbleContainerStyles.push(styles(theme).rightAlignedMessage)
    } else {
        bubbleContainerStyles.push(styles(theme).leftAlignedMessage)
    }

    if (last && isText && !hasWidePreview) {
        bubbleContainerStyles.push(
            isMe
                ? styles(theme).lastSentMessage
                : styles(theme).lastReceivedMessage,
        )
    } else if (isText && hasWidePreview) {
        bubbleContainerStyles.push({
            borderBottomRightRadius: 0,
            width: theme.sizes.maxMessageWidth,
            borderBottomLeftRadius: 0,
            justifyContent: 'flex-start',
        })
    }

    if (
        isPublic &&
        (isImageEvent(event) || isFileEvent(event) || isVideoEvent(event))
    ) {
        return null
    }

    const derivedLinks = isText ? deriveUrlsFromText(event.content.body) : null

    const style = styles(theme)

    return (
        <ErrorBoundary fallback={() => <MessageItemError />}>
            <View style={[style.container, isQueued && style.containerQueued]}>
                <Row>
                    <Column align="start" justify="end" fullWidth={fullWidth}>
                        <View style={bubbleContainerStyles}>
                            {isText ? (
                                <ChatTextEvent
                                    event={event}
                                    isWide={hasWidePreview}
                                    onReplyTap={onReplyTap}
                                    onMentionPress={userId =>
                                        requestAnimationFrame(() =>
                                            setSelectedUserId(userId),
                                        )
                                    }
                                />
                            ) : isEncryptedEvent(event) ? (
                                <ChatEncryptedEvent event={event} />
                            ) : isBolt11PaymentEvent(event) ? (
                                <ChatBolt11PaymentEvent event={event} />
                            ) : isPaymentEvent(event) ? (
                                <ChatPaymentEvent event={event} />
                            ) : isFormEvent(event) ? (
                                <ChatFormEvent event={event} />
                            ) : isImageEvent(event) ? (
                                <ChatImageEvent
                                    event={event}
                                    isInViewport={isInViewport}
                                />
                            ) : isFileEvent(event) ? (
                                <ChatFileEvent event={event} />
                            ) : isVideoEvent(event) ? (
                                <ChatVideoEvent
                                    event={event}
                                    isInViewport={isInViewport}
                                />
                            ) : isDeletedEvent(event) ? (
                                <ChatDeletedEvent event={event} />
                            ) : isPreviewMediaEvent(event) ? (
                                <ChatPreviewMediaEvent event={event} />
                            ) : isPollEvent(event) ? (
                                <ChatPollEvent event={event} />
                            ) : isFederationInviteEvent(event) ? (
                                <ChatFederationInviteEvent event={event} />
                            ) : isCommunityInviteEvent(event) ? (
                                <ChatCommunityInviteEvent event={event} />
                            ) : isMultispendEvent(event) ? (
                                <ChatMultispendEvent event={event} />
                            ) : null}
                        </View>

                        {derivedLinks && isPublic && (
                            <View
                                style={[
                                    style.previewLinkContainer,
                                    isMe
                                        ? style.rightAlignedMessage
                                        : style.leftAlignedMessage,
                                ]}>
                                {derivedLinks.map((url, i) => (
                                    <ChatEmbeddedLinkPreview
                                        url={url}
                                        key={`l-prev-${url}-${i}`}
                                        isFirst={i === 0}
                                        setHasWidePreview={setHasWidePreview}
                                        hasWidePreview={hasWidePreview}
                                    />
                                ))}
                            </View>
                        )}
                    </Column>
                </Row>
            </View>
            <ChatUserActionsOverlay
                onDismiss={() => setSelectedUserId(null)}
                selectedUserId={selectedUserId}
                roomId={event.roomId}
            />
        </ErrorBoundary>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            marginTop: theme.spacing.xxs,
        },
        containerQueued: {
            opacity: 0.5,
        },
        // variable bubble container - let content determine wdith
        bubbleContainer: {
            borderRadius: 16,
            overflow: 'hidden',
            maxWidth: theme.sizes.maxMessageWidth,
        },
        leftAlignedMessage: {
            marginRight: 'auto',
        },
        rightAlignedMessage: {
            marginLeft: 'auto',
        },
        lastReceivedMessage: {
            borderBottomLeftRadius: 4,
        },
        lastSentMessage: {
            borderBottomRightRadius: 4,
        },
        previewLinkContainer: {
            gap: theme.spacing.xxs,
            maxWidth: theme.sizes.maxMessageWidth,
        },
    })

const areEqual = (
    {
        event: prevEvent,
        highlightedMessageId: prevHighlighted,
        isInViewport: prevIsInViewport,
    }: Props,
    {
        event: currEvent,
        highlightedMessageId: currHighlighted,
        isInViewport: currIsInViewport,
    }: Props,
) => {
    if (prevHighlighted !== currHighlighted) {
        return false
    }
    if (prevEvent.localEcho !== currEvent.localEcho) return false

    if (prevIsInViewport !== currIsInViewport) {
        return false
    }

    if (isPaymentEvent(currEvent) && isPaymentEvent(prevEvent)) {
        return (
            prevEvent.id === currEvent.id &&
            prevEvent.content.status === currEvent.content.status
        )
    } else if (isPollEvent(currEvent) && isPollEvent(prevEvent)) {
        return arePollEventsEqual(prevEvent, currEvent)
    } else {
        return (
            prevEvent.content.msgtype === currEvent.content.msgtype &&
            prevEvent.id === currEvent.id &&
            'body' in prevEvent.content &&
            'body' in currEvent.content &&
            prevEvent.content.body === currEvent.content.body
        )
    }
}

export const bubbleGradient = {
    colors: ['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0)'],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
}

export default React.memo(ChatEvent, areEqual)
