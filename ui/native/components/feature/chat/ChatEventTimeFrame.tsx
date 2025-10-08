import { Text, Theme, useTheme } from '@rneui/themed'
import isEqual from 'lodash/isEqual'
import React, { memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import {
    selectCanReply,
    selectMatrixAuth,
    selectMatrixRoomMembers,
} from '@fedi/common/redux'
import { MatrixRoomMember, MatrixEvent } from '@fedi/common/types'
import { isMultispendEvent } from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../../state/hooks'
import Flex from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'
import ChatAvatar from './ChatAvatar'
import ChatEvent from './ChatEvent'
import ChatSwipeableEventContainer from './ChatSwipeableEventContainer'

interface Props {
    roomId: string
    onSelect: (userId: string) => void
    showUsernames?: boolean
    isPublic?: boolean
    events: MatrixEvent[]
    onReplyTap?: (eventId: string) => void
    highlightedMessageId?: string | null
    isInViewport?: boolean
}

const ChatEventTimeFrame = memo(
    ({
        events,
        roomId,
        showUsernames,
        isPublic,
        onSelect,
        onReplyTap,
        highlightedMessageId,
        isInViewport = true,
    }: Props) => {
        const matrixAuth = useAppSelector(selectMatrixAuth)
        const canSwipe = useAppSelector(s => selectCanReply(s, roomId))

        const { t } = useTranslation()
        const { theme } = useTheme()
        const style = styles(theme)

        const roomMembers = useAppSelector(s =>
            selectMatrixRoomMembers(s, roomId),
        )

        const handlePress = useCallback(
            (member?: MatrixRoomMember) =>
                member && member?.membership !== 'leave' && onSelect(member.id),
            [onSelect],
        )

        if (!events.length) return null

        const sentBy = events[0].sender || ''

        const roomMember = roomMembers.find(m => m.id === sentBy)
        const isMe =
            sentBy === matrixAuth?.userId && !isMultispendEvent(events[0])
        const hasLeft = roomMember?.membership === 'leave'
        const isBanned = roomMember?.membership === 'ban'
        const isAdmin = roomMember?.powerLevel === 100
        const displayName = isBanned
            ? t('feature.chat.removed-member')
            : hasLeft
              ? t('feature.chat.former-member')
              : roomMember?.displayName || '...'

        return (
            <View style={style.senderGroup}>
                {showUsernames && !isMe && (
                    <Flex
                        row
                        align="center"
                        gap="xxs"
                        style={style.senderNameContainer}>
                        <Text small>{displayName}</Text>
                        {isAdmin && <SvgImage size={12} name="AdminBadge" />}
                    </Flex>
                )}

                <Flex row align="end">
                    {!isMe && showUsernames && (
                        <Pressable
                            style={style.senderAvatar}
                            hitSlop={30}
                            pressRetentionOffset={30}
                            onPress={() => handlePress(roomMember)}
                            onLongPress={() => handlePress(roomMember)}>
                            <ChatAvatar user={roomMember || { id: sentBy }} />
                        </Pressable>
                    )}

                    <View style={style.senderMessages}>
                        {events.map((event, eindex) => {
                            const isPending = event.localEcho

                            const isVeryRecent = (() => {
                                if (!event.timestamp) return false
                                const now = Date.now()
                                const messageAge = now - event.timestamp
                                return messageAge < 1200
                            })()

                            // Don't highlight if message is pending or very recent
                            const isHighlighted =
                                !isPending &&
                                !isVeryRecent &&
                                (highlightedMessageId === event.id ||
                                    highlightedMessageId === event.id)

                            const content = (
                                <View
                                    style={[
                                        isHighlighted &&
                                            style.highlightedMessage,
                                    ]}>
                                    <ChatEvent
                                        event={event}
                                        last={eindex === 0}
                                        isPublic={isPublic}
                                        onReplyTap={onReplyTap}
                                        highlightedMessageId={
                                            highlightedMessageId
                                        }
                                        isInViewport={isInViewport}
                                    />
                                </View>
                            )

                            return canSwipe ? (
                                <ChatSwipeableEventContainer
                                    key={`ceci-eb-${event.id}`}
                                    roomId={roomId}
                                    event={event}>
                                    {content}
                                </ChatSwipeableEventContainer>
                            ) : (
                                <View key={`ceci-eb-${event.id}`}>
                                    {content}
                                </View>
                            )
                        })}
                    </View>
                </Flex>
            </View>
        )
    },
    (prev, curr) => {
        if (prev.isInViewport !== curr.isInViewport) {
            return false
        }
        if (prev.highlightedMessageId !== curr.highlightedMessageId) {
            return false
        }
        return isEqual(prev.events, curr.events)
    },
)

const styles = (theme: Theme) =>
    StyleSheet.create({
        senderGroup: {
            marginBottom: theme.spacing.md,
        },
        senderAvatar: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            marginRight: theme.spacing.sm,
        },
        senderNameContainer: { paddingLeft: 43 },
        senderMessages: {
            flexDirection: 'column-reverse',
        },
        highlightedMessage: {
            backgroundColor: 'rgba(0, 123, 255, 0.1)',
            borderRadius: 18,
            marginHorizontal: -4,
            marginVertical: -2,
            shadowColor: '#007AFF',
            shadowOffset: {
                width: 0,
                height: 0,
            },
            shadowOpacity: 0.3,
            shadowRadius: 8,
        },
    })

export default ChatEventTimeFrame
