import { Text, useTheme } from '@rneui/themed'
import React, { useRef } from 'react'
import {
    Animated,
    Pressable,
    ScaledSize,
    StyleSheet,
    useWindowDimensions,
} from 'react-native'

import { NumpadButtonValue } from '@fedi/common/hooks/amount'
import { hexToRgba } from '@fedi/common/utils/color'

import SvgImage from './SvgImage'

interface Props {
    btn: NumpadButtonValue
    disabled?: boolean
    onPress: () => void
}

export const NumpadButton: React.FC<Props> = ({ btn, disabled, onPress }) => {
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

    const style = styles(dimensions)
    return (
        <Animated.View style={[style.container, { backgroundColor }]}>
            <Pressable
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
                    <SvgImage
                        name="ArrowLeft"
                        size={dimensions.height < 600 ? 20 : 24}
                    />
                ) : (
                    <Text medium style={style.text}>
                        {btn}
                    </Text>
                )}
            </Pressable>
        </Animated.View>
    )
}

const styles = (dimensions: ScaledSize) =>
    StyleSheet.create({
        container: {
            width: '33.333333%',
            borderRadius: 8,
        },
        pressable: {
            width: '100%',
            height: dimensions.height < 600 ? 52 : 68,
            alignItems: 'center',
            justifyContent: 'center',
        },
        text: {
            fontSize: dimensions.height < 600 ? 16 : 20,
        },
    })
