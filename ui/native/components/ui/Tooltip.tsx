/**
 * @file
 * Tooltips specifically for calling out features during the new user experience.
 * Doesn't use @rneui/themed Tooltip because only one can be open at a time, and
 * those tooltips force focus and tapping while open since they're only meant for
 * on-tap information, not passive feature callouts. This code is heavily inspired
 * by React Native Element's <Tooltip />, but replaces all of the fancy automatic
 * positioning with good old fashioned manual positioning.
 * https://github.com/react-native-elements/react-native-elements/blob/next/packages/base/src/Tooltip/Tooltip.tsx
 */
import { useIsFocused } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'

const TRIANGLE_SIZE = 8

interface Props {
    shouldShow: boolean
    text: React.ReactNode
    orientation?: 'above' | 'below'
    side?: 'left' | 'right'
    delay?: number
    verticalOffset?: number
    horizontalOffset?: number
    children?: React.ReactNode
}

export const Tooltip: React.FC<Props> = ({
    shouldShow,
    text,
    delay,
    orientation = 'above',
    side = 'left',
    verticalOffset = 0,
    horizontalOffset = 0,
    children = <></>,
}) => {
    const { theme } = useTheme()
    const [isShowing, setIsShowing] = useState(false)
    const animatedVisibility = useRef(new Animated.Value(0)).current
    const isFocused = useIsFocused()

    // Show after delay, hide when the screen is not focused.
    useEffect(() => {
        if (!isFocused) {
            animatedVisibility.stopAnimation()
            animatedVisibility.setValue(0)
            setIsShowing(false)
            return
        }
        if (!shouldShow) {
            Animated.timing(animatedVisibility, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
                easing: Easing.ease,
            }).start(() => setIsShowing(false))
            return
        }
        const timeout = setTimeout(() => {
            setIsShowing(true)
            Animated.timing(animatedVisibility, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
                easing: Easing.elastic(1.25),
            }).start()
        }, delay || 0)
        return () => clearTimeout(timeout)
    }, [shouldShow, isFocused, delay, animatedVisibility])

    // While not showing and not animating out, don't render anything.
    if (!isShowing) return null

    const triangleOffset = TRIANGLE_SIZE + theme.spacing.md
    const positionStyle = {
        [orientation === 'above' ? 'bottom' : 'top']: verticalOffset,
        [side === 'left' ? 'left' : 'right']: horizontalOffset - triangleOffset,
        opacity: animatedVisibility,
        transform: [
            {
                translateY: animatedVisibility.interpolate({
                    inputRange: [0, 1],
                    outputRange: [orientation === 'above' ? -20 : 20, 0],
                }),
            },
        ],
    }
    const style = styles(theme)

    return (
        <Animated.View
            style={[
                style.container,
                positionStyle,
                orientation === 'below' ? style.containerReversed : {},
                side === 'right' ? style.containerRight : {},
            ]}>
            <View style={style.textContainer}>
                {text && (
                    <Text caption medium>
                        {text}
                    </Text>
                )}
                {children}
            </View>
            <View
                style={[
                    style.triangle,
                    orientation === 'below' ? style.triangleFlipped : {},
                ]}
            />
        </Animated.View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            zIndex: 5,
            elevation: 5,
            position: 'absolute',
            pointerEvents: 'box-none',
        },
        containerReversed: {
            flexDirection: 'column-reverse',
        },
        containerRight: {
            alignItems: 'flex-end',
        },
        textContainer: {
            backgroundColor: theme.colors.blue100,
            padding: theme.spacing.sm,
            borderRadius: 10,
        },
        triangle: {
            width: 0,
            height: 0,
            marginHorizontal: theme.spacing.md,
            backgroundColor: 'transparent',
            borderStyle: 'solid',
            borderLeftWidth: TRIANGLE_SIZE,
            borderRightWidth: TRIANGLE_SIZE,
            borderTopWidth: TRIANGLE_SIZE,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: theme.colors.blue100,
        },
        triangleFlipped: {
            transform: [{ rotate: '180deg' }],
        },
    })
