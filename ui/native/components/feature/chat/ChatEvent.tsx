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
import Flex from '../../ui/Flex'
import ChatMultispendEvent from '../multispend/chat-events/ChatMultispendEvent'
import ChatBolt11PaymentEvent from './ChatBolt11PaymentEvent'
import ChatDeletedEvent from './ChatDeletedEvent'
import ChatEmbeddedLinkPreview from './ChatEmbeddedLinkPreview'
import ChatEncryptedEvent from './ChatEncryptedEvent'
import ChatFileEvent from './ChatFileEvent'
import ChatFormEvent from './ChatFormEvent'
import ChatImageEvent from './ChatImageEvent'
import ChatPaymentEvent from './ChatPaymentEvent'
import ChatPollEvent from './ChatPollEvent'
import ChatPreviewMediaEvent from './ChatPreviewMediaEvent'
import ChatTextEvent from './ChatTextEvent'
import ChatVideoEvent from './ChatVideoEvent'
import { MessageItemError } from './MessageItemError'

type Props = {
    event: MatrixEvent
    last?: boolean
    fullWidth?: boolean
    isPublic?: boolean
}

const ChatEvent: React.FC<Props> = ({
    event,
    last = false,
    fullWidth = true,
    // Defaults to true so we don't default to loading chat events with media
    isPublic = true,
}: Props) => {
    const { theme } = useTheme()
    const [hasWidePreview, setHasWidePreview] = useState(false)
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const isMe =
        event.senderId === matrixAuth?.userId && !isMultispendEvent(event)
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

    return (
        <ErrorBoundary fallback={() => <MessageItemError />}>
            <View
                style={[
                    styles(theme).container,
                    isQueued && styles(theme).containerQueued,
                ]}>
                <Flex row>
                    <Flex align="start" justify="end" fullWidth={fullWidth}>
                        <View style={bubbleContainerStyles}>
                            {isText ? (
                                <ChatTextEvent
                                    event={event}
                                    isWide={hasWidePreview}
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
                                <ChatImageEvent event={event} />
                            ) : isFileEvent(event) ? (
                                <ChatFileEvent event={event} />
                            ) : isVideoEvent(event) ? (
                                <ChatVideoEvent event={event} />
                            ) : isDeletedEvent(event) ? (
                                <ChatDeletedEvent event={event} />
                            ) : isPreviewMediaEvent(event) ? (
                                <ChatPreviewMediaEvent event={event} />
                            ) : isPollEvent(event) ? (
                                <ChatPollEvent event={event} />
                            ) : isMultispendEvent(event) ? (
                                <ChatMultispendEvent event={event} />
                            ) : null}
                        </View>
                        {derivedLinks && isPublic && (
                            <View
                                style={[
                                    styles(theme).previewLinkContainer,
                                    isMe
                                        ? styles(theme).rightAlignedMessage
                                        : styles(theme).leftAlignedMessage,
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
                    </Flex>
                </Flex>
            </View>
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
        bubbleContainer: {
            borderRadius: 16,
            maxWidth: theme.sizes.maxMessageWidth,
            overflow: 'hidden',
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

const areEqual = ({ event: prevEvent }: Props, { event: currEvent }: Props) => {
    if (isPaymentEvent(currEvent) && isPaymentEvent(prevEvent)) {
        return (
            prevEvent.id === currEvent.id &&
            prevEvent.content.status === currEvent.content.status
        )
    } else if (isPollEvent(currEvent) && isPollEvent(prevEvent)) {
        return arePollEventsEqual(prevEvent, currEvent)
    } else {
        return (
            prevEvent.eventId === currEvent.eventId &&
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
