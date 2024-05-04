import { Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'

type ProgressSectionProps = {
    targetValue?: number
    delay?: number
}

const ProgressSection: React.FC<ProgressSectionProps> = ({
    targetValue = 0.5,
    delay = 0,
}: ProgressSectionProps) => {
    const { theme } = useTheme()
    const animatedWidth = useRef(new Animated.Value(0)).current

    useEffect(() => {
        Animated.timing(animatedWidth, {
            toValue: targetValue,
            duration: 100,
            useNativeDriver: false,
            delay,
            easing: Easing.linear,
        }).start()
    }, [animatedWidth, delay, targetValue])

    const widthInterpolation = animatedWidth.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: ['0%', '50%', '100%'],
    })

    return (
        <View style={[styles(theme).progressBarSection]}>
            <Animated.View
                style={[
                    styles(theme).filledSection,
                    { width: widthInterpolation },
                ]}
            />
        </View>
    )
}

type ProgressBarProps = {
    page: number
}

const ProgressBar: React.FC<ProgressBarProps> = ({
    page = 1,
}: ProgressBarProps) => {
    const { theme } = useTheme()

    return (
        <View style={styles(theme).container}>
            {/*
                Each section animates between 0% width to 50% to 100%
                depending on which page is selected

                The delay is provided to make sure each section waits a bit
                for the previous section to finish animating before starting
                its own animation so it looks smoother overall
            */}
            <ProgressSection
                targetValue={page === 1 ? 0.5 : 1}
                delay={page === 1 ? 100 : 0}
            />
            <ProgressSection
                targetValue={page < 2 ? 0 : page === 2 ? 0.5 : 1}
                delay={page === 2 ? 100 : 0}
            />
            <ProgressSection
                targetValue={page < 3 ? 0 : page === 3 ? 0.5 : 1}
                delay={page === 3 ? 100 : 0}
            />
            <ProgressSection
                targetValue={page < 4 ? 0 : page === 4 ? 0.5 : 1}
                delay={page === 4 ? 100 : 0}
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            marginVertical: 'auto',
            height: theme.sizes.progressBarHeight,
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-evenly',
        },
        progressBarSection: {
            flex: 1,
            height: '100%',
            backgroundColor: theme.colors.grey,
            marginHorizontal: theme.spacing.xxs,
            borderRadius: theme.borders.progressBarRadius,
            position: 'relative',
        },
        filledSection: {
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            backgroundColor: theme.colors.primary,
            borderRadius: theme.borders.progressBarRadius,
        },
    })

export default ProgressBar
