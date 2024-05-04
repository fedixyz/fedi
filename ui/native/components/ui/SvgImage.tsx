import { useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native'
import { SvgProps } from 'react-native-svg'

import * as Svgs from '../../assets/images/svgs'

// Calculate the size. Use fontScale as a multiplier, but only at
// half the intensity when increasing. E.g. if fontScale is 2, the multiplier
// is 1.5. But if it's 0.8, it's 0.8.
export const getIconSizeMultiplier = (fontScale: number) =>
    fontScale < 1 ? fontScale : 1 + Math.min((fontScale - 1) * 0.5, 1)

export type SvgImageName = keyof typeof Svgs
export enum SvgImageSize {
    xs = 'xs',
    sm = 'sm',
    md = 'md',
    lg = 'lg',
    xl = 'xl',
}

type SvgImageProps = {
    name: SvgImageName
    size?: SvgImageSize | number
    containerStyle?: ViewStyle
    svgProps?: SvgProps
    color?: string
    maxFontSizeMultiplier?: number
}

const SvgImage = ({
    name,
    size = SvgImageSize.sm,
    containerStyle,
    svgProps,
    color,
    maxFontSizeMultiplier = Infinity,
}: SvgImageProps) => {
    const { theme } = useTheme()
    const Svg = Object(Svgs)[name]
    const { fontScale } = useWindowDimensions()

    // Calculate the size. Use fontScale as a multiplier, but only at
    // half the intensity. E.g. if fontScale is 2, the multiplier is 1.5.
    const multiplier = getIconSizeMultiplier(
        Math.min(fontScale, maxFontSizeMultiplier),
    )
    const pxSize =
        (typeof size === 'number' ? size : theme.sizes[size]) * multiplier

    const defaultSvgProps = {
        color: color || theme.colors.primary,
        height: pxSize,
        width: pxSize,
    }
    const mergedSvgProps = {
        ...defaultSvgProps,
        ...svgProps,
    }

    const mergedStyles = [styles.container, containerStyle]

    return (
        <View style={mergedStyles}>
            {React.createElement(Svg, { ...mergedSvgProps })}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {},
})

export default SvgImage
