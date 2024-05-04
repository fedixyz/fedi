import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { ReactNode } from 'react'
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

type OutgoingPaymentActionsProps = {
    message: ChatMessage
}

/** @deprecated XMPP legacy code */
const OutgoingPaymentActions: React.FC<OutgoingPaymentActionsProps> = ({
    message,
}: OutgoingPaymentActionsProps) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { payment } = message
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

    const renderPaymentStatus = () => {
        if (!payment) return null

        let paymentStatus: ReactNode | null = (
            <View style={styles(theme).statusContainer}>
                <Text medium caption style={styles(theme).statusText}>
                    {t('words.pending')}
                </Text>
            </View>
        )

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
                paymentStatus = null
                break
            case ChatPaymentStatus.accepted:
                paymentStatus = (
                    <Button
                        size="sm"
                        color={theme.colors.secondary}
                        onPress={cancelPayment}
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
            // Redemption in progess
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

type IncomingPullPaymentProps = {
    message: ChatMessage
    outgoingPayment?: ChatPayment
    text: string
}

/** @deprecated XMPP legacy code */
const IncomingPullPayment: React.FC<IncomingPullPaymentProps> = ({
    message,
    text,
}: IncomingPullPaymentProps) => {
    const { theme } = useTheme()

    return (
        <View style={styles(theme).container}>
            <Text caption medium style={styles(theme).messageText}>
                {text}
            </Text>
            <OutgoingPaymentActions message={message} />
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

export default IncomingPullPayment
