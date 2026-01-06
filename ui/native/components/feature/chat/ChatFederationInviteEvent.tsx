import Clipboard from '@react-native-clipboard/clipboard'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useFederationInviteCode } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { selectMatrixAuth, setSelectedChatMessage } from '@fedi/common/redux'
import { MatrixEvent, MatrixFederationInviteEvent } from '@fedi/common/types'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { Row, Column } from '../../ui/Flex'
import FederationCompactTile from '../federations/FederationCompactTile'
import ChatEventWrapper from './ChatEventWrapper'
import ChatTextEvent from './ChatTextEvent'
import JoinFederationOverlay from './JoinFederationOverlay'

type Props = {
    event: MatrixFederationInviteEvent
}

const ChatFederationInviteEvent: React.FC<Props> = ({ event }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const isMe = event.sender === matrixAuth?.userId

    const [isShowing, setIsShowing] = useState(false)

    const inviteCode = event.content.body

    const { previewResult, isChecking, handleJoin, isError, isJoining } =
        useFederationInviteCode(inviteCode)

    const toast = useToast()

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
            label: previewResult?.isMember
                ? t('words.joined')
                : t('words.join'),
            disabled: previewResult?.isMember,
            handler: () => setIsShowing(true),
        },
        {
            label: t('phrases.copy-invite-code'),
            handler: handleCopy,
        },
    ]

    const renderFallback = () => {
        const eventAsText = {
            ...event,
            content: {
                msgtype: 'm.text' as const,
                body: event.content.body,
                formatted: null,
            },
        } satisfies MatrixEvent<'m.text'>
        return <ChatTextEvent event={eventAsText} />
    }

    if (isError || isChecking) {
        // Fallback to normal text event if we are loading or fail to load the preview
        return renderFallback()
    }

    const textColor = isMe ? theme.colors.secondary : theme.colors.primary

    return (
        <>
            <ChatEventWrapper event={event} handleLongPress={handleLongPress}>
                {previewResult ? (
                    <Column gap="lg">
                        <Text small numberOfLines={2} color={textColor}>
                            <Text bold small color={textColor}>
                                {t('feature.federations.federation-invite')}:
                            </Text>{' '}
                            {event.content.body}
                        </Text>
                        <FederationCompactTile
                            federation={previewResult.preview}
                            isLoading={isChecking}
                            textColor={textColor}
                        />
                        <Column gap="xs">
                            {previewResult.isMember && (
                                <Text small color={textColor}>
                                    {t('phrases.you-are-a-member', {
                                        federationName:
                                            previewResult.preview.name,
                                    })}
                                </Text>
                            )}
                            <Row
                                wrap
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
                            </Row>
                        </Column>
                    </Column>
                ) : null}
            </ChatEventWrapper>
            <JoinFederationOverlay
                preview={previewResult?.preview}
                isJoining={isJoining}
                onJoin={() => handleJoin().then(() => setIsShowing(false))}
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

export default ChatFederationInviteEvent
