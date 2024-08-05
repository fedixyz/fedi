import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { selectActiveFederationId, updateChatPayment } from '@fedi/common/redux'
import { ChatMessage, ChatPayment, ChatPaymentStatus } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

const log = makeLog('IncomingPaymentActions')

type IncomingPaymentActionsProps = {
    message: ChatMessage
    onCancel: () => void
}

/** @deprecated XMPP legacy code */
const IncomingPaymentActions: React.FC<IncomingPaymentActionsProps> = ({
    message,
    onCancel,
}: IncomingPaymentActionsProps) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const [processingRedemption, setProcessingRedemption] =
        useState<boolean>(false)
    const { payment } = message

    // Check for valid ecash if found in incoming message
    useEffect(() => {
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
        // HACK: we just need to give the Rust bridge a split second
        // to resolve some DB lock to avoid a panic so wait 250ms here
        let timeout: ReturnType<typeof setTimeout> | undefined
        if (payment?.token) {
            timeout = setTimeout(() => dispatchPaymentUpdate(), 250)
        }
        return () => {
            clearTimeout(timeout)
        }
    }, [activeFederationId, dispatch, message.id, payment?.token])

    const renderPaymentStatus = () => {
        let paymentStatus = (
            <View style={styles(theme).statusContainer}>
                <Text medium caption style={styles(theme).statusText}>
                    {t('words.pending')}
                </Text>
            </View>
        )
        if (processingRedemption || !payment) return paymentStatus

        switch (payment.status) {
            case ChatPaymentStatus.paid:
                paymentStatus = (
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
                break
            case ChatPaymentStatus.rejected:
                paymentStatus = (
                    <View style={styles(theme).statusContainer}>
                        <Text medium caption style={styles(theme).statusText}>
                            {t('words.rejected')}
                        </Text>
                    </View>
                )
                break
            case ChatPaymentStatus.canceled:
                paymentStatus = (
                    <View style={styles(theme).statusContainer}>
                        <Text medium caption style={styles(theme).statusText}>
                            {t('words.canceled')}
                        </Text>
                    </View>
                )
                break
            case ChatPaymentStatus.requested:
                paymentStatus = (
                    <Button
                        size="sm"
                        color={theme.colors.secondary}
                        onPress={onCancel}
                        title={
                            <Text
                                medium
                                caption
                                numberOfLines={1}
                                adjustsFontSizeToFit>
                                {t('words.cancel')}
                            </Text>
                        }
                    />
                )
                break
            // Redemption in progess & status = accepted
            default:
                break
        }
        return paymentStatus
    }

    return (
        <View style={styles(theme).actionsContainer}>
            {renderPaymentStatus()}
        </View>
    )
}

type OutgoingPullPaymentProps = {
    message: ChatMessage
    incomingPayment?: ChatPayment
    text: string
}

/** @deprecated XMPP legacy code */
const OutgoingPullPayment: React.FC<OutgoingPullPaymentProps> = ({
    message,
    text,
}: OutgoingPullPaymentProps) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const toast = useToast()

    const cancelPayment = async () => {
        try {
            if (!activeFederationId) throw new Error()
            await dispatch(
                updateChatPayment({
                    fedimint,
                    federationId: activeFederationId,
                    messageId: message.id,
                    action: 'cancel',
                }),
            ).unwrap()
        } catch (error) {
            log.error('cancelPayment', error)
            toast.error(t, error)
        }
    }

    return (
        <View style={styles(theme).container}>
            <Text caption medium style={styles(theme).messageText}>
                {text}
            </Text>
            <IncomingPaymentActions
                message={message}
                onCancel={cancelPayment}
            />
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
        messageText: {
            color: theme.colors.secondary,
            paddingBottom: theme.spacing.sm,
        },
    })

export default OutgoingPullPayment
