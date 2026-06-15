import { Text, Theme, useTheme } from '@rneui/themed'
import type { ResourceKey } from 'i18next'
import React, { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { selectMatrixAuth, selectMatrixRoomMemberMap } from '@fedi/common/redux'
import { MatrixEvent, MatrixUser } from '@fedi/common/types'
import {
    MatrixReactionChip,
    makeMatrixReactionUsers,
} from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../../state/hooks'
import { AvatarSize } from '../../ui/Avatar'
import CustomOverlay from '../../ui/CustomOverlay'
import ChatAvatar from './ChatAvatar'

type Props = {
    event: MatrixEvent
    reactions: MatrixReactionChip[]
    selectedReactionKey: string | null
    onSelectReaction: (reactionKey: string) => void
    onToggleReaction: (reactionKey: string) => void
    onDismiss: () => void
}

const ChatReactionDetailsOverlay: React.FC<Props> = ({
    event,
    reactions,
    selectedReactionKey,
    onSelectReaction,
    onToggleReaction,
    onDismiss,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const memberMap = useAppSelector(s =>
        event.roomId ? selectMatrixRoomMemberMap(s, event.roomId) : {},
    )
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const style = styles(theme)
    const lastReactionsRef = useRef<MatrixReactionChip[]>([])
    if (reactions.length) {
        lastReactionsRef.current = reactions
    }
    const displayReactions = reactions.length
        ? reactions
        : lastReactionsRef.current
    const selectedReaction =
        displayReactions.find(
            reaction => reaction.key === selectedReactionKey,
        ) ||
        displayReactions[0] ||
        null

    const users = useMemo(() => {
        if (!selectedReaction) return []

        return makeMatrixReactionUsers({
            reaction: selectedReaction,
            memberMap,
            myId: matrixAuth?.userId,
        })
    }, [memberMap, matrixAuth?.userId, selectedReaction])

    const renderUser = (user: MatrixUser) => {
        const isMe = user.id === matrixAuth?.userId

        return (
            <Pressable
                key={user.id}
                accessibilityRole={isMe ? 'button' : undefined}
                accessibilityLabel={
                    isMe
                        ? `${selectedReaction?.key} reaction by you, tap to remove`
                        : `${selectedReaction?.key} reaction by ${user.displayName}`
                }
                onPress={
                    isMe && selectedReaction
                        ? () => onToggleReaction(selectedReaction.key)
                        : undefined
                }
                style={style.userRow}>
                <ChatAvatar user={user} size={AvatarSize.md} />
                <View style={style.userText}>
                    <Text bold numberOfLines={1} style={style.userName}>
                        {isMe
                            ? t('feature.chat.reaction-you' as ResourceKey)
                            : user.displayName}
                    </Text>
                    {isMe && (
                        <Text style={style.removeText}>
                            {t(
                                'feature.chat.reaction-tap-to-remove' as ResourceKey,
                            )}
                        </Text>
                    )}
                </View>
            </Pressable>
        )
    }

    return (
        <CustomOverlay
            show={!!selectedReactionKey}
            onBackdropPress={onDismiss}
            noHeaderPadding
            contents={{
                body: (
                    <View style={style.container}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={style.tabs}
                            contentContainerStyle={style.tabsContent}>
                            {displayReactions.map(reaction => {
                                const selected =
                                    reaction.key === selectedReaction?.key
                                return (
                                    <Pressable
                                        key={reaction.key}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${reaction.key} reactions, ${reaction.count}`}
                                        onPress={() =>
                                            onSelectReaction(reaction.key)
                                        }
                                        style={[
                                            style.tab,
                                            selected && style.selectedTab,
                                        ]}>
                                        <Text style={style.tabEmoji}>
                                            {reaction.key}
                                        </Text>
                                        <Text style={style.tabCount}>
                                            {reaction.count}
                                        </Text>
                                    </Pressable>
                                )
                            })}
                        </ScrollView>
                        <View style={style.userList}>
                            {users.map(renderUser)}
                        </View>
                    </View>
                ),
            }}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingBottom: theme.spacing.md,
            paddingTop: theme.spacing.lg,
            width: '100%',
        },
        tabs: {
            borderBottomColor: theme.colors.extraLightGrey,
            borderBottomWidth: 1,
            width: '100%',
        },
        tabsContent: {
            paddingHorizontal: theme.spacing.md,
        },
        tab: {
            alignItems: 'center',
            borderBottomColor: 'transparent',
            borderBottomWidth: 2,
            flexDirection: 'row',
            height: 48,
            justifyContent: 'center',
            marginRight: theme.spacing.md,
            minWidth: 48,
            paddingHorizontal: theme.spacing.xs,
        },
        selectedTab: {
            borderBottomColor: theme.colors.primary,
        },
        tabEmoji: {
            fontSize: 20,
            lineHeight: 28,
        },
        tabCount: {
            color: theme.colors.primary,
            fontSize: 14,
            lineHeight: 20,
            marginLeft: theme.spacing.xs,
        },
        userList: {
            paddingTop: theme.spacing.md,
        },
        userRow: {
            alignItems: 'center',
            flexDirection: 'row',
            minHeight: 64,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
        },
        userText: {
            flex: 1,
            marginLeft: theme.spacing.md,
        },
        userName: {
            color: theme.colors.primary,
            fontSize: 14,
            lineHeight: 20,
        },
        removeText: {
            color: theme.colors.blue,
            fontSize: 11,
            lineHeight: 14,
        },
    })

export default ChatReactionDetailsOverlay
