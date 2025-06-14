import { Text, Theme, useTheme } from '@rneui/themed'
import isEqual from 'lodash/isEqual'
import React, { memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { selectMatrixAuth, selectMatrixRoomMembers } from '@fedi/common/redux'
import { MatrixEvent, MatrixRoomMember } from '@fedi/common/types'
import { isMultispendEvent } from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../../state/hooks'
import Flex from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'
import ChatAvatar from './ChatAvatar'
import ChatEvent from './ChatEvent'

interface Props {
    roomId: string
    onSelect: (userId: string) => void
    showUsernames?: boolean
    isPublic?: boolean
    events: MatrixEvent[]
}

const ChatEventTimeFrame = memo(
    ({ events, roomId, showUsernames, isPublic, onSelect }: Props) => {
        const matrixAuth = useAppSelector(selectMatrixAuth)
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

        const sentBy = events[0].senderId || ''

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
                        {events.map((event, eindex) => (
                            <ChatEvent
                                key={`ceci-eb-${event.eventId}`}
                                event={event}
                                last={eindex === 0}
                                isPublic={isPublic}
                            />
                        ))}
                    </View>
                </Flex>
            </View>
        )
    },
    (prev, curr) => isEqual(prev.events, curr.events),
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
    })

export default ChatEventTimeFrame
