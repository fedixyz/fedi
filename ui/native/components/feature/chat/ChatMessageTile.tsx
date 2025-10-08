import { Theme, useTheme } from '@rneui/themed'
import { useMemo } from 'react'
import { StyleSheet } from 'react-native'

import { selectMatrixRoomMember } from '@fedi/common/redux/matrix'
import { MatrixRoom, SendableMatrixEvent } from '@fedi/common/types'
import dateUtils from '@fedi/common/utils/DateUtils'
import { matrixIdToUsername, isTextEvent } from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../../state/hooks'
import { AvatarSize } from '../../ui/Avatar'
import ChatAvatar from './ChatAvatar'
import ChatTile from './ChatTile'

type ChatMessageTileProps = {
    event: SendableMatrixEvent
    room: MatrixRoom
    senderDisplayName?: string
    searchQuery: string
    onSelect: (event: SendableMatrixEvent) => void
}

const ChatMessageTile = ({
    event,
    room,
    senderDisplayName,
    searchQuery,
    onSelect,
}: ChatMessageTileProps) => {
    const { theme } = useTheme()

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
        if (!searchQuery || !messageBody) return messageBody

        const queryLower = searchQuery.toLowerCase()
        const bodyLower = messageBody.toLowerCase()
        const index = bodyLower.indexOf(queryLower)

        if (index === -1) return messageBody

        // Create highlighted text with bold formatting
        const beforeMatch = messageBody.substring(0, index)
        const match = messageBody.substring(index, index + searchQuery.length)
        const afterMatch = messageBody.substring(index + searchQuery.length)

        return { beforeMatch, match, afterMatch }
    }, [messageBody, searchQuery])

    const timestampValue = useMemo(() => {
        if (!event.timestamp) return ''
        return dateUtils.formatChatTileTimestamp(event.timestamp / 1000)
    }, [event.timestamp])

    const style = styles(theme)

    const renderHighlightedText = () => {
        if (typeof highlightedText === 'string') {
            return highlightedText
        } else {
            const { beforeMatch, match, afterMatch } = highlightedText
            return `${beforeMatch}${match}${afterMatch}`
        }
        // TODO: implement bolded highlighting
        // if (typeof highlightedText === 'string') {
        //     return highlightedText
        // }
        // const { beforeMatch, match, afterMatch } = highlightedText
        // return (
        //     <Text caption style={style.messagePreview} numberOfLines={2}>
        //         {beforeMatch}
        //         <Text style={style.highlightedText}>{match}</Text>
        //         {afterMatch}
        //     </Text>
        // )
    }

    const subtitle = renderHighlightedText()
    const subtitleProps = {
        medium: true,
        style: style.messagePreview,
    }

    return (
        <ChatTile
            onPress={() => onSelect(event)}
            avatar={
                <ChatAvatar
                    user={{
                        id: event.sender,
                        displayName: senderName,
                        avatarUrl: member?.avatarUrl,
                    }}
                    size={AvatarSize.md}
                    maxFontSizeMultiplier={1.2}
                />
            }
            title={senderName}
            subtitle={subtitle}
            subtitleProps={subtitleProps}
            timestamp={timestampValue}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        messagePreview: {
            color: theme.colors.darkGrey,
        },
        highlightedText: {
            color: theme.colors.primary,
            fontWeight: 'bold',
        },
    })

export default ChatMessageTile
