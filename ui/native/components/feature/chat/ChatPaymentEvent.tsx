import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet } from 'react-native'

import { useMatrixPaymentEvent } from '@fedi/common/hooks/matrix'
import { useToast } from '@fedi/common/hooks/toast'
import { MSats, MatrixPaymentEvent } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { NavigationHook } from '../../../types/navigation'
import { Row, Column } from '../../ui/Flex'
import HoloLoader from '../../ui/HoloLoader'
import { OptionalGradient } from '../../ui/OptionalGradient'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { bubbleGradient } from './ChatEvent'
import ReceiveForeignEcashOverlay from './ReceiveForeignEcashOverlay'

type Props = {
    event: MatrixPaymentEvent
}
type PaymentEventButton = {
    label: string
    handler: () => void
    disabled?: boolean
    loading?: boolean
}

export const PaymentEventStatus = ({
    statusIcon = undefined,
    statusText,
}: {
    statusIcon: string | undefined
    statusText: string
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

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

    return (
        <Row align="center" style={style.paymentResult}>
            {icon}
            <Text style={style.statusText}>{statusText}</Text>
        </Row>
    )
}

export const PaymentEventButtons = ({
    buttons,
}: {
    buttons: PaymentEventButton[]
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Row justify="start" gap="md" fullWidth style={style.paymentButtons}>
            {buttons.map(button => (
                <Button
                    key={button.label}
                    color={theme.colors.secondary}
                    size="sm"
                    onPress={button.handler}
                    loading={button.loading}
                    disabled={button.disabled}
                    title={
                        <Text medium caption style={style.buttonText}>
                            {button.label}
                        </Text>
                    }
                />
            ))}
        </Row>
    )
}

export const PaymentEventContainer = ({
    children,
}: {
    children: React.ReactNode
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <OptionalGradient
            gradient={bubbleGradient}
            style={[style.bubbleInner, style.orangeBubble]}>
            {children}
        </OptionalGradient>
    )
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
        isLoadingTransaction,
        isSentByMe,
        transaction,
    } = useMatrixPaymentEvent({
        event,
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
            <>
                <Column gap="lg">
                    <Text color={theme.colors.secondary}>{messageText}</Text>
                    {isSentByMe && transaction?.txnNotes && (
                        <Text color={theme.colors.secondary}>
                            <Text bold color={theme.colors.secondary}>
                                {t('words.notes')}
                            </Text>
                            : {transaction.txnNotes}
                        </Text>
                    )}
                </Column>
                {isLoadingTransaction && (
                    <Row align="center" gap="xs" style={{ marginTop: 4 }}>
                        <ActivityIndicator
                            size="small"
                            color={theme.colors.secondary}
                        />
                        <Text
                            style={{
                                fontSize: 12,
                                color: theme.colors.secondary,
                            }}>
                            {t('words.loading')}
                        </Text>
                    </Row>
                )}
            </>
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
        </PaymentEventContainer>
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
        paymentButtons: {
            marginTop: theme.spacing.sm,
        },
        statusText: {
            color: theme.colors.secondary,
            marginLeft: theme.spacing.sm,
        },
        orangeBubble: {
            backgroundColor: theme.colors.orange,
        },
        bubbleInner: {
            padding: 10,
        },
    })

export default ChatPaymentEvent
