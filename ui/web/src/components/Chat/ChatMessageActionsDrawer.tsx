import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MATRIX_QUICK_REACTION_EMOJIS } from '@fedi/common/constants/matrix'
import { setChatReplyingToMessage } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import {
    canAddMatrixReaction,
    canReplyToMatrixEvent,
} from '@fedi/common/utils/matrix'

import { useAppDispatch } from '../../hooks'
import { styled, theme } from '../../styles'
import { CircularLoader } from '../CircularLoader'
import { Row } from '../Flex'
import { Icon } from '../Icon'
import { Text } from '../Text'
import { ChatBottomDrawer } from './ChatBottomDrawer'
import { MatrixReactionEmojiPicker } from './MatrixReactionEmojiPicker'
import { hasReactionActions } from './chatMessageActionUtils'
import { useMatrixReactionHandler } from './useMatrixReactionHandler'

interface Props {
    event: MatrixEvent
    open: boolean
    onOpenChange(open: boolean): void
}

export const ChatMessageActionsDrawer: React.FC<Props> = ({
    event,
    open,
    onOpenChange,
}) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const { handleReaction, messageReactionsEnabled, reactingEmoji } =
        useMatrixReactionHandler()
    const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)
    const canReply = canReplyToMatrixEvent(event)
    const canShowReactions = hasReactionActions(event, messageReactionsEnabled)
    const reactLabel = t('words.react')

    const handleReply = useCallback(() => {
        dispatch(
            setChatReplyingToMessage({
                roomId: event.roomId,
                event,
            }),
        )
        onOpenChange(false)
    }, [dispatch, event, onOpenChange])

    return (
        <ChatBottomDrawer
            open={open}
            title={t('words.actions')}
            onOpenChange={nextOpen => {
                if (!nextOpen) setIsEmojiPickerOpen(false)
                onOpenChange(nextOpen)
            }}
            overlayTestId="message-actions-backdrop">
            {isEmojiPickerOpen ? (
                <MatrixReactionEmojiPicker
                    event={event}
                    pendingReaction={reactingEmoji}
                    onSelect={reactionKey =>
                        handleReaction({
                            event,
                            reactionKey,
                            onSuccess: () => {
                                setIsEmojiPickerOpen(false)
                                onOpenChange(false)
                            },
                        })
                    }
                />
            ) : (
                <ActionList>
                    {canShowReactions && (
                        <QuickReactions>
                            <Text weight="bold">{reactLabel}</Text>
                            <Row gap="sm">
                                {MATRIX_QUICK_REACTION_EMOJIS.map(
                                    reactionKey => {
                                        const disabled =
                                            !!reactingEmoji ||
                                            !canAddMatrixReaction(
                                                event,
                                                reactionKey,
                                            )

                                        return (
                                            <QuickReactionButton
                                                key={reactionKey}
                                                aria-label={`${reactLabel} ${reactionKey}`}
                                                disabled={disabled}
                                                type="button"
                                                onClick={() =>
                                                    handleReaction({
                                                        event,
                                                        reactionKey,
                                                        onSuccess: () => {
                                                            setIsEmojiPickerOpen(
                                                                false,
                                                            )
                                                            onOpenChange(false)
                                                        },
                                                    })
                                                }>
                                                {reactingEmoji ===
                                                reactionKey ? (
                                                    <CircularLoader size="xs" />
                                                ) : (
                                                    <QuickReactionEmoji>
                                                        {reactionKey}
                                                    </QuickReactionEmoji>
                                                )}
                                            </QuickReactionButton>
                                        )
                                    },
                                )}
                                <QuickReactionButton
                                    aria-label="more reactions"
                                    disabled={!!reactingEmoji}
                                    type="button"
                                    onClick={() => setIsEmojiPickerOpen(true)}>
                                    <Icon icon="Plus" size={16} />
                                </QuickReactionButton>
                            </Row>
                        </QuickReactions>
                    )}
                    {canReply && (
                        <ActionButton onClick={handleReply}>
                            <Icon icon="ArrowCornerUpLeftDouble" />
                            <Text weight="bold">{t('words.reply')}</Text>
                        </ActionButton>
                    )}
                </ActionList>
            )}
        </ChatBottomDrawer>
    )
}

const ActionList = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
})

const QuickReactions = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '8px 4px 12px',
})

const QuickReactionButton = styled('button', {
    appearance: 'none',
    alignItems: 'center',
    background: 'transparent',
    border: 0,
    borderRadius: 8,
    color: theme.colors.primary,
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 32,
    padding: '4px 6px',

    '&:hover, &:focus-visible': {
        background: theme.colors.primary05,
        outline: 'none',
    },

    '&:disabled': {
        cursor: 'not-allowed',
        opacity: 0.4,
    },
})

const QuickReactionEmoji = styled('span', {
    fontSize: 24,
    lineHeight: '32px',
})

const ActionButton = styled('button', {
    appearance: 'none',
    border: 0,
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    minHeight: 44,
    padding: 8,
    borderRadius: 8,
    color: theme.colors.primary,
    textAlign: 'left',
    cursor: 'pointer',

    '&:hover, &:focus-visible': {
        background: theme.colors.primary05,
        outline: 'none',
    },

    '&:disabled': {
        cursor: 'not-allowed',
        opacity: 0.5,
    },
})
