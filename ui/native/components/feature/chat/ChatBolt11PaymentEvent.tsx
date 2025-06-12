import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useMatrixPaymentEvent } from '@fedi/common/hooks/matrix'
import { useToast } from '@fedi/common/hooks/toast'
import { MatrixPaymentEvent } from '@fedi/common/types'

import { fedimint } from '../../../bridge'
import { NavigationHook } from '../../../types/navigation'
import {
    PaymentEventButtons,
    PaymentEventContainer,
    PaymentEventStatus,
} from './ChatPaymentEvent'

type Props = {
    event: MatrixPaymentEvent
}

const ChatBolt11PaymentEvent: React.FC<Props> = ({ event }: Props) => {
    const { t } = useTranslation()
    const toast = useToast()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()

    const { messageText, statusIcon, statusText, buttons } =
        useMatrixPaymentEvent({
            event,
            fedimint,
            t,
            onError: (err: unknown) => toast.error(t, err),
            onViewBolt11: (bolt11: string) => {
                navigation.navigate('BitcoinRequest', {
                    uri: `lightning:${bolt11}`,
                    lockRequestType: true,
                })
            },
        })

    const style = styles(theme)

    let extra: React.ReactNode = null
    if (statusText || statusIcon || buttons.length > 0) {
        extra = (
            <>
                {statusText && (
                    <PaymentEventStatus
                        statusIcon={statusIcon}
                        statusText={statusText}
                    />
                )}
                {buttons.length > 0 && (
                    <PaymentEventButtons buttons={buttons} />
                )}
            </>
        )
    }

    return (
        <PaymentEventContainer>
            <Text style={style.messageText}>{messageText}</Text>
            {extra || null}
        </PaymentEventContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        messageText: {
            color: theme.colors.secondary,
        },
    })

export default ChatBolt11PaymentEvent
