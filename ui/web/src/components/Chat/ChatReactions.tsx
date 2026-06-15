import React from 'react'

import { MatrixReactionChip } from '@fedi/common/utils/matrix'

import { styled, theme } from '../../styles'
import { Icon } from '../Icon'

type Props = {
    isMe: boolean
    reactions: MatrixReactionChip[]
    onAddReaction?: () => void
    onReactionPress?: (reaction: MatrixReactionChip) => void
}

export const ChatReactions: React.FC<Props> = ({
    isMe,
    reactions,
    onAddReaction,
    onReactionPress,
}) => {
    if (!reactions.length) return null

    return (
        <Reactions aria-label="message reactions" isMe={isMe}>
            {reactions.map(reaction => (
                <ReactionButton
                    key={reaction.key}
                    aria-label={`${reaction.key} reaction${
                        reaction.count > 1 ? `, ${reaction.count}` : ''
                    }${reaction.reactedByMe ? ', reacted by you' : ''}`}
                    reactedByMe={reaction.reactedByMe}
                    type="button"
                    onClick={() => onReactionPress?.(reaction)}>
                    <Emoji>{reaction.key}</Emoji>
                    {reaction.count > 1 && <Count>{reaction.count}</Count>}
                </ReactionButton>
            ))}
            {onAddReaction && (
                <ReactionButton
                    aria-label="add reaction"
                    type="button"
                    onClick={onAddReaction}>
                    <Icon icon="Plus" size={12} />
                </ReactionButton>
            )}
        </Reactions>
    )
}

const Reactions = styled('div', {
    display: 'flex',
    flexWrap: 'wrap',
    marginTop: -4,
    maxWidth: '90%',
    position: 'relative',
    zIndex: 1,

    variants: {
        isMe: {
            true: {
                alignSelf: 'flex-end',
                justifyContent: 'flex-end',
            },
            false: {
                alignSelf: 'flex-start',
                justifyContent: 'flex-start',
            },
        },
    },
})

const ReactionButton = styled('button', {
    appearance: 'none',
    alignItems: 'center',
    background: theme.colors.extraLightGrey,
    border: `1px solid ${theme.colors.white}`,
    borderRadius: 16,
    color: theme.colors.darkGrey,
    cursor: 'pointer',
    display: 'flex',
    height: 22,
    justifyContent: 'center',
    minWidth: 26,
    padding: '1px 8px',

    '&:hover, &:focus-visible': {
        background: theme.colors.lightGrey,
        outline: 'none',
    },

    variants: {
        reactedByMe: {
            true: {
                background: '#E6F1FE',
                borderColor: theme.colors.blue,

                '&:hover, &:focus-visible': {
                    background: theme.colors.blue100,
                },
            },
            false: {},
        },
    },
})

const Emoji = styled('span', {
    color: theme.colors.darkGrey,
    fontSize: 14,
    lineHeight: '20px',
})

const Count = styled('span', {
    color: theme.colors.darkGrey,
    fontSize: 12,
    lineHeight: '16px',
    marginLeft: 2,
})
