import { CheckBox, Theme, useTheme, Text, Button } from '@rneui/themed'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Keyboard, Pressable, StyleSheet, View } from 'react-native'

import { useMatrixPollEvent } from '@fedi/common/hooks/matrix'
import { setSelectedChatMessage } from '@fedi/common/redux'
import { RpcPollResultAnswer } from '@fedi/common/types/bindings'

import { useAppDispatch } from '../../../state/hooks'
import { MatrixEvent } from '../../../types'
import { Row, Column } from '../../ui/Flex'
import { OptionalGradient } from '../../ui/OptionalGradient'
import SvgImage from '../../ui/SvgImage'
import { bubbleGradient } from './ChatEvent'
import { useMessageActionState } from './useMessageActionState'

type Props = {
    event: MatrixEvent<'m.poll'>
}

const ChatPollEvent: React.FC<Props> = ({ event }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    const dispatch = useAppDispatch()
    const {
        areVotesVisible,
        handleEndPoll: submitEndPoll,
        handleRespondToPoll,
        handleSelectAnswer,
        hasPollEnded,
        hasVoted,
        isMe,
        isReadOnly,
        isVoteDisabled,
        isVoteLocked,
        isVoting,
        myId,
        selections,
    } = useMatrixPollEvent(event, t)

    const { hasAnyAction } = useMessageActionState({
        t,
        message: event,
    })

    const handleLongPress = useCallback(() => {
        Keyboard.dismiss()
        requestAnimationFrame(() => {
            dispatch(setSelectedChatMessage(event))
        })
    }, [dispatch, event])

    const handleEndPoll = useCallback(async () => {
        Alert.alert(
            t('feature.chat.end-poll-title'),
            t('feature.chat.confirm-end-poll'),
            [
                {
                    text: t('words.cancel'),
                    style: 'cancel',
                },
                {
                    text: t('feature.chat.end-poll-confirmation'),
                    onPress: submitEndPoll,
                },
            ],
        )
    }, [submitEndPoll, t])

    const style = styles(theme)
    const headerTextStyle = isMe
        ? style.outgoingHeaderText
        : style.incomingHeaderText

    return (
        <Pressable onLongPress={hasAnyAction ? handleLongPress : undefined}>
            <OptionalGradient
                gradient={isMe ? bubbleGradient : undefined}
                style={[
                    style.container,
                    isMe ? style.blueBubble : style.greyBubble,
                ]}>
                <Row align="center" justify="between">
                    <Text style={headerTextStyle} small medium>
                        {t('words.poll')}
                    </Text>

                    {hasPollEnded ? (
                        <Text small style={headerTextStyle}>
                            {t('words.finished')}
                        </Text>
                    ) : isMe ? (
                        <Pressable onPress={handleEndPoll}>
                            <Text style={headerTextStyle} small medium>
                                {t('words.end').toUpperCase()}
                            </Text>
                        </Pressable>
                    ) : isVoteLocked ? (
                        <Text small style={headerTextStyle}>
                            {t('words.voted')}
                        </Text>
                    ) : null}
                </Row>
                <Text style={isMe ? style.outgoingText : style.incomingText}>
                    {event.content.body}
                </Text>
                {areVotesVisible ? (
                    <PollVotes event={event} isMe={isMe} />
                ) : (
                    <>
                        <PollAnswers
                            event={event}
                            selections={selections}
                            myId={myId}
                            hasVoted={hasVoted}
                            isReadOnly={isReadOnly}
                            isVoteLocked={isVoteLocked}
                            onSelect={handleSelectAnswer}
                        />
                        {!isVoteLocked && (
                            <Button
                                size="sm"
                                day={isMe}
                                loading={isVoting}
                                style={
                                    isMe ? undefined : style.incomingVoteButton
                                }
                                disabledStyle={
                                    isMe
                                        ? { opacity: 0.8 }
                                        : {
                                              opacity: 1,
                                              backgroundColor:
                                                  theme.colors.darkGrey,
                                          }
                                }
                                title={
                                    <Text
                                        medium
                                        small
                                        style={[
                                            isMe
                                                ? style.outgoingVoteButtonTitle
                                                : style.incomingVoteButtonTitle,
                                            isVoteDisabled &&
                                                (isMe
                                                    ? style.outgoingVoteButtonTitleDisabled
                                                    : style.incomingVoteButtonTitleDisabled),
                                        ]}>
                                        {t('words.vote')}
                                    </Text>
                                }
                                disabled={isVoteDisabled}
                                onPress={handleRespondToPoll}
                            />
                        )}
                    </>
                )}
            </OptionalGradient>
        </Pressable>
    )
}

const PollVotes: React.FC<{
    event: MatrixEvent<'m.poll'>
    isMe: boolean
}> = ({ event, isMe }) => {
    const { theme } = useTheme()

    const votePercentage = useCallback(
        (count: number): `${number}%` => {
            let total = 0

            for (const votes of Object.values(event.content.votes)) {
                total += votes?.length ?? 0
            }

            return `${Math.round((count / total) * 100)}%`
        },
        [event.content.votes],
    )

    const style = styles(theme)
    const textStyle = isMe ? style.outgoingText : style.incomingText

    return (
        <Column gap="sm">
            {Object.entries(event.content.votes).map(([id, votes]) => {
                const answer = event.content.answers.find(
                    ans => ans.id === id,
                ) as RpcPollResultAnswer
                const percentage = votePercentage(votes?.length ?? 0)

                return (
                    <Column key={`vote-${id}-${answer.text}`} gap="sm">
                        <Row align="center" justify="between" gap="sm">
                            <Text medium small style={textStyle}>
                                {answer.text}
                            </Text>
                            <Text small style={textStyle}>
                                {percentage}
                            </Text>
                        </Row>
                        <Row
                            align="center"
                            gap="sm"
                            style={[
                                style.voteResultBar,
                                isMe
                                    ? style.outgoingResultBar
                                    : style.incomingResultBar,
                            ]}>
                            <View
                                style={[
                                    style.voteResultIndication,
                                    {
                                        width: percentage,
                                    },
                                    isMe
                                        ? style.outgoingResultIndication
                                        : style.incomingResultIndication,
                                ]}
                            />
                        </Row>
                    </Column>
                )
            })}
        </Column>
    )
}

const PollAnswers: React.FC<{
    event: MatrixEvent<'m.poll'>
    selections: string[]
    hasVoted: boolean
    isReadOnly: boolean
    isVoteLocked: boolean
    myId: string
    onSelect(answer: RpcPollResultAnswer): void
}> = ({
    event,
    selections,
    hasVoted,
    isReadOnly,
    isVoteLocked,
    myId,
    onSelect,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)

    const isMe = event.sender === myId
    const textStyle = isMe ? style.outgoingText : style.incomingText
    const radioColor = isMe ? theme.colors.white : theme.colors.primary

    return (
        <Column gap="sm">
            {!isVoteLocked && (
                <Text tiny style={textStyle}>
                    {isReadOnly
                        ? t('feature.chat.only-admins-can-vote')
                        : event.content.maxSelections === 1
                          ? t('feature.chat.choose-one-option')
                          : t('feature.chat.multiple-choice')}
                </Text>
            )}
            {event.content.answers.map(answer => (
                <CheckBox
                    key={`poll-ans-${event.id}-${answer.id}`}
                    checked={
                        hasVoted
                            ? (event.content.votes[answer.id]?.includes(myId) ??
                              false)
                            : selections.includes(answer.id)
                    }
                    disabled={isReadOnly || isVoteLocked}
                    title={
                        <Text style={textStyle} small>
                            {answer.text}
                        </Text>
                    }
                    disabledStyle={{ opacity: 0.5 }}
                    onPress={() => onSelect(answer)}
                    checkedIcon={
                        <SvgImage
                            name={
                                event.content.maxSelections === 1
                                    ? 'PollOptionChecked'
                                    : 'PollOptionMultipleChecked'
                            }
                            color={radioColor}
                        />
                    }
                    uncheckedIcon={
                        <SvgImage name="PollOption" color={radioColor} />
                    }
                    style={style.answer}
                    containerStyle={style.answerContainer}
                    wrapperStyle={style.answerWrapper}
                />
            ))}
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            display: 'flex',
            padding: 10,
            maxWidth: theme.sizes.maxMessageWidth,
            minWidth: 215,
            gap: theme.spacing.md,
        },
        answerContainer: {
            backgroundColor: 'transparent',
            gap: theme.spacing.sm,
            padding: 0,
            margin: 0,
            // Checkboxes explicitly have marginLeft and marginRight set
            // so we need to override them here
            marginLeft: 0,
            marginRight: 0,
        },
        answerWrapper: {
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        answer: {
            alignItems: 'center',
        },
        radioText: {
            textAlign: 'left',
        },
        greyBubble: {
            backgroundColor: theme.colors.extraLightGrey,
        },
        blueBubble: {
            backgroundColor: theme.colors.blue,
        },
        voteResultBar: {
            backgroundColor: theme.colors.blue,
            borderRadius: 8,
            height: 4,
            position: 'relative',
        },
        voteResultIndication: {
            position: 'absolute',
            backgroundColor: theme.colors.white,
            height: 4,
            borderRadius: 8,
        },
        incomingText: { color: theme.colors.primary },
        outgoingText: { color: theme.colors.secondary },
        outgoingHeaderText: { color: theme.colors.blue100 },
        incomingHeaderText: { color: theme.colors.darkGrey },
        outgoingResultIndication: { backgroundColor: theme.colors.white },
        incomingResultIndication: { backgroundColor: theme.colors.blue },
        outgoingResultBar: { backgroundColor: theme.colors.blue },
        incomingResultBar: { backgroundColor: theme.colors.lightGrey },
        outgoingVoteButtonTitle: { color: theme.colors.primary },
        incomingVoteButtonTitle: { color: theme.colors.white },
        outgoingVoteButtonTitleDisabled: { color: theme.colors.darkGrey },
        incomingVoteButtonTitleDisabled: { color: theme.colors.lightGrey },
        incomingVoteButton: { backgroundColor: theme.colors.night },
    })

export default ChatPollEvent
