import { Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'

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
        <View style={style.container}>
            <View style={style.content}>
                <ShimmerPlaceholder width={48} height={48} borderRadius={8} />
                <View style={style.titleContainer}>
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
                </View>
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            justifyContent: 'space-between',
            borderRadius: 0,
            paddingHorizontal: theme.spacing.lg,
            alignItems: 'center',
            flexDirection: 'row',
            marginVertical: theme.spacing.md,
        },
        content: {
            gap: theme.spacing.md,
            justifyContent: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            flexShrink: 1,
        },
        titleContainer: {
            flexDirection: 'column',
            alignItems: 'flex-start',
            flexShrink: 1,
            gap: 4,
        },
    })

export default CommunityTileLoading
