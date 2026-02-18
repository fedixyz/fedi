import { Theme, useTheme, Text } from '@rneui/themed'
import { ReactNode } from 'react'
import { StyleSheet } from 'react-native'

import { Column } from '../../../ui/Flex'
import { OptionalGradient } from '../../../ui/OptionalGradient'
import { bubbleGradient } from '../../chat/ChatEvent'
import { PaymentEventStatus } from '../../chat/ChatPaymentEvent'

type Props = {
    message: ReactNode
    statusIcon?: 'x' | 'reject' | 'check' | 'error' | 'clock'
    statusText?: string
    extra?: ReactNode
}

const SpTransferEventTemplate: React.FC<Props> = ({
    message,
    statusIcon,
    statusText,
    extra,
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <OptionalGradient
            gradient={bubbleGradient}
            style={[style.bubbleInner, style.greenBubble]}>
            <Column gap="lg">
                {typeof message === 'string' ? (
                    <Text color={theme.colors.secondary}>{message}</Text>
                ) : (
                    message
                )}
            </Column>
            {statusText && (
                <PaymentEventStatus
                    statusIcon={statusIcon}
                    statusText={statusText}
                />
            )}
            {extra || null}
        </OptionalGradient>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        greenBubble: {
            backgroundColor: theme.colors.mint,
        },
        bubbleInner: {
            padding: 10,
        },
    })

export default SpTransferEventTemplate
