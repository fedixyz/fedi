import React, { useMemo } from 'react'

import { selectMatrixRoomMember } from '@fedi/common/redux/matrix'
import { MatrixRoom, SendableMatrixEvent } from '@fedi/common/types'
import dateUtils from '@fedi/common/utils/DateUtils'
import { matrixIdToUsername, isTextEvent } from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { ChatAvatar } from './ChatAvatar'
import { ChatTile } from './ChatTile'

type ChatMessageTileProps = {
    event: SendableMatrixEvent
    room: MatrixRoom
    senderDisplayName?: string
    searchQuery: string
}

export const ChatMessageTile: React.FC<ChatMessageTileProps> = ({
    event,
    room,
    senderDisplayName,
    searchQuery,
}) => {
    const member = useAppSelector(s =>
        selectMatrixRoomMember(s, room.id, event.sender),
    )

    const senderName = useMemo(() => {
        return senderDisplayName || matrixIdToUsername(event.sender)
    }, [senderDisplayName, event.sender])

    const messageBody = useMemo(() => {
        if (!isTextEvent(event)) return ''
        return (event.content as { body: string }).body || ''
    }, [event])

    const highlightedText = useMemo(() => {
        if (!searchQuery || !messageBody)
            return { text: messageBody, hasMatch: false }

        const queryLower = searchQuery.toLowerCase()
        const bodyLower = messageBody.toLowerCase()
        const index = bodyLower.indexOf(queryLower)

        if (index === -1) return { text: messageBody, hasMatch: false }

        // Create highlighted text segments
        const beforeMatch = messageBody.substring(0, index)
        const match = messageBody.substring(index, index + searchQuery.length)
        const afterMatch = messageBody.substring(index + searchQuery.length)

        return { beforeMatch, match, afterMatch, hasMatch: true }
    }, [messageBody, searchQuery])

    const timestampValue = useMemo(() => {
        if (!event.timestamp) return ''
        return dateUtils.formatChatTileTimestamp(event.timestamp / 1000)
    }, [event.timestamp])

    const renderHighlightedText = () => {
        if (!highlightedText.hasMatch) {
            return highlightedText.text
        }
        const { beforeMatch, match, afterMatch } = highlightedText as {
            beforeMatch: string
            match: string
            afterMatch: string
        }
        return (
            <>
                {beforeMatch}
                <HighlightedText>{match}</HighlightedText>
                {afterMatch}
            </>
        )
    }

    return (
        <ChatTile
            href={`/chat/room/${room.id}#message=${encodeURIComponent(event.id)}`}
            avatar={
                <ChatAvatar
                    user={{
                        id: event.sender,
                        displayName: senderName,
                        avatarUrl: member?.avatarUrl,
                    }}
                    css={{ flexShrink: 0 }}
                />
            }
            title={senderName}
            subtitle={renderHighlightedText()}
            subtitleProps={{
                css: { color: theme.colors.darkGrey },
            }}
            timestamp={timestampValue}
        />
    )
}

const HighlightedText = styled('span', {
    color: theme.colors.primary,
    fontWeight: 'bold',
})
