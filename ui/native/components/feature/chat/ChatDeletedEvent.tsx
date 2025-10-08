import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import { selectMatrixAuth } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'

import { useAppSelector } from '../../../state/hooks'
import { OptionalGradient } from '../../ui/OptionalGradient'
import { bubbleGradient } from './ChatEvent'

type Props = {
    event: MatrixEvent<'redacted'>
}

const ChatDeletedEvent: React.FC<Props> = ({ event }) => {
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)

    const isMe = event.sender === matrixAuth?.userId

    return (
        <Pressable>
            <OptionalGradient
                gradient={isMe ? bubbleGradient : undefined}
                style={[style.bubbleInner, style.greyBubble]}>
                <Text caption medium style={style.text}>
                    {t('feature.chat.message-deleted')}
                </Text>
            </OptionalGradient>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        bubbleInner: {
            padding: 10,
            opacity: 0.8,
        },
        greyBubble: {
            backgroundColor: theme.colors.extraLightGrey,
            opacity: 0.4,
        },
        text: {
            color: theme.colors.grey,
            fontStyle: 'italic',
        },
        outgoingText: {
            color: theme.colors.grey,
            fontStyle: 'italic',
        },
    })

export default ChatDeletedEvent
