import Clipboard from '@react-native-clipboard/clipboard'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet } from 'react-native'

import { useFederationInviteCode } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { MatrixEvent, MatrixFederationInviteEvent } from '@fedi/common/types'

import { fedimint } from '../../../bridge'
import Flex from '../../ui/Flex'
import { OptionalGradient } from '../../ui/OptionalGradient'
import FederationCompactTile from '../federations/FederationCompactTile'
import { bubbleGradient } from './ChatEvent'
import ChatTextEvent from './ChatTextEvent'
import JoinFederationOverlay from './JoinFederationOverlay'

type Props = {
    event: MatrixFederationInviteEvent
}

const ChatFederationInviteEvent: React.FC<Props> = ({ event }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const [isShowing, setIsShowing] = useState(false)

    const inviteCode = event.content.body

    const { previewResult, isChecking, handleJoin, isError, isJoining } =
        useFederationInviteCode(fedimint, inviteCode)

    const toast = useToast()

    const handleCopy = () => {
        Clipboard.setString(inviteCode)
        toast.show({
            content: t('phrases.copied-to-clipboard'),
            status: 'success',
        })
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

    if (isError) {
        // Fallback to normal text event if we can't load the federation preview.
        // this will happen if the invite code is invalid
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

    return (
        <>
            <OptionalGradient
                gradient={bubbleGradient}
                style={[style.blueBubble]}>
                {previewResult ? (
                    <Flex gap="lg">
                        <Text
                            small
                            numberOfLines={2}
                            color={theme.colors.secondary}>
                            <Text bold small color={theme.colors.secondary}>
                                {t('feature.federations.federation-invite')}:
                            </Text>{' '}
                            {event.content.body}
                        </Text>
                        <FederationCompactTile
                            federation={previewResult.preview}
                            isLoading={isChecking}
                        />
                        <Flex gap="xs">
                            {previewResult.isMember && (
                                <Text small color={theme.colors.lightGrey}>
                                    {t('phrases.you-are-a-member', {
                                        federationName:
                                            previewResult.preview.name,
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
                ) : isChecking ? (
                    <ActivityIndicator />
                ) : null}
            </OptionalGradient>
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
        buttonContainer: {
            flex: 1,
            maxWidth: '50%',
        },
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
        blueBubble: {
            backgroundColor: theme.colors.blue,
            padding: 12,
        },
        bubbleInner: {},
    })

export default ChatFederationInviteEvent
