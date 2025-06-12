import { Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet } from 'react-native'

import Flex from '../../ui/Flex'

const ShimmerPlaceholder: React.FC<{
    width: number
    height: number
    borderRadius: number
}> = ({ width, height, borderRadius }) => {
    const { theme } = useTheme()
    const animatedValue = useRef(new Animated.Value(0)).current

    useEffect(() => {
        Animated.loop(
            Animated.timing(animatedValue, {
                toValue: 1,
                duration: 3000,
                easing: Easing.linear,
                useNativeDriver: true,
            }),
        ).start()
    }, [animatedValue])

    const backgroundColor = animatedValue.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [
            theme.colors.grey,
            theme.colors.lightGrey,
            theme.colors.grey,
        ],
    })

    return (
        <Animated.View
            style={[
                {
                    width,
                    height,
                    backgroundColor,
                    borderRadius,
                },
            ]}
        />
    )
}

const CommunityTileLoading = () => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Flex row align="center" justify="between" style={style.container}>
            <Flex row align="center" justify="start" gap="md" shrink>
                <ShimmerPlaceholder width={48} height={48} borderRadius={8} />
                <Flex align="start" shrink gap="xs">
                    <ShimmerPlaceholder
                        width={120}
                        height={20}
                        borderRadius={0}
                    />
                    <ShimmerPlaceholder
                        width={100}
                        height={20}
                        borderRadius={0}
                    />
                </Flex>
            </Flex>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            borderRadius: 0,
            paddingHorizontal: theme.spacing.lg,
            marginVertical: theme.spacing.md,
        },
    })

export default CommunityTileLoading
