import { Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

import { useMatrixRepliedMessage } from '@fedi/common/hooks/matrix'
import {
    selectMatrixAuth,
    selectMatrixRoomMembers,
    setSelectedChatMessage,
} from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import {
    stripReplyFromFormattedBody,
    isHtmlFormattedContent,
} from '@fedi/common/utils/matrix'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import ChatEventWrapper from './ChatEventWrapper'
import ChatRepliedMessage from './ChatRepliedMessage'
import MessageContents from './MessageContents'

type Props = {
    event: MatrixEvent<'m.text'>
    isWide?: boolean
    onReplyTap?: (eventId: string) => void
    onMentionPress?: (userId: string) => void
}

const ChatTextEvent: React.FC<Props> = ({
    event,
    isWide,
    onReplyTap,
    onMentionPress,
}) => {
    const { repliedData, strippedBody } = useMatrixRepliedMessage(event)
    const isReplied = !!repliedData

    const matrixAuth = useAppSelector(selectMatrixAuth)
    const { theme } = useTheme()
    const style = styles(theme)
    const dispatch = useAppDispatch()

    // Get room members for reply sender lookup
    const roomMembers = useAppSelector(s =>
        selectMatrixRoomMembers(s, event.roomId),
    )

    const handleLongPress = () => {
        dispatch(setSelectedChatMessage(event))
    }

    // remove Matrix "edited" fallback markers at the very start: "* ", "** ", etc.
    const stripLeadingEditStars = (s: string) =>
        s.replace(/^(?:\s*(?:\*|&#42;)\s+)+/, '')

    // prefer formatted_body so <a href="…">@name</a> stays underlined.
    // if this is a reply, strip the <mx-reply> wrapper.
    const contentForDisplay = useMemo(() => {
        const c = event.content
        if (isHtmlFormattedContent(c)) {
            const html = isReplied
                ? stripReplyFromFormattedBody(c.formatted_body)
                : c.formatted_body
            if (html && html.trim()) return html
        }
        return strippedBody
    }, [event.content, isReplied, strippedBody])

    const cleanedContentForDisplay = useMemo(
        () =>
            contentForDisplay
                ? stripLeadingEditStars(contentForDisplay)
                : contentForDisplay,
        [contentForDisplay],
    )
    const isMe = event.sender === matrixAuth?.userId

    return (
        <ChatEventWrapper
            event={event}
            isWide={isWide}
            handleLongPress={handleLongPress}>
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
                roomMembers={roomMembers}
                content={cleanedContentForDisplay}
                sentByMe={isMe}
                textStyles={[isMe ? style.outgoingText : style.incomingText]}
                onMentionPress={onMentionPress}
                currentUserId={matrixAuth?.userId}
            />
        </ChatEventWrapper>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
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
