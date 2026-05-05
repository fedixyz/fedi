import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, Easing, StyleSheet } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import SvgImage from '../../ui/SvgImage'

type Props = {
    isEncrypted: boolean
    visible?: boolean
}

const ChatEncryptionIndicator: React.FC<Props> = ({
    isEncrypted,
    visible = true,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)
    const progress = useRef(new Animated.Value(visible ? 1 : 0)).current

    useEffect(() => {
        Animated.timing(progress, {
            toValue: visible ? 1 : 0,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start()
    }, [progress, visible])

    return (
        <Animated.View
            testID="ChatEncryptionIndicator"
            pointerEvents="none"
            style={[
                style.encryptionIndicator,
                {
                    opacity: progress,
                    transform: [
                        {
                            translateY: progress.interpolate({
                                inputRange: [0, 1],
                                outputRange: [6, 0],
                            }),
                        },
                    ],
                },
            ]}>
            <SvgImage
                name={
                    isEncrypted ? 'LockSquareRounded' : 'LockSquareRoundedOff'
                }
                size={'sm'}
                color={theme.colors.grey}
                containerStyle={style.encryptionIndicatorIcon}
            />
            <Text
                testID="ChatEncryptionIndicatorText"
                style={style.encryptionIndicatorText}>
                {t(
                    isEncrypted
                        ? 'feature.chat.encrypted'
                        : 'feature.chat.not-encrypted',
                )}
            </Text>
        </Animated.View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        encryptionIndicator: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.xs,
            opacity: 0.72,
            paddingVertical: theme.spacing.sm,
            position: 'absolute',
            left: theme.spacing.md,
            right: theme.spacing.md,
            bottom: '100%',
            zIndex: 2,
        },
        encryptionIndicatorIcon: {
            opacity: 0.85,
        },
        encryptionIndicatorText: {
            color: theme.colors.grey,
            fontSize: fediTheme.fontSizes.caption,
        },
    })

export default ChatEncryptionIndicator
