import React, { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { selectMatrixAuth, selectMatrixRoomMemberMap } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import {
    MatrixReactionChip,
    MatrixReactionUser,
    makeMatrixReactionUsers,
} from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { Text } from '../Text'
import { ChatAvatar } from './ChatAvatar'
import { ChatBottomDrawer } from './ChatBottomDrawer'

type Props = {
    event: MatrixEvent
    reactions: MatrixReactionChip[]
    selectedReactionKey: string | null
    onSelectReaction(reactionKey: string): void
    onToggleReaction(reactionKey: string): void
    onDismiss(): void
}

export const ChatReactionDetailsDrawer: React.FC<Props> = ({
    event,
    reactions,
    selectedReactionKey,
    onSelectReaction,
    onToggleReaction,
    onDismiss,
}) => {
    const { t } = useTranslation()
    const memberMap = useAppSelector(s =>
        event.roomId ? selectMatrixRoomMemberMap(s, event.roomId) : {},
    )
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const lastReactionsRef = useRef<MatrixReactionChip[]>([])

    useEffect(() => {
        if (reactions.length) {
            lastReactionsRef.current = reactions
        }
    }, [reactions])

    const displayReactions = reactions.length
        ? reactions
        : lastReactionsRef.current
    const selectedReaction =
        displayReactions.find(
            reaction => reaction.key === selectedReactionKey,
        ) ||
        displayReactions[0] ||
        null

    const users = useMemo(
        () =>
            makeMatrixReactionUsers({
                reaction: selectedReaction,
                memberMap,
                myId: matrixAuth?.userId,
            }),
        [memberMap, matrixAuth?.userId, selectedReaction],
    )

    const renderUser = (user: MatrixReactionUser) => {
        const isMe = user.id === matrixAuth?.userId

        return (
            <UserButton
                key={user.id}
                aria-label={
                    isMe
                        ? `${selectedReaction?.key} reaction by you, tap to remove`
                        : `${selectedReaction?.key} reaction by ${user.displayName}`
                }
                disabled={!isMe || !selectedReaction}
                type="button"
                onClick={() =>
                    selectedReaction && onToggleReaction(selectedReaction.key)
                }>
                <ChatAvatar user={user} size="sm" />
                <UserText>
                    <UserName variant="caption" weight="bold" ellipsize>
                        {isMe
                            ? t('feature.chat.reaction-you')
                            : user.displayName}
                    </UserName>
                    {isMe && (
                        <RemoveText variant="small">
                            {t('feature.chat.reaction-tap-to-remove')}
                        </RemoveText>
                    )}
                </UserText>
            </UserButton>
        )
    }

    return (
        <ChatBottomDrawer
            open={!!selectedReactionKey}
            title={t('words.react')}
            onOpenChange={open => {
                if (!open) onDismiss()
            }}>
            <Container>
                <Tabs>
                    {displayReactions.map(reaction => {
                        const selected = reaction.key === selectedReaction?.key
                        return (
                            <Tab
                                key={reaction.key}
                                aria-label={`${reaction.key} reactions, ${reaction.count}`}
                                selected={selected}
                                type="button"
                                onClick={() => onSelectReaction(reaction.key)}>
                                <TabEmoji>{reaction.key}</TabEmoji>
                                <TabCount>{reaction.count}</TabCount>
                            </Tab>
                        )
                    })}
                </Tabs>
                <UserList>{users.map(renderUser)}</UserList>
            </Container>
        </ChatBottomDrawer>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: 12,
    paddingTop: 8,
})

const Tabs = styled('div', {
    borderBottom: `1px solid ${theme.colors.extraLightGrey}`,
    display: 'flex',
    overflowX: 'auto',
    padding: '0 8px',
})

const Tab = styled('button', {
    appearance: 'none',
    alignItems: 'center',
    background: 'transparent',
    border: 0,
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    display: 'flex',
    height: 48,
    justifyContent: 'center',
    marginRight: 12,
    minWidth: 48,
    padding: '0 8px',

    '&:focus-visible': {
        outline: 'none',
        borderBottomColor: theme.colors.primary,
    },

    variants: {
        selected: {
            true: {
                borderBottomColor: theme.colors.primary,
            },
            false: {},
        },
    },
})

const TabEmoji = styled('span', {
    fontSize: 20,
    lineHeight: '28px',
})

const TabCount = styled('span', {
    color: theme.colors.primary,
    fontSize: 14,
    lineHeight: '20px',
    marginLeft: 6,
})

const UserList = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 12,
})

const UserButton = styled('button', {
    appearance: 'none',
    alignItems: 'center',
    background: 'transparent',
    border: 0,
    display: 'flex',
    minHeight: 64,
    padding: '8px 12px',
    textAlign: 'left',
    width: '100%',

    '&:not(:disabled)': {
        cursor: 'pointer',
    },

    '&:not(:disabled):hover, &:not(:disabled):focus-visible': {
        background: theme.colors.primary05,
        outline: 'none',
    },
})

const UserText = styled('div', {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    marginLeft: 12,
    minWidth: 0,
})

const UserName = styled(Text, {
    color: theme.colors.primary,
})

const RemoveText = styled(Text, {
    color: theme.colors.blue,
})
