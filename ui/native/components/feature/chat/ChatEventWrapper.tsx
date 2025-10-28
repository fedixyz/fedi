import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Pressable, StyleSheet } from 'react-native'

import { selectMatrixAuth } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'

import { useAppSelector } from '../../../state/hooks'
import { OptionalGradient } from '../../ui/OptionalGradient'
import { bubbleGradient } from './ChatEvent'

type Props = {
    event: MatrixEvent<'m.text' | 'xyz.fedi.federationInvite'>
    isWide?: boolean
    handleLongPress?: () => void
    children: React.ReactNode
}

const ChatEventWrapper: React.FC<Props> = ({
    event,
    isWide,
    handleLongPress,
    children,
}) => {
    const { theme } = useTheme()
    const style = styles(theme)
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const isMe = event.sender === matrixAuth?.userId

    return (
        <Pressable
            onLongPress={handleLongPress || null}
            android_ripple={{ color: 'transparent' }}
            style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
            <OptionalGradient
                gradient={isMe ? bubbleGradient : undefined}
                style={[
                    style.bubbleInner,
                    isMe ? style.blueBubble : style.greyBubble,
                    {
                        maxWidth: theme.sizes.maxMessageWidth,
                        alignSelf: isMe ? 'flex-end' : 'flex-start',
                        // Prevent any layout animations
                        transform: [{ translateX: 0 }],
                        ...(isWide && { width: theme.sizes.maxMessageWidth }),
                    },
                ]}>
                {children}
            </OptionalGradient>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        bubbleInner: {
            padding: 12,
        },
        greyBubble: {
            backgroundColor: theme.colors.extraLightGrey,
        },
        blueBubble: {
            backgroundColor: theme.colors.blue,
        },
    })

export default ChatEventWrapper
