import Clipboard from '@react-native-clipboard/clipboard'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useCommunityInviteCode } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { selectMatrixAuth, setSelectedChatMessage } from '@fedi/common/redux'
import { MatrixEvent, MatrixCommunityInviteEvent } from '@fedi/common/types'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import Flex from '../../ui/Flex'
import FederationCompactTile from '../federations/FederationCompactTile'
import ChatEventWrapper from './ChatEventWrapper'
import ChatTextEvent from './ChatTextEvent'
import JoinCommunityOverlay from './JoinCommunityOverlay'

type Props = {
    event: MatrixCommunityInviteEvent
}

const ChatCommunityInviteEvent: React.FC<Props> = ({ event }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()
    const dispatch = useAppDispatch()
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const isMe = event.sender === matrixAuth?.userId

    const [isShowing, setIsShowing] = useState(false)

    const inviteCode = event.content.body

    const {
        joined,
        isJoining,
        isFetching,
        preview: communityPreview,
        handleJoin,
    } = useCommunityInviteCode(fedimint, inviteCode)

    const eventAsText = {
        ...event,
        content: {
            msgtype: 'm.text' as const,
            body: event.content.body,
            formatted: null,
        },
    } satisfies MatrixEvent<'m.text'>

    const handleCopy = () => {
        Clipboard.setString(inviteCode)
        toast.show({
            content: t('phrases.copied-to-clipboard'),
            status: 'success',
        })
    }

    const handleLongPress = () => {
        dispatch(setSelectedChatMessage(event))
    }

    const style = styles(theme)

    const buttons = [
        {
            label: joined ? t('words.joined') : t('words.join'),
            disabled: joined,
            handler: () => setIsShowing(true),
        },
        {
            label: t('phrases.copy-invite-code'),
            handler: handleCopy,
        },
    ]

    if (!communityPreview) {
        return <ChatTextEvent event={eventAsText} />
    }

    const textColor = isMe ? theme.colors.secondary : theme.colors.primary

    return (
        <>
            <ChatEventWrapper event={event} handleLongPress={handleLongPress}>
                {communityPreview ? (
                    <Flex gap="lg">
                        <Text small numberOfLines={2} color={textColor}>
                            <Text bold small color={textColor}>
                                {t('feature.communities.community-invite')}:
                            </Text>{' '}
                            {event.content.body}
                        </Text>
                        <FederationCompactTile
                            federation={communityPreview}
                            isLoading={isFetching}
                            textColor={textColor}
                        />
                        <Flex gap="xs">
                            {joined && (
                                <Text small color={textColor}>
                                    {t('phrases.you-are-a-member', {
                                        federationName: communityPreview.name,
                                    })}
                                </Text>
                            )}
                            <Flex
                                row
                                justify="start"
                                gap="md"
                                fullWidth
                                style={style.inviteButtons}>
                                {buttons.map(button => (
                                    <Button
                                        key={button.label}
                                        disabled={button.disabled}
                                        color={theme.colors.secondary}
                                        size="sm"
                                        onPress={button.handler}
                                        title={
                                            <Text
                                                medium
                                                caption
                                                style={style.buttonText}>
                                                {button.label}
                                            </Text>
                                        }
                                    />
                                ))}
                            </Flex>
                        </Flex>
                    </Flex>
                ) : null}
            </ChatEventWrapper>
            <JoinCommunityOverlay
                preview={communityPreview}
                isJoining={isJoining}
                onJoin={async () => {
                    await handleJoin()
                    setIsShowing(false)
                }}
                show={isShowing}
                onDismiss={() => setIsShowing(false)}
            />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        buttonText: {
            paddingHorizontal: theme.spacing.lg,
        },
        paymentResult: {
            marginTop: theme.spacing.sm,
        },
        inviteButtons: {
            marginTop: theme.spacing.sm,
        },
        statusText: {
            color: theme.colors.secondary,
            marginLeft: theme.spacing.sm,
        },
        incomingText: {
            color: theme.colors.primary,
        },
        outgoingText: {
            color: theme.colors.secondary,
        },
    })

export default ChatCommunityInviteEvent
