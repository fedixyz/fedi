import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { ChatMessage, ChatPayment, ChatPaymentStatus } from '@fedi/common/types'

import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

type IncomingPushPaymentProps = {
    message: ChatMessage
    incomingPayment?: ChatPayment
    text: string
}

/** @deprecated XMPP legacy code */
const IncomingPushPayment: React.FC<IncomingPushPaymentProps> = ({
    message,
    text,
}: IncomingPushPaymentProps) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { payment } = message

    const renderPaymentStatus = () => {
        if (payment?.status === ChatPaymentStatus.paid) {
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
        } else {
            return (
                <View style={styles(theme).statusContainer}>
                    <Text medium caption style={styles(theme).statusText}>
                        {t('words.canceled')}
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
