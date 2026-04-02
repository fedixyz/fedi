import { Text, Theme, useTheme } from '@rneui/themed'
import React, { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { MatrixPowerLevel, MatrixRoomMember } from '@fedi/common/types'
import dateUtils from '@fedi/common/utils/DateUtils'
import {
    isMultispendEvent,
    isPowerLevelGreaterOrEqual,
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
    isInViewport?: boolean
}

const AVATAR_SLOT_WIDTH = 43

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
        isInViewport = true,
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

        const content = (
            <View style={[isHighlighted && style.highlightedMessage]}>
                <ChatEvent
                    event={event}
                    last={row.isLastBubbleInRun}
                    isPublic={isPublic}
                    onReplyTap={onReplyTap}
                    highlightedMessageId={highlightedMessageId}
                    isInViewport={isInViewport}
                />
            </View>
        )

        return (
            <View
                style={[
                    style.container,
                    showUsername &&
                        !row.showTimestamp &&
                        style.senderRunSpacing,
                ]}>
                {row.showTimestamp && event.timestamp && (
                    <Column
                        align="center"
                        fullWidth
                        style={style.timestampContainer}>
                        <Text tiny style={style.timestampText}>
                            {dateUtils.formatMessageItemTimestamp(
                                event.timestamp / 1000,
                            )}
                        </Text>
                    </Column>
                )}

                {showUsername && (
                    <Row
                        align="center"
                        gap="xxs"
                        style={style.senderNameContainer}>
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
                                    onPress={handlePress}
                                    onLongPress={handlePress}>
                                    <ChatAvatar
                                        user={
                                            roomMember || { id: event.sender }
                                        }
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
    },
)

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {},
        senderRunSpacing: {
            marginTop: theme.spacing.md,
        },
        timestampContainer: {
            marginVertical: theme.spacing.md,
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
