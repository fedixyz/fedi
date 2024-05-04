import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { selectActiveFederationId, updateChatPayment } from '@fedi/common/redux'
import { ChatMessage, ChatPayment, ChatPaymentStatus } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

const log = makeLog('IncomingPushPayment')

type IncomingPushPaymentProps = {
    message: ChatMessage
    incomingPayment?: ChatPayment
    text: string
}

const IncomingPushPayment: React.FC<IncomingPushPaymentProps> = ({
    message,
    text,
}: IncomingPushPaymentProps) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const [processingRedemption, setProcessingRedemption] =
        useState<boolean>(false)
    const { payment } = message

    // Check for valid ecash if found in incoming message
    useEffect(() => {
        if (!payment?.token) return

        const dispatchPaymentUpdate = async () => {
            try {
                setProcessingRedemption(true)
                await dispatch(
                    updateChatPayment({
                        fedimint,
                        federationId: activeFederationId as string,
                        messageId: message.id,
                        action: 'receive',
                    }),
                ).unwrap()
            } catch (error) {
                log.error('dispatchPaymentUpdate', error)
            }
            setProcessingRedemption(false)
        }

        // Delay attempt to redeem payment by 250ms to allow for payments that
        // have been canceled to come through.
        const timeout = setTimeout(() => dispatchPaymentUpdate(), 250)
        return () => clearTimeout(timeout)
    }, [activeFederationId, dispatch, message.id, payment?.token])

    const renderPaymentStatus = () => {
        if (
            processingRedemption === false &&
            payment?.status === ChatPaymentStatus.paid
        ) {
            return (
                <View style={styles(theme).statusContainer}>
                    <SvgImage
                        name="Check"
                        size={SvgImageSize.xs}
                        color={theme.colors.secondary}
                    />
                    <Text medium caption style={styles(theme).statusText}>
                        {t('words.paid')}
                    </Text>
                </View>
            )
        } else if (payment?.status === ChatPaymentStatus.canceled) {
            return (
                <View style={styles(theme).statusContainer}>
                    <Text medium caption style={styles(theme).statusText}>
                        {t('words.canceled')}
                    </Text>
                </View>
            )
        } else {
            return (
                <View style={styles(theme).statusContainer}>
                    <Text medium caption style={styles(theme).statusText}>
                        {t('words.pending')}
                    </Text>
                </View>
            )
        }
    }

    return (
        <View style={styles(theme).container}>
            <Text caption medium style={styles(theme).messageText}>
                {text}
            </Text>
            <View style={styles(theme).actionsContainer}>
                {renderPaymentStatus()}
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

export default IncomingPushPayment
