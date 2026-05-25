import { Text, Theme, useTheme } from '@rneui/themed'
import React, { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { MatrixPowerLevel, MatrixRoomMember } from '@fedi/common/types'
import dateUtils from '@fedi/common/utils/DateUtils'
import {
    isMultispendEvent,
    isPowerLevelGreaterOrEqual,
    isRoomMemberEvent,
} from '@fedi/common/utils/matrix'

import { ChatConversationRow } from '../../../utils/chatConversationRows'
import { Row, Column } from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'
import ChatAvatar from './ChatAvatar'
import ChatEvent from './ChatEvent'
import ChatSwipeableEventContainer from './ChatSwipeableEventContainer'

type Props = {
    roomId: string
    row: ChatConversationRow
    roomMember?: MatrixRoomMember
    myId?: string | null
    canSwipe: boolean
    isPublic?: boolean
    onSelect: (userId: string) => void
    onReplyTap?: (eventId: string) => void
    highlightedMessageId?: string | null
    olderRow?: ChatConversationRow
    newerRow?: ChatConversationRow
}

const AVATAR_SLOT_WIDTH = 43
export const CHAT_CONVERSATION_ROW_SPACING = {
    systemNoticeAdjacentSystemNotice: 0,
    systemNoticeAdjacentTimestamp: 0,
    systemNoticeAdjacentMessage: 8,
    systemNoticeListEdge: 16,
    senderRun: 12,
    timestampMarginVertical: 12,
}

export const getSystemNoticeSpacing = (row?: ChatConversationRow) => {
    if (!row) return CHAT_CONVERSATION_ROW_SPACING.systemNoticeListEdge
    if (row.layout === 'systemNotice') {
        return CHAT_CONVERSATION_ROW_SPACING.systemNoticeAdjacentSystemNotice
    }
    if (row.showTimestamp) {
        return CHAT_CONVERSATION_ROW_SPACING.systemNoticeAdjacentTimestamp
    }
    return CHAT_CONVERSATION_ROW_SPACING.systemNoticeAdjacentMessage
}

type ChatConversationEventRowStyles = ReturnType<typeof styles>

type TimestampProps = {
    timestamp?: number
    style: ChatConversationEventRowStyles
}

const MessageTimestamp: React.FC<TimestampProps> = ({ timestamp, style }) => {
    if (!timestamp) return null

    return (
        <Column align="center" fullWidth style={style.timestampContainer}>
            <Text tiny style={style.timestampText}>
                {dateUtils.formatMessageItemTimestamp(timestamp / 1000)}
            </Text>
        </Column>
    )
}

type SystemNoticeRowProps = {
    row: ChatConversationRow
    olderRow?: ChatConversationRow
    newerRow?: ChatConversationRow
    style: ChatConversationEventRowStyles
}

const SystemNoticeRow: React.FC<SystemNoticeRowProps> = ({
    row,
    olderRow,
    newerRow,
    style,
}) => {
    const { event } = row

    return (
        <View
            testID={`chat-system-notice-row-${event.id}`}
            style={[
                style.container,
                style.systemNoticeContainer,
                {
                    paddingTop: getSystemNoticeSpacing(olderRow),
                    paddingBottom: getSystemNoticeSpacing(newerRow),
                },
            ]}>
            {row.showTimestamp && (
                <MessageTimestamp timestamp={event.timestamp} style={style} />
            )}
            <ChatEvent event={event} />
        </View>
    )
}

type MessageRowProps = {
    roomId: string
    row: ChatConversationRow
    roomMember?: MatrixRoomMember
    canSwipe: boolean
    isPublic?: boolean
    displayName: string
    isAdmin: boolean | undefined
    showUsername: boolean
    reserveAvatarSlot: boolean
    showAvatar: boolean
    isHighlighted: boolean
    onSenderPress: () => void
    onReplyTap?: (eventId: string) => void
    highlightedMessageId?: string | null
    style: ChatConversationEventRowStyles
}

const MessageRow: React.FC<MessageRowProps> = ({
    roomId,
    row,
    roomMember,
    canSwipe,
    isPublic,
    displayName,
    isAdmin,
    showUsername,
    reserveAvatarSlot,
    showAvatar,
    isHighlighted,
    onSenderPress,
    onReplyTap,
    highlightedMessageId,
    style,
}) => {
    const { event } = row
    const content = (
        <View style={[isHighlighted && style.highlightedMessage]}>
            <ChatEvent
                event={event}
                last={row.isLastBubbleInRun}
                isPublic={isPublic}
                onReplyTap={onReplyTap}
                highlightedMessageId={highlightedMessageId}
            />
        </View>
    )

    return (
        <View
            style={[
                style.container,
                showUsername && !row.showTimestamp && style.senderRunSpacing,
            ]}>
            {row.showTimestamp && (
                <MessageTimestamp timestamp={event.timestamp} style={style} />
            )}

            {showUsername && (
                <Row align="center" gap="xxs" style={style.senderNameContainer}>
                    <Text small>{displayName}</Text>
                    {isAdmin && <SvgImage size={12} name="AdminBadge" />}
                </Row>
            )}

            <Row align="end">
                {reserveAvatarSlot ? (
                    <View style={style.senderAvatarSlot}>
                        {showAvatar ? (
                            <Pressable
                                style={style.senderAvatar}
                                hitSlop={30}
                                pressRetentionOffset={30}
                                onPress={onSenderPress}
                                onLongPress={onSenderPress}>
                                <ChatAvatar
                                    user={roomMember || { id: event.sender }}
                                />
                            </Pressable>
                        ) : (
                            <View style={style.senderAvatarSpacer} />
                        )}
                    </View>
                ) : null}

                <View style={style.messageContainer}>
                    {canSwipe ? (
                        <ChatSwipeableEventContainer
                            roomId={roomId}
                            event={event}>
                            {content}
                        </ChatSwipeableEventContainer>
                    ) : (
                        content
                    )}
                </View>
            </Row>
        </View>
    )
}

const ChatConversationEventRow = memo(
    ({
        roomId,
        row,
        roomMember,
        myId,
        canSwipe,
        isPublic,
        onSelect,
        onReplyTap,
        highlightedMessageId,
        olderRow,
        newerRow,
    }: Props) => {
        const { t } = useTranslation()
        const { theme } = useTheme()
        const style = useMemo(() => styles(theme), [theme])

        const { event } = row
        const isMe = event.sender === myId && !isMultispendEvent(event)
        const hasLeft = roomMember?.membership === 'leave'
        const isBanned = roomMember?.membership === 'ban'
        const isAdmin =
            roomMember?.powerLevel &&
            isPowerLevelGreaterOrEqual(
                roomMember.powerLevel,
                MatrixPowerLevel.Admin,
            )
        const displayName = isBanned
            ? t('feature.chat.removed-member')
            : hasLeft
              ? t('feature.chat.former-member')
              : roomMember?.displayName || '...'

        const showUsername = row.showUsernames && row.showUsername && !isMe
        const reserveAvatarSlot = row.showUsernames && !isMe
        const showAvatar = reserveAvatarSlot && row.showAvatar

        const handlePress = useCallback(() => {
            if (!roomMember || roomMember.membership === 'leave') {
                return
            }

            onSelect(roomMember.id)
        }, [onSelect, roomMember])

        const isPending = event.localEcho
        // Highlighted rows are only driven by explicit focus actions such as
        // reply jumps, route exact-scroll, and pinned-banner taps. Suppressing
        // the flash for recent messages makes successful focus on the newest
        // pinned message look like a no-op when that row is already on screen.
        const isHighlighted = !isPending && highlightedMessageId === event.id

        if (row.layout === 'systemNotice') {
            return (
                <SystemNoticeRow
                    row={row}
                    olderRow={olderRow}
                    newerRow={newerRow}
                    style={style}
                />
            )
        }

        if (isRoomMemberEvent(event)) return null

        return (
            <MessageRow
                roomId={roomId}
                row={row}
                roomMember={roomMember}
                canSwipe={canSwipe}
                isPublic={isPublic}
                displayName={displayName}
                isAdmin={isAdmin}
                showUsername={showUsername}
                reserveAvatarSlot={reserveAvatarSlot}
                showAvatar={showAvatar}
                isHighlighted={isHighlighted}
                onSenderPress={handlePress}
                onReplyTap={onReplyTap}
                highlightedMessageId={highlightedMessageId}
                style={style}
            />
        )
    },
)

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {},
        systemNoticeContainer: {
            alignItems: 'center',
        },
        senderRunSpacing: {
            marginTop: CHAT_CONVERSATION_ROW_SPACING.senderRun,
        },
        timestampContainer: {
            marginVertical:
                CHAT_CONVERSATION_ROW_SPACING.timestampMarginVertical,
        },
        timestampText: {
            color: theme.colors.darkGrey,
        },
        senderNameContainer: {
            paddingLeft: AVATAR_SLOT_WIDTH,
        },
        senderAvatarSlot: {
            width: AVATAR_SLOT_WIDTH,
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
        },
        senderAvatar: {
            flexDirection: 'row',
            alignItems: 'flex-end',
        },
        senderAvatarSpacer: {
            width: AVATAR_SLOT_WIDTH,
        },
        messageContainer: {
            flex: 1,
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

export default ChatConversationEventRow
