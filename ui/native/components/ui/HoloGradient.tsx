import React from 'react'
import { View, ViewStyle } from 'react-native'
import LinearGradient from 'react-native-linear-gradient'

import { theme as fediTheme } from '@fedi/common/constants/theme'

type HoloGradientProps = {
    // if size is not provided, the gradient should grow to the size of its children
    size?: number
    level?: keyof typeof fediTheme.holoGradient
    rounded?: boolean
    style?: ViewStyle
    angle?: number
    start?: { x: number; y: number }
    end?: { x: number; y: number }
    locations?: number[]
    gradientStyle?: ViewStyle
    children?: React.ReactNode
}

/**
 * @deprecated use <GradientView /> instead
 */
const HoloGradient: React.FC<HoloGradientProps> = ({
    size,
    level = '900',
    rounded = false,
    style: propStyle,
    start = { x: 0, y: 0.75 },
    end = { x: 1, y: 0.95 },
    locations,
    gradientStyle,
    children,
}: HoloGradientProps) => {
    const height = size
    const width = size
    const style = {
        ...(size ? { height, width } : {}),
        ...(rounded && size ? { borderRadius: size * 0.5 } : {}),
    }
    return (
        <View style={propStyle}>
            <LinearGradient
                start={start}
                end={end}
                locations={locations}
                colors={fediTheme.holoGradient[level]}
                style={[style, gradientStyle]}>
                {children}
            </LinearGradient>
        </View>
    )
}

export default HoloGradient
