import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { MatrixEvent } from '@fedi/common/types'
import {
    MatrixReactionChip,
    makeMatrixReactionChips,
} from '@fedi/common/utils/matrix'

import SvgImage from '../../ui/SvgImage'

type Props = {
    event: MatrixEvent
    isMe: boolean
    myId?: string | null
    onAddReaction?: () => void
    onReactionPress?: (reaction: MatrixReactionChip) => void
}

export const ChatReactions: React.FC<Props> = ({
    event,
    isMe,
    myId,
    onAddReaction,
    onReactionPress,
}) => {
    const { theme } = useTheme()
    const style = styles(theme)
    const reactions = makeMatrixReactionChips(event.reactions, myId)

    if (!reactions.length) return null

    return (
        <View
            accessibilityLabel="message reactions"
            style={[
                style.reactions,
                isMe ? style.sentReactions : style.receivedReactions,
            ]}>
            {reactions.map(reaction => (
                <Pressable
                    key={reaction.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${reaction.key} reaction${
                        reaction.count > 1 ? `, ${reaction.count}` : ''
                    }${reaction.reactedByMe ? ', reacted by you' : ''}`}
                    onPress={() => onReactionPress?.(reaction)}
                    style={[
                        style.reaction,
                        reaction.reactedByMe && style.ownReaction,
                    ]}>
                    <Text style={style.emoji}>{reaction.key}</Text>
                    {reaction.count > 1 && (
                        <Text style={style.count}>{reaction.count}</Text>
                    )}
                </Pressable>
            ))}
            {onAddReaction && (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="add reaction"
                    onPress={onAddReaction}
                    style={style.addReaction}>
                    <SvgImage
                        name="Plus"
                        size={12}
                        color={theme.colors.darkGrey}
                    />
                </Pressable>
            )}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        reactions: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            marginTop: -4,
            maxWidth: theme.sizes.maxMessageWidth,
        },
        sentReactions: {
            alignSelf: 'flex-end',
            justifyContent: 'flex-end',
        },
        receivedReactions: {
            alignSelf: 'flex-start',
            justifyContent: 'flex-start',
        },
        reaction: {
            alignItems: 'center',
            backgroundColor: theme.colors.extraLightGrey,
            borderColor: theme.colors.white,
            borderRadius: 16,
            borderWidth: 1,
            flexDirection: 'row',
            height: 22,
            justifyContent: 'center',
            minWidth: 26,
            paddingBottom: 1,
            paddingHorizontal: theme.spacing.xs,
        },
        ownReaction: {
            backgroundColor: '#E6F1FE',
            borderColor: theme.colors.blue,
        },
        addReaction: {
            alignItems: 'center',
            backgroundColor: theme.colors.extraLightGrey,
            borderColor: theme.colors.white,
            borderRadius: 16,
            borderWidth: 1,
            height: 22,
            justifyContent: 'center',
            minWidth: 26,
            paddingBottom: 1,
            paddingHorizontal: theme.spacing.xs,
        },
        emoji: {
            color: '#667085',
            fontSize: 14,
            lineHeight: 20,
        },
        count: {
            color: '#667085',
            fontSize: 12,
            lineHeight: 16,
            marginLeft: 2,
        },
    })
