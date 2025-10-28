import { useTheme } from '@rneui/themed'
import React from 'react'
import { View, ViewStyle, useWindowDimensions } from 'react-native'
import { SvgProps } from 'react-native-svg'

import * as Svgs from '../../assets/images/svgs'

// Calculate the size. Use fontScale as a multiplier, but only at
// half the intensity when increasing. E.g. if fontScale is 2, the multiplier
// is 1.5. But if it's 0.8, it's 0.8.
export const getIconSizeMultiplier = (fontScale: number) =>
    fontScale < 1 ? fontScale : 1 + Math.min((fontScale - 1) * 0.5, 1)

export type SvgImageName = keyof typeof Svgs
export enum SvgImageSize {
    xxs = 'xxs',
    xs = 'xs',
    sm = 'sm',
    md = 'md',
    lg = 'lg',
    xl = 'xl',
}

export type SvgImageProps = {
    name: SvgImageName
    size?: SvgImageSize | number
    dimensions?: { width: number; height: number }
    containerStyle?: ViewStyle
    svgProps?: SvgProps
    color?: string
    maxFontSizeMultiplier?: number
}

const SvgImage = ({
    name,
    size = SvgImageSize.sm,
    dimensions,
    containerStyle,
    svgProps,
    color,
    maxFontSizeMultiplier,
}: SvgImageProps) => {
    const { theme } = useTheme()
    const Svg = Object(Svgs)[name]
    const { fontScale } = useWindowDimensions()

    // Calculate the size. Use fontScale as a multiplier, but only at
    // half the intensity. E.g. if fontScale is 2, the multiplier is 1.5.
    const multiplier = getIconSizeMultiplier(
        Math.min(
            fontScale,
            maxFontSizeMultiplier || theme.multipliers.defaultMaxFontMultiplier,
        ),
    )
    const { width, height } = dimensions ?? { width: size, height: size }
    const pxWidth =
        (typeof width === 'number' ? width : theme.sizes[width]) * multiplier
    const pxHeight =
        (typeof height === 'number' ? height : theme.sizes[height]) * multiplier

    const defaultSvgProps = {
        color: color || theme.colors.primary,
        height: pxHeight,
        width: pxWidth,
    }
    const mergedSvgProps = {
        ...defaultSvgProps,
        ...svgProps,
    }

    return (
        <View style={containerStyle}>
            {React.createElement(Svg, { ...mergedSvgProps })}
        </View>
    )
}

export default SvgImage
