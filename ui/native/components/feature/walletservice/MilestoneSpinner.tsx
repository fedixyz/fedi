import { useTheme } from '@rneui/themed'
import React, { useEffect } from 'react'
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated'
// named rather than default: the shared `react-native-svg` test mock is a plain
// object, so a default import resolves to the mock itself instead of the component
import { Circle, Svg } from 'react-native-svg'

/** `.agg-ic` in the design: a 28px ring with one lit quarter, turning in 0.8s. */
const SPINNER_SIZE = 28
const SPINNER_STROKE = 2
const SPINNER_RADIUS = (SPINNER_SIZE - SPINNER_STROKE) / 2
const SPINNER_CIRCUMFERENCE = 2 * Math.PI * SPINNER_RADIUS
const SPINNER_ARC = SPINNER_CIRCUMFERENCE / 4
const SPINNER_DURATION = 800

/**
 * The design's own spinner, rather than the platform's.
 *
 * `ActivityIndicator` draws iOS's grey spokes, which reads as a system wait and
 * sits oddly inside a card the design draws as a ring. This is `.agg-ic`: a
 * full track with a single quarter lit, turning at a constant rate.
 *
 * Drawn in SVG rather than as a `View` with one differing `borderTopColor` —
 * a fully rounded border with unequal side colours does not render the same way
 * on both platforms.
 */
export const MilestoneSpinner: React.FC = () => {
    const { theme } = useTheme()
    const rotation = useSharedValue(0)

    useEffect(() => {
        rotation.value = withRepeat(
            withTiming(360, {
                duration: SPINNER_DURATION,
                easing: Easing.linear,
            }),
            -1,
        )
    }, [rotation])

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }))

    return (
        <Animated.View testID="milestone-spinner" style={animatedStyle}>
            <Svg width={SPINNER_SIZE} height={SPINNER_SIZE}>
                <Circle
                    cx={SPINNER_SIZE / 2}
                    cy={SPINNER_SIZE / 2}
                    r={SPINNER_RADIUS}
                    stroke={theme.colors.lightGrey}
                    strokeWidth={SPINNER_STROKE}
                    fill="none"
                />
                <Circle
                    cx={SPINNER_SIZE / 2}
                    cy={SPINNER_SIZE / 2}
                    r={SPINNER_RADIUS}
                    stroke={theme.colors.primary}
                    strokeWidth={SPINNER_STROKE}
                    strokeDasharray={`${SPINNER_ARC} ${
                        SPINNER_CIRCUMFERENCE - SPINNER_ARC
                    }`}
                    strokeLinecap="round"
                    fill="none"
                />
            </Svg>
        </Animated.View>
    )
}
