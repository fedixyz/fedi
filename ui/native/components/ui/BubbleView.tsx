import { Theme, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import { Column } from './Flex'

type BubbleViewProps = {
    containerStyle?: StyleProp<ViewStyle>
    topShadowStyle?: StyleProp<ViewStyle>
    bottomShadowStyle?: StyleProp<ViewStyle>
    children: React.ReactNode
}

type BubbleGradientProps = BubbleViewProps & {
    colors: string[]
    day?: boolean
}

type BubbleCardProps = BubbleViewProps & {
    gradientColors?: string[]
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
            {Platform.OS === 'ios' && (
                <>
                    <View style={[style.shadow, topShadow]} />
                    <View style={[style.shadow, bottomShadow]} />
                </>
            )}
            {children}
        </View>
    )
}

/**
 * This component hacks an inset shadow onto the
 * top and bottom of a View with gradient background. It is used
 * to create the effect of a bubble view with a shadow.
 */
export const BubbleGradient = ({
    children,
    colors,
    ...props
}: BubbleGradientProps) => {
    const [width, setWidth] = useState(0)
    const { theme } = useTheme()
    const style = styles(theme, width)
    return (
        <View
            {...props}
            style={[
                props.containerStyle,
                {
                    experimental_backgroundImage: `linear-gradient(to bottom, ${colors.join(', ')})`,
                },
            ]}
            onLayout={({ nativeEvent }) => {
                setWidth(nativeEvent.layout.width)
            }}>
            {Platform.OS === 'ios' && (
                <>
                    <View style={[style.shadow, style.top]} />
                    <View style={[style.shadow, style.bottom]} />
                </>
            )}
            {children}
        </View>
    )
}

/**
 * This component hacks an inset shadow onto the
 * top and bottom of a View with gradient background. It is used
 * to create the effect of a bubble view with a shadow.
 */
export const BubbleCard = ({
    containerStyle,
    children,
    gradientColors,
}: BubbleCardProps) => {
    const { theme } = useTheme()
    const style = styles(theme, 0)
    const colors = gradientColors || [...fediTheme.dayLinearGradient]
    return (
        <BubbleView containerStyle={[style.wrapper, containerStyle]}>
            <View
                style={[
                    style.gradient,
                    {
                        experimental_backgroundImage: `linear-gradient(to bottom, ${colors.join(', ')})`,
                    },
                ]}>
                <Column gap="md" fullWidth style={[style.wrapper, style.card]}>
                    {children}
                </Column>
            </View>
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
        },
        card: {
            padding: theme.spacing.lg,
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
