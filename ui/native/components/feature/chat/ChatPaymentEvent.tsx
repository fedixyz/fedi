import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useMatrixPaymentEvent } from '@fedi/common/hooks/matrix'
import { useToast } from '@fedi/common/hooks/toast'
import { MSats, MatrixPaymentEvent } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { fedimint } from '../../../bridge'
import { NavigationHook } from '../../../types/navigation'
import HoloLoader from '../../ui/HoloLoader'
import { OptionalGradient } from '../../ui/OptionalGradient'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { bubbleGradient } from './ChatEvent'
import ReceiveForeignEcashOverlay from './ReceiveForeignEcashOverlay'

type Props = {
    event: MatrixPaymentEvent
}

const ChatPaymentEvent: React.FC<Props> = ({ event }: Props) => {
    const { t } = useTranslation()
    const toast = useToast()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()

    const {
        messageText,
        statusIcon,
        statusText,
        buttons,
        isHandlingForeignEcash,
        setIsHandlingForeignEcash,
        handleRejectRequest,
    } = useMatrixPaymentEvent({
        event,
        fedimint,
        t,
        onError: (err: unknown) => toast.error(t, err),
        onPayWithForeignEcash: () => {
            if (event.content?.amount && event.roomId) {
                navigation.navigate('ConfirmSendChatPayment', {
                    amount: amountUtils.msatToSat(
                        event.content.amount as MSats,
                    ),
                    roomId: event.roomId,
                })
            }
        },
    })

    const style = styles(theme)

    let extra: React.ReactNode = null
    if (statusText || statusIcon || buttons.length > 0) {
        const iconProps = {
            size: SvgImageSize.xs,
            color: theme.colors.secondary,
        }
        const icon =
            statusIcon === 'x' ? (
                <SvgImage {...iconProps} name={'Close'} />
            ) : statusIcon === 'reject' ? (
                <SvgImage {...iconProps} name={'BrokenHeart'} />
            ) : statusIcon === 'check' ? (
                <SvgImage {...iconProps} name={'Check'} />
            ) : statusIcon === 'error' ? (
                <SvgImage {...iconProps} name={'Error'} />
            ) : statusIcon === 'loading' ? (
                <HoloLoader size={4} />
            ) : null
        extra = (
            <>
                {statusText && (
                    <View style={style.paymentResult}>
                        {icon}
                        <Text style={style.statusText}>{statusText}</Text>
                    </View>
                )}
                {buttons.length > 0 && (
                    <View style={style.paymentButtons}>
                        {buttons.map(button => (
                            <Button
                                key={button.label}
                                color={theme.colors.secondary}
                                size="sm"
                                onPress={button.handler}
                                loading={button.loading}
                                disabled={button.disabled}
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
                    </View>
                )}
            </>
        )
    }

    return (
        <OptionalGradient
            gradient={bubbleGradient}
            style={[style.bubbleInner, style.orangeBubble]}>
            <Text style={style.messageText}>{messageText}</Text>
            {extra || null}
            {isHandlingForeignEcash && (
                <ReceiveForeignEcashOverlay
                    paymentEvent={event}
                    show={isHandlingForeignEcash}
                    onDismiss={() => setIsHandlingForeignEcash(false)}
                    onRejected={() => {
                        setIsHandlingForeignEcash(false)
                        handleRejectRequest()
                    }}
                />
            )}
        </OptionalGradient>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'flex-start',
        },
        buttonContainer: {
            flex: 1,
            maxWidth: '50%',
        },
        buttonText: {
            paddingHorizontal: theme.spacing.lg,
        },
        paymentResult: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: theme.spacing.sm,
        },
        paymentButtons: {
            flexDirection: 'row',
            justifyContent: 'flex-start',
            gap: 12,
            width: '100%',
            marginTop: theme.spacing.sm,
        },
        statusText: {
            color: theme.colors.secondary,
            marginLeft: theme.spacing.sm,
        },
        messageText: {
            color: theme.colors.secondary,
        },
        orangeBubble: {
            backgroundColor: theme.colors.orange,
        },
        bubbleInner: {
            padding: 10,
        },
    })

export default ChatPaymentEvent
