import { Button, ButtonProps, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { selectActiveFederation, updateChatPayment } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { ChatMessage, ChatPaymentStatus } from '../../../types'
import SvgImage, { SvgImageName, SvgImageSize } from '../../ui/SvgImage'

const log = makeLog('OutgoingPushPayment')

type OutgoingPushPaymentProps = {
    message: ChatMessage
    text: string
}

/** @deprecated XMPP legacy code */
const OutgoingPushPayment: React.FC<OutgoingPushPaymentProps> = ({
    message,
    text,
}: OutgoingPushPaymentProps) => {
    const dispatch = useAppDispatch()
    const { theme } = useTheme()
    const { t } = useTranslation()
    const toast = useToast()
    const federationId = useAppSelector(selectActiveFederation)?.id
    const [isCanceling, setIsCanceling] = useState(false)

    let statusText: string | undefined
    let statusIcon: SvgImageName | undefined
    let action: Pick<ButtonProps, 'onPress' | 'title'> | undefined
    if (message.payment?.status === ChatPaymentStatus.paid) {
        statusText = t('words.paid')
        statusIcon = 'Check'
    } else if (message.payment?.status === ChatPaymentStatus.canceled) {
        statusText = t('words.canceled')
    } else {
        action = {
            title: t('words.cancel'),
            onPress: async () => {
                setIsCanceling(true)
                try {
                    if (!federationId) throw new Error()
                    await dispatch(
                        updateChatPayment({
                            fedimint,
                            federationId,
                            messageId: message.id,
                            action: 'cancel',
                        }),
                    ).unwrap()
                } catch (error) {
                    log.error('updateChatPayment', error)
                    toast.error(t, error)
                }
                setIsCanceling(false)
            },
        }
    }

    return (
        <View style={styles(theme).container}>
            <Text caption medium style={styles(theme).messageText}>
                {text}
            </Text>
            <View style={styles(theme).actionsContainer}>
                <View style={styles(theme).statusContainer}>
                    {statusIcon && (
                        <SvgImage
                            name={statusIcon}
                            size={SvgImageSize.xs}
                            color={theme.colors.secondary}
                        />
                    )}
                    {statusText && (
                        <Text medium caption style={styles(theme).statusText}>
                            {statusText}
                        </Text>
                    )}
                    {action && (
                        <Button
                            {...action}
                            size="sm"
                            color={theme.colors.secondary}
                            disabled={isCanceling}
                            title={
                                <Text
                                    medium
                                    caption
                                    numberOfLines={1}
                                    adjustsFontSizeToFit>
                                    {action.title}
                                </Text>
                            }
                        />
                    )}
                </View>
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'flex-start',
        },
        actionsContainer: {
            flexDirection: 'row',
            justifyContent: 'flex-start',
            width: '100%',
            paddingVertical: theme.spacing.xs,
        },
        statusContainer: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        statusText: {
            color: theme.colors.secondary,
            marginLeft: theme.spacing.xs,
        },
        buttonContainer: {
            flex: 1,
            maxWidth: '50%',
        },
        messageText: {
            color: theme.colors.secondary,
            paddingBottom: theme.spacing.sm,
        },
    })

export default OutgoingPushPayment
