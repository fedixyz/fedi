import { Text, useTheme } from '@rneui/themed'
import React, { useRef } from 'react'
import {
    Animated,
    Pressable,
    StyleSheet,
    useWindowDimensions,
} from 'react-native'

import { NumpadButtonValue } from '@fedi/common/types/amount'
import { hexToRgba } from '@fedi/common/utils/color'

import SvgImage from './SvgImage'

interface Props {
    btn: NumpadButtonValue
    disabled?: boolean
    onPress: () => void
    /**
     * Row height in points, for a keypad whose space is decided by its
     * container rather than by the window — a bottom sheet, say. Left unset,
     * the button keeps sizing itself off the window height, which is right for
     * a keypad that owns a whole screen.
     */
    height?: number
}

export const NumpadButton: React.FC<Props> = ({
    btn,
    disabled,
    onPress,
    height,
}) => {
    const { theme } = useTheme()
    const dimensions = useWindowDimensions()
    const backgroundOpacity = useRef(new Animated.Value(0)).current
    const backgroundColor = backgroundOpacity.interpolate({
        inputRange: [0, 1],
        outputRange: [
            hexToRgba(theme.colors.primary, 0),
            hexToRgba(theme.colors.primary, 0.04),
        ],
    })

    // a short row gets the smaller glyphs, whether it is short because the
    // window is small or because a container handed it less room
    const resolvedHeight = height ?? (dimensions.height < 600 ? 52 : 68)
    const isCompact = resolvedHeight < 60

    const style = styles(resolvedHeight, isCompact)
    return (
        <Animated.View style={[style.container, { backgroundColor }]}>
            <Pressable
                testID={`NumpadButton-${btn}`}
                style={style.pressable}
                onPress={onPress}
                onPressIn={() =>
                    Animated.timing(backgroundOpacity, {
                        toValue: 1,
                        duration: 80,
                        useNativeDriver: false,
                    }).start()
                }
                onPressOut={() =>
                    Animated.timing(backgroundOpacity, {
                        toValue: 0,
                        duration: 80,
                        useNativeDriver: false,
                    }).start()
                }
                disabled={btn === null || disabled}>
                {btn === 'backspace' ? (
                    <SvgImage name="ArrowLeft" size={isCompact ? 20 : 24} />
                ) : (
                    <Text medium style={style.text}>
                        {btn}
                    </Text>
                )}
            </Pressable>
        </Animated.View>
    )
}

const styles = (rowHeight: number, isCompact: boolean) =>
    StyleSheet.create({
        container: {
            width: '33.333333%',
            borderRadius: 8,
        },
        pressable: {
            width: '100%',
            height: rowHeight,
            alignItems: 'center',
            justifyContent: 'center',
        },
        text: {
            fontSize: isCompact ? 16 : 20,
        },
    })
