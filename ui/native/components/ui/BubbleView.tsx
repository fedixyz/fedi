import { Theme, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'
import { StyleSheet } from 'react-native'
import LinearGradient, {
    type LinearGradientProps,
} from 'react-native-linear-gradient'

import { theme as fediTheme } from '@fedi/common/constants/theme'

type BubbleViewProps = {
    containerStyle?: StyleProp<ViewStyle>
    topShadowStyle?: StyleProp<ViewStyle>
    bottomShadowStyle?: StyleProp<ViewStyle>
    children: React.ReactNode
}

type BubbleGradientProps = BubbleViewProps &
    LinearGradientProps & { day?: boolean }

type BubbleCardProps = BubbleViewProps & {
    linearGradientProps: LinearGradientProps
}

/**
 * This component hacks an inset shadow onto the
 * top and bottom of a View. It is used
 * to create the effect of a bubble view with a shadow.
 */
export const BubbleView = ({
    containerStyle,
    topShadowStyle,
    bottomShadowStyle,
    children,
}: BubbleViewProps) => {
    const [width, setWidth] = useState(0)
    const { theme } = useTheme()
    const style = styles(theme, width)
    const topShadow = topShadowStyle || style.top
    const bottomShadow = bottomShadowStyle || style.bottom
    return (
        <View
            style={[containerStyle, style.container]}
            onLayout={({ nativeEvent }) => {
                setWidth(nativeEvent.layout.width)
            }}>
            <View style={[style.shadow, topShadow]} />
            <View style={[style.shadow, bottomShadow]} />
            {children}
        </View>
    )
}

/**
 * This component hacks an inset shadow onto the
 * top and bottom of a Linear Gradient. It is used
 * to create the effect of a bubble view with a shadow.
 */
export const BubbleGradient = ({
    children,
    ...linearGradientProps
}: BubbleGradientProps) => {
    const [width, setWidth] = useState(0)
    const { theme } = useTheme()
    const style = styles(theme, width)
    return (
        <LinearGradient
            {...linearGradientProps}
            onLayout={({ nativeEvent }) => {
                setWidth(nativeEvent.layout.width)
            }}>
            <View style={[style.shadow, style.top]} />
            <View style={[style.shadow, style.bottom]} />
            {children}
        </LinearGradient>
    )
}

/**
 * This component hacks an inset shadow onto the
 * top and bottom of a Linear Gradient. It is used
 * to create the effect of a bubble view with a shadow.
 */
export const BubbleCard = ({
    containerStyle,
    children,
    linearGradientProps,
}: BubbleCardProps) => {
    const { theme } = useTheme()
    const style = styles(theme, 0)
    const gradientProps: LinearGradientProps = linearGradientProps
        ? linearGradientProps
        : {
              colors: [...fediTheme.dayLinearGradient],
              start: { x: 0, y: 0 },
              end: { x: 0, y: 1 },
          }
    return (
        <BubbleView containerStyle={[style.wrapper, containerStyle]}>
            <LinearGradient {...gradientProps} style={style.gradient}>
                <View style={[style.wrapper, style.card]}>{children}</View>
            </LinearGradient>
        </BubbleView>
    )
}

const styles = (theme: Theme, width: number) =>
    StyleSheet.create({
        gradient: {
            zIndex: 1,
        },
        wrapper: {
            borderRadius: theme.borders.defaultRadius,
            gap: theme.spacing.md,
        },
        card: {
            padding: theme.spacing.lg,
            width: '100%',
            overflow: 'hidden',
        },
        container: {
            overflow: 'hidden',
        },
        top: {
            top: -4,
            shadowColor: 'rgba(255, 255, 255, 1)',
            shadowOffset: {
                width: 0,
                height: 2,
            },
            shadowRadius: 3,
        },
        bottom: {
            bottom: -5,
            shadowColor: 'rgba(0, 0, 0, 0.2)',
            shadowOffset: {
                width: 0,
                height: -3,
            },
            shadowRadius: 3,
        },
        shadow: {
            position: 'absolute',
            borderRadius: 0,
            height: 4,

            // Accounts for the shadow tapering at the edges
            width: width * 1.4,

            backgroundColor: 'black',
            alignSelf: 'center',
            shadowOpacity: 1,
            zIndex: 10,
        },
    })
