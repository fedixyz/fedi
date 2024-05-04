import React from 'react'
import { View, ViewStyle } from 'react-native'
import LinearGradient from 'react-native-linear-gradient'

import { theme as fediTheme } from '@fedi/common/constants/theme'

type HoloGradientProps = {
    size?: number
    level?: keyof typeof fediTheme.holoGradient
    rounded?: boolean
    style?: ViewStyle
    gradientStyle?: ViewStyle
    children?: React.ReactNode
}

const HoloGradient: React.FC<HoloGradientProps> = ({
    size,
    level = '900',
    rounded = false,
    style: propStyle,
    gradientStyle,
    children,
}: HoloGradientProps) => {
    const height = size
    const width = size
    const style = {
        height,
        width,
        ...(rounded && size ? { borderRadius: size * 0.5 } : {}),
    }
    return (
        <View style={propStyle}>
            <LinearGradient
                start={{ x: 0, y: 0.75 }}
                end={{ x: 1, y: 0.95 }}
                colors={fediTheme.holoGradient[level]}
                style={[style, gradientStyle]}>
                {children}
            </LinearGradient>
        </View>
    )
}

export default HoloGradient
