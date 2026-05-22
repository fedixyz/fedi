import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMatrixPollEvent } from '@fedi/common/hooks/matrix'
import { MatrixEvent } from '@fedi/common/types'
import { RpcPollResultAnswer } from '@fedi/common/types/bindings'

import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { ConfirmDialog } from '../ConfirmDialog'
import { Column, Row } from '../Flex'
import { Icon, SvgIconName } from '../Icon'
import { Text } from '../Text'

type Props = {
    event: MatrixEvent<'m.poll'>
    isMe: boolean
}

type PollEventProps = {
    event: MatrixEvent<'m.poll'>
}

export const ChatPollEvent: React.FC<Props> = ({ event, isMe }) => {
    const { t } = useTranslation()
    const [isEndPollDialogOpen, setIsEndPollDialogOpen] = useState(false)
    const {
        areVotesVisible,
        handleEndPoll,
        handleRespondToPoll,
        handleSelectAnswer,
        hasPollEnded,
        hasVoted,
        isEndingPoll,
        isReadOnly,
        isVoteDisabled,
        isVoteLocked,
        isVoting,
        myId,
        selections,
    } = useMatrixPollEvent(event, t)

    const handleConfirmEndPoll = useCallback(async () => {
        const didEndPoll = await handleEndPoll()
        if (didEndPoll) setIsEndPollDialogOpen(false)
    }, [handleEndPoll])

    return (
        <>
            <Column gap="md" css={{ minWidth: 215 }}>
                <Row align="center" justify="between" gap="md">
                    <Text variant="small" weight="medium">
                        {t('words.poll')}
                    </Text>
                    {hasPollEnded ? (
                        <Text variant="small">{t('words.finished')}</Text>
                    ) : isMe ? (
                        <EndPollButton
                            type="button"
                            variant="tertiary"
                            size="xs"
                            disabled={isEndingPoll}
                            onClick={() => setIsEndPollDialogOpen(true)}>
                            {t('words.end').toUpperCase()}
                        </EndPollButton>
                    ) : isVoteLocked ? (
                        <Text variant="small">{t('words.voted')}</Text>
                    ) : null}
                </Row>
                <Text variant="caption" weight="medium">
                    {event.content.body}
                </Text>
                {areVotesVisible ? (
                    <PollVotes event={event} isMe={isMe} />
                ) : (
                    <>
                        <PollAnswers
                            event={event}
                            selections={selections}
                            hasVoted={hasVoted}
                            isVoteLocked={isVoteLocked}
                            isReadOnly={isReadOnly}
                            myId={myId}
                            onSelect={handleSelectAnswer}
                        />
                        {!isVoteLocked && (
                            <Button
                                size="sm"
                                variant={isMe ? 'secondary' : 'primary'}
                                disabled={isVoteDisabled}
                                loading={isVoting}
                                onClick={handleRespondToPoll}>
                                {t('words.vote')}
                            </Button>
                        )}
                    </>
                )}
            </Column>
            <ConfirmDialog
                open={isEndPollDialogOpen}
                title={t('words.end')}
                description={t('feature.chat.confirm-end-poll')}
                onConfirm={handleConfirmEndPoll}
                onClose={() => setIsEndPollDialogOpen(false)}
            />
        </>
    )
}

const EndPollButton = styled(Button, {
    color: 'inherit',
    fontSize: theme.fontSizes.small,
    height: 'auto',
    padding: 0,

    '&:hover, &:focus': {
        background: 'none',
        textDecoration: 'underline',
    },
})

const PollVotes: React.FC<Props> = ({ event, isMe }) => {
    const totalVotes = useMemo(() => {
        return Object.values(event.content.votes).reduce(
            (total, votes) => total + (votes?.length ?? 0),
            0,
        )
    }, [event.content.votes])

    const makePercentage = useCallback(
        (count: number): number => {
            if (totalVotes === 0) return 0
            return Math.round((count / totalVotes) * 100)
        },
        [totalVotes],
    )

    return (
        <Column gap="sm">
            {event.content.answers.map(answer => {
                const voteCount = event.content.votes[answer.id]?.length ?? 0
                const percentage = makePercentage(voteCount)

                return (
                    <Column
                        key={`poll-result-${event.id}-${answer.id}`}
                        gap="sm">
                        <Row align="center" gap="sm" justify="between">
                            <Text variant="small" weight="medium">
                                {answer.text}
                            </Text>
                            <Text variant="small">{percentage}%</Text>
                        </Row>
                        <ResultBar isMe={isMe}>
                            <ResultIndicator
                                isMe={isMe}
                                style={{ width: `${percentage}%` }}
                            />
                        </ResultBar>
                    </Column>
                )
            })}
        </Column>
    )
}

const PollAnswers: React.FC<
    PollEventProps & {
        selections: string[]
        hasVoted: boolean
        isVoteLocked: boolean
        isReadOnly: boolean
        myId: string
        onSelect(answer: RpcPollResultAnswer): void
    }
> = ({
    event,
    selections,
    hasVoted,
    isVoteLocked,
    isReadOnly,
    myId,
    onSelect,
}) => {
    const { t } = useTranslation()
    const isMultipleChoice = event.content.maxSelections > 1

    return (
        <Column gap="sm">
            {!isVoteLocked && (
                <Text variant="tiny">
                    {isReadOnly
                        ? t('feature.chat.only-admins-can-vote')
                        : isMultipleChoice
                          ? t('feature.chat.multiple-choice')
                          : t('feature.chat.choose-one-option')}
                </Text>
            )}
            {event.content.answers.map(answer => {
                const checked = hasVoted
                    ? (event.content.votes[answer.id]?.includes(myId) ?? false)
                    : selections.includes(answer.id)
                const checkedIcon: SvgIconName = isMultipleChoice
                    ? 'PollOptionMultipleChecked'
                    : 'PollOptionChecked'

                return (
                    <AnswerButton
                        key={`poll-answer-${event.id}-${answer.id}`}
                        type="button"
                        disabled={isReadOnly || isVoteLocked}
                        onClick={() => onSelect(answer)}
                        aria-pressed={checked}
                        aria-label={`poll-option-${answer.id}`}>
                        <Icon icon={checked ? checkedIcon : 'PollOption'} />
                        <AnswerText variant="small">{answer.text}</AnswerText>
                    </AnswerButton>
                )
            })}
        </Column>
    )
}

const AnswerButton = styled('button', {
    alignItems: 'center',
    color: 'inherit',
    cursor: 'pointer',
    display: 'flex',
    gap: theme.spacing.sm,
    minHeight: 24,
    textAlign: 'left',

    '&:disabled': {
        cursor: 'default',
        opacity: 0.6,
    },
})

const AnswerText = styled(Text, {
    flex: 1,
    minWidth: 0,
})

const ResultBar = styled('div', {
    borderRadius: 8,
    height: 4,
    overflow: 'hidden',
    position: 'relative',

    variants: {
        isMe: {
            true: {
                background: theme.colors.blue,
            },
            false: {
                background: theme.colors.lightGrey,
            },
        },
    },
})

const ResultIndicator = styled('div', {
    borderRadius: 8,
    height: 4,

    variants: {
        isMe: {
            true: {
                background: theme.colors.white,
            },
            false: {
                background: theme.colors.blue,
            },
        },
    },
})
