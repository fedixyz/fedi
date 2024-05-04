import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native'
import type { LinearGradientProps } from 'react-native-linear-gradient'

import { selectMatrixAuth } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { isPaymentEvent } from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../../state/hooks'
import { OptionalGradient } from '../../ui/OptionalGradient'
import ChatPaymentEvent from './ChatPaymentEvent'
import MessageContents from './MessageContents'

type Props = {
    event: MatrixEvent
    last?: boolean
}

const ChatEvent: React.FC<Props> = ({ event, last = false }: Props) => {
    const { theme } = useTheme()
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const isMe = event.senderId === matrixAuth?.userId
    const isQueued = false
    const isPayment = isPaymentEvent(event)

    let bubbleGradient: LinearGradientProps | undefined
    const bubbleContainerStyles: StyleProp<ViewStyle | TextStyle>[] = [
        styles(theme).bubbleContainer,
    ]
    const bubbleInnerStyles: StyleProp<ViewStyle | TextStyle>[] = [
        styles(theme).bubbleInner,
    ]
    const textStyles: StyleProp<ViewStyle | TextStyle>[] = [
        styles(theme).messageText,
    ]

    // Set alignment (left/right) based on sender
    if (isMe) {
        bubbleContainerStyles.push(styles(theme).rightAlignedMessage)
    } else {
        bubbleContainerStyles.push(styles(theme).leftAlignedMessage)
    }

    if (isPayment) {
        bubbleInnerStyles.push(styles(theme).orangeBubble)
    } else if (isMe) {
        if (last) {
            bubbleContainerStyles.push(styles(theme).lastSentMessage)
        }
        bubbleGradient = {
            colors: ['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0)'],
            start: { x: 0, y: 0 },
            end: { x: 0, y: 1 },
        }
        bubbleInnerStyles.push(styles(theme).blueBubble)
        textStyles.push(styles(theme).sentMessageText)
    } else {
        if (last) {
            bubbleContainerStyles.push(styles(theme).lastReceivedMessage)
        }
        bubbleInnerStyles.push(styles(theme).greyBubble)
        textStyles.push(styles(theme).receivedMessageText)
    }
    return (
        <View
            style={[
                styles(theme).container,
                isQueued && styles(theme).containerQueued,
            ]}>
            <View style={styles(theme).messageContainer}>
                <View style={styles(theme).contentContainer}>
                    <View style={bubbleContainerStyles}>
                        <OptionalGradient
                            gradient={bubbleGradient}
                            style={bubbleInnerStyles}>
                            {isPayment ? (
                                <ChatPaymentEvent event={event} />
                            ) : (
                                <MessageContents
                                    sentByMe={isMe}
                                    content={event.content.body}
                                    textStyles={textStyles}
                                />
                            )}
                        </OptionalGradient>
                    </View>
                </View>
            </View>
        </View>
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
        bubbleInner: {
            padding: 10,
        },
        contentContainer: {
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            width: '100%',
        },
        messageContainer: {
            flexDirection: 'row',
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
        greyBubble: {
            backgroundColor: theme.colors.extraLightGrey,
        },
        blueBubble: {
            backgroundColor: theme.colors.blue,
        },
        orangeBubble: {
            backgroundColor: theme.colors.orange,
        },
        messageText: {
            textAlign: 'left',
            lineHeight: 20,
        },
        receivedMessageText: {
            color: theme.colors.primary,
        },
        sentMessageText: {
            color: theme.colors.secondary,
        },
    })

const areEqual = (prev: Props, curr: Props) => {
    if (
        isPaymentEvent(curr.event) &&
        // TODO: make better TS types to avoid this ick
        'status' in prev.event.content &&
        'status' in curr.event.content
    ) {
        return (
            prev.event.id === curr.event.id &&
            prev.event.content.status === curr.event.content.status
        )
    } else {
        return prev.event.eventId === curr.event.eventId
    }
}

export default React.memo(ChatEvent, areEqual)
