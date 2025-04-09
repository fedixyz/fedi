import { useNavigation } from '@react-navigation/native'
import { CheckBox, Theme, useTheme, Text, Button } from '@rneui/themed'
import { Dispatch, SetStateAction, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { selectMatrixAuth, setSelectedChatMessage } from '@fedi/common/redux'
import { RpcPollResultAnswer } from '@fedi/common/types/bindings'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { MatrixEvent } from '../../../types'
import { OptionalGradient } from '../../ui/OptionalGradient'
import SvgImage from '../../ui/SvgImage'
import { bubbleGradient } from './ChatEvent'

type Props = {
    event: MatrixEvent<MatrixEventContentType<'m.poll'>>
}

const ChatPollEvent: React.FC<Props> = ({ event }) => {
    const [selections, setSelections] = useState<Array<RpcPollResultAnswer>>([])

    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const navigation = useNavigation()
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const myId = useMemo(() => matrixAuth?.userId ?? '', [matrixAuth])
    const isMe = useMemo(() => event.senderId === myId, [event.senderId, myId])

    const hasVoted = useMemo(() => {
        return Object.values(event.content.votes).some(vote =>
            vote.includes(myId),
        )
    }, [event.content.votes, myId])

    const hasPollEnded = useMemo(() => {
        if (!event.content.endTime) return false

        return Date.now() > event.content.endTime
    }, [event.content.endTime])

    const areVotesVisible = useMemo(() => {
        return (hasVoted && event.content.kind === 'disclosed') || hasPollEnded
    }, [hasVoted, event.content.kind, hasPollEnded])

    const handleLongPress = useCallback(() => {
        if (!isMe) return

        dispatch(setSelectedChatMessage(event))
    }, [dispatch, event, isMe])

    const handleRespondToPoll = useCallback(async () => {
        if (!event.eventId) return

        await fedimint.matrixRespondToPoll(
            event.roomId,
            event.eventId,
            selections.map(s => s.id),
        )
    }, [event.roomId, event.eventId, selections])

    const style = styles(theme)
    const headerTextStyle = isMe
        ? style.outgoingHeaderText
        : style.incomingHeaderText

    return (
        <Pressable onLongPress={handleLongPress}>
            <OptionalGradient
                gradient={isMe ? bubbleGradient : undefined}
                style={[
                    style.container,
                    isMe ? style.blueBubble : style.greyBubble,
                ]}>
                <View style={style.header}>
                    <Text style={headerTextStyle} small medium>
                        {t('words.poll')}
                    </Text>

                    {hasPollEnded ? (
                        <Text small style={headerTextStyle}>
                            {t('words.finished')}
                        </Text>
                    ) : isMe ? (
                        <Pressable
                            onPress={() =>
                                navigation.navigate('EditPoll', { event })
                            }>
                            <Text style={headerTextStyle} small medium>
                                {t('words.edit').toUpperCase()}
                            </Text>
                        </Pressable>
                    ) : hasVoted ? (
                        <Text small style={headerTextStyle}>
                            {t('words.voted')}
                        </Text>
                    ) : null}
                </View>
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
                            setSelections={setSelections}
                            hasVoted={hasVoted}
                            myId={myId}
                        />
                        {!hasVoted && (
                            <Button
                                size="sm"
                                day={isMe}
                                style={
                                    isMe ? undefined : style.incomingVoteButton
                                }
                                title={
                                    <Text
                                        medium
                                        small
                                        style={
                                            isMe
                                                ? style.outgoingVoteButtonTitle
                                                : style.incomingVoteButtonTitle
                                        }>
                                        {t('words.vote')}
                                    </Text>
                                }
                                disabled={selections.length === 0}
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
    event: MatrixEvent<MatrixEventContentType<'m.poll'>>
    isMe: boolean
}> = ({ event, isMe }) => {
    const { theme } = useTheme()

    const votePercentage = useCallback(
        (count: number): `${number}%` => {
            let total = 0

            for (const votes of Object.values(event.content.votes)) {
                total += votes.length
            }

            return `${Math.round((count / total) * 100)}%`
        },
        [event.content.votes],
    )

    const style = styles(theme)
    const textStyle = isMe ? style.outgoingText : style.incomingText

    return (
        <View style={style.pollVotes}>
            {Object.entries(event.content.votes).map(([id, votes]) => {
                const answer = event.content.answers.find(
                    ans => ans.id === id,
                ) as RpcPollResultAnswer
                const percentage = votePercentage(votes.length)

                return (
                    <View
                        key={`vote-${id}-${answer.text}`}
                        style={style.voteResultContainer}>
                        <View style={style.voteResultHeader}>
                            <Text medium small style={textStyle}>
                                {answer.text}
                            </Text>
                            <Text small style={textStyle}>
                                {percentage}
                            </Text>
                        </View>
                        <View
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
                        </View>
                    </View>
                )
            })}
        </View>
    )
}

const PollAnswers: React.FC<{
    event: MatrixEvent<MatrixEventContentType<'m.poll'>>
    selections: Array<RpcPollResultAnswer>
    setSelections: Dispatch<SetStateAction<Array<RpcPollResultAnswer>>>
    hasVoted: boolean
    myId: string
}> = ({ event, selections, setSelections, hasVoted, myId }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)

    const isMe = event.senderId === myId
    const textStyle = isMe ? style.outgoingText : style.incomingText
    const radioColor = isMe ? theme.colors.white : theme.colors.primary

    const handleSelectOption = useCallback(
        (answer: RpcPollResultAnswer) => {
            setSelections(prev => {
                if (event.content.maxSelections === 1) {
                    return [answer]
                }

                // For multiple choice polls, toggle the answer if checked
                if (prev.find(a => a.id === answer.id)) {
                    return prev.filter(a => a.id !== answer.id)
                }

                // Otherwise, add the answer
                return [...prev, answer]
            })
        },
        [event.content.maxSelections, setSelections],
    )

    return (
        <View style={style.answers}>
            {!hasVoted && (
                <Text tiny style={textStyle}>
                    {event.content.maxSelections === 1
                        ? t('feature.chat.choose-one-option')
                        : t('feature.chat.multiple-choice')}
                </Text>
            )}
            {event.content.answers.map(answer => (
                <CheckBox
                    key={`poll-ans-${event.id}-${answer.id}`}
                    checked={
                        hasVoted
                            ? event.content.votes[answer.id].includes(myId)
                            : selections.some(s => s.id === answer.id)
                    }
                    disabled={hasVoted}
                    title={
                        <Text style={textStyle} small>
                            {answer.text}
                        </Text>
                    }
                    onPress={() => handleSelectOption(answer)}
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
        </View>
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
        header: {
            justifyContent: 'space-between',
            flexDirection: 'row',
            alignItems: 'center',
        },
        answers: {
            gap: theme.spacing.sm,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
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
        pollVotes: {
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.sm,
        },
        voteResultContainer: {
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.xs,
        },
        voteResultHeader: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.sm,
        },
        voteResultBar: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
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
        incomingVoteButton: { backgroundColor: theme.colors.night },
    })

export default ChatPollEvent
