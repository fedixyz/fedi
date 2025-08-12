import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { useMatrixRepliedMessage } from '@fedi/common/hooks/matrix'
import {
    selectMatrixAuth,
    selectMatrixRoomMembers,
    setSelectedChatMessage,
} from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { OptionalGradient } from '../../ui/OptionalGradient'
import { bubbleGradient } from './ChatEvent'
import ChatRepliedMessage from './ChatRepliedMessage'
import MessageContents from './MessageContents'

type Props = {
    event: MatrixEvent<MatrixEventContentType<'m.text'>>
    isWide?: boolean
    onReplyTap?: (eventId: string) => void
}

const ChatTextEvent: React.FC<Props> = ({ event, isWide, onReplyTap }) => {
    const { repliedData, strippedBody } = useMatrixRepliedMessage(event)

    const matrixAuth = useAppSelector(selectMatrixAuth)
    const { theme } = useTheme()
    const style = styles(theme)
    const dispatch = useAppDispatch()

    // Get room members for reply sender lookup
    const roomMembers = useAppSelector(s =>
        selectMatrixRoomMembers(s, event.roomId),
    )

    const isMe = event.senderId === matrixAuth?.userId

    const handleLongPress = () => {
        dispatch(setSelectedChatMessage(event))
    }

    return (
        <Pressable
            onLongPress={handleLongPress}
            android_ripple={{ color: 'transparent' }}
            style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
            <OptionalGradient
                gradient={isMe ? bubbleGradient : undefined}
                style={[
                    style.bubbleInner,
                    isMe ? style.blueBubble : style.greyBubble,
                    {
                        maxWidth: theme.sizes.maxMessageWidth,
                        alignSelf: isMe ? 'flex-end' : 'flex-start',
                        // Prevent any layout animations
                        transform: [{ translateX: 0 }],
                        ...(isWide && {
                            width: theme.sizes.maxMessageWidth,
                        }),
                    },
                ]}>
                {repliedData && onReplyTap && (
                    <View style={style.replyContainer}>
                        <ChatRepliedMessage
                            repliedData={repliedData}
                            onReplyTap={onReplyTap}
                            roomMembers={roomMembers}
                            isFromCurrentUser={isMe}
                        />
                    </View>
                )}

                <MessageContents
                    content={strippedBody}
                    sentByMe={isMe}
                    textStyles={[
                        isMe
                            ? styles(theme).outgoingText
                            : styles(theme).incomingText,
                    ]}
                />
            </OptionalGradient>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        bubbleInner: {
            padding: 12,
        },
        greyBubble: {
            backgroundColor: theme.colors.extraLightGrey,
        },
        blueBubble: {
            backgroundColor: theme.colors.blue,
        },
        incomingText: {
            color: theme.colors.primary,
        },
        outgoingText: {
            color: theme.colors.secondary,
        },
        replyContainer: {
            marginBottom: theme.spacing.md,
            alignSelf: 'stretch',
        },
    })

export default ChatTextEvent
