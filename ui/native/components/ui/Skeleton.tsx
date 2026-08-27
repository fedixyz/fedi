import { Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useId, useState } from 'react'
import { LayoutChangeEvent, StyleSheet, View, ViewStyle } from 'react-native'
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated'
// named rather than default: the shared `react-native-svg` test mock is a plain
// object, so a default import resolves to the mock itself instead of the component
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg'

export interface SkeletonProps {
    /** Bar height in px. */
    height?: number
    /** Bar width — a number of px or a percentage string. */
    width?: number | `${number}%`
    style?: ViewStyle
}

/** One pass of the highlight across the bar, edge to edge. */
const SWEEP_DURATION = 1200

/**
 * Placeholder bar for content that is still loading, with a highlight that
 * pans across it.
 *
 * Used where blanking a value would be worse than showing a shape — the
 * guardian summary keeps its layout stable while a fresh quote resolves.
 *
 * The pan is a gradient band the width of the bar, translated from one edge to
 * the other under `overflow: hidden`. It replaced an opacity pulse: a pulse
 * reads as a thing blinking, a pan reads as a thing arriving, and the second is
 * what these bars are saying.
 *
 * The band is drawn in SVG because `react-native-linear-gradient` is not a
 * dependency of this app — gradients here come from `react-native-svg`.
 *
 * The bar measures itself rather than taking a width in px, so a percentage
 * width still pans the right distance. Until the first layout there is no
 * measurement and no band, which is also what happens under the test renderer.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
    height = 16,
    width = '100%',
    style,
}) => {
    const { theme } = useTheme()
    const [barWidth, setBarWidth] = useState(0)
    const sweepProgress = useSharedValue(0)
    // every bar on a screen defines its own gradient, and an id shared between
    // two of them resolves to whichever was drawn last. `useId` colons are not
    // legal in an SVG id, so they come out
    const gradientId = `skeleton-sweep-${useId().replace(/:/g, '')}`

    useEffect(() => {
        if (barWidth === 0) return
        sweepProgress.value = 0
        sweepProgress.value = withRepeat(
            withTiming(1, {
                duration: SWEEP_DURATION,
                easing: Easing.inOut(Easing.ease),
            }),
            -1,
        )
    }, [barWidth, sweepProgress])

    // starts one full width off the left edge and ends one full width past the
    // right, so the band is off-screen at both ends of the loop rather than
    // sitting parked under an edge
    const sweepStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: barWidth * (sweepProgress.value * 2 - 1) }],
    }))

    const handleLayout = (event: LayoutChangeEvent) =>
        setBarWidth(event.nativeEvent.layout.width)

    return (
        <View
            accessibilityRole="progressbar"
            onLayout={handleLayout}
            style={[styles(theme).bar, { height, width }, style]}>
            {barWidth > 0 && (
                <Animated.View
                    style={[
                        StyleSheet.absoluteFill,
                        { width: barWidth },
                        sweepStyle,
                    ]}>
                    <Svg width={barWidth} height={height}>
                        <Defs>
                            <LinearGradient
                                id={gradientId}
                                x1="0"
                                y1="0"
                                x2="1"
                                y2="0">
                                <Stop
                                    offset="0"
                                    stopColor={theme.colors.white}
                                    stopOpacity={0}
                                />
                                <Stop
                                    offset="0.5"
                                    stopColor={theme.colors.white}
                                    stopOpacity={0.7}
                                />
                                <Stop
                                    offset="1"
                                    stopColor={theme.colors.white}
                                    stopOpacity={0}
                                />
                            </LinearGradient>
                        </Defs>
                        <Rect
                            x={0}
                            y={0}
                            width={barWidth}
                            height={height}
                            fill={`url(#${gradientId})`}
                        />
                    </Svg>
                </Animated.View>
            )}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        bar: {
            backgroundColor: theme.colors.lightGrey,
            borderRadius: theme.borders.defaultRadius,
            // the band is the width of the bar and travels past both edges;
            // without this it paints over whatever sits beside the bar
            overflow: 'hidden',
        },
    })
