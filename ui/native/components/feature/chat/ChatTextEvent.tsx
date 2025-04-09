import { Theme, useTheme } from '@rneui/themed'
import { Pressable, StyleSheet } from 'react-native'

import { selectMatrixAuth, setSelectedChatMessage } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { OptionalGradient } from '../../ui/OptionalGradient'
import { bubbleGradient } from './ChatEvent'
import MessageContents from './MessageContents'

type Props = {
    event: MatrixEvent<MatrixEventContentType<'m.text'>>
    isWide?: boolean
}

const ChatTextEvent: React.FC<Props> = ({ event, isWide }) => {
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const { theme } = useTheme()
    const style = styles(theme)
    const dispatch = useAppDispatch()

    const handleLongPress = () => {
        dispatch(setSelectedChatMessage(event))
    }

    const isMe = event.senderId === matrixAuth?.userId

    return (
        <Pressable onLongPress={isMe ? handleLongPress : undefined}>
            <OptionalGradient
                gradient={isMe ? bubbleGradient : undefined}
                style={[
                    style.bubbleInner,
                    isMe ? style.blueBubble : style.greyBubble,
                    isWide && { width: theme.sizes.maxMessageWidth },
                ]}>
                <MessageContents
                    content={event.content.body}
                    sentByMe={isMe}
                    textStyles={[
                        isMe
                            ? styles(theme).outgoingText
                            : styles(theme).incomingText,
                    ]}
                />
            </OptionalGradient>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        bubbleInner: {
            padding: 10,
        },
        greyBubble: {
            backgroundColor: theme.colors.extraLightGrey,
        },
        blueBubble: {
            backgroundColor: theme.colors.blue,
        },
        incomingText: {
            color: theme.colors.primary,
        },
        outgoingText: {
            color: theme.colors.secondary,
        },
    })

export default ChatTextEvent
