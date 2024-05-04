import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useRef } from 'react'
import {
    Animated,
    Easing,
    ImageBackground,
    StyleSheet,
    View,
    ViewStyle,
} from 'react-native'
import * as Progress from 'react-native-progress'

import { Images } from '../../assets/images'

export type Props = {
    size?: number
    label?: string
    progress?: number
}

const HoloLoader: React.FC<Props> = ({
    label,
    size = 200,
    progress = 0.35,
}: Props) => {
    const { theme } = useTheme()
    const animatedSpin = useRef(new Animated.Value(0)).current

    useEffect(() => {
        Animated.loop(
            Animated.timing(animatedSpin, {
                toValue: 1,
                duration: 1000,
                useNativeDriver: false,
                easing: Easing.ease,
            }),
        ).start()
    }, [animatedSpin])

    const spinInterpolation = animatedSpin.interpolate({
        inputRange: [0, 1],
        outputRange: ['360deg', '0deg'],
    })

    const transformedStyle: Animated.AnimatedProps<ViewStyle> = {
        transform: [{ rotate: spinInterpolation }],
    }

    const style = styles(theme, size)

    return (
        <View style={[style.container]}>
            <ImageBackground
                source={Images.HoloBackgroundStrong}
                style={style.holoCircle}
                imageStyle={style.holoCircleImage}
            />
            <View style={style.whiteCircle} />
            <Animated.View
                style={[style.progressCircleContainer, transformedStyle]}>
                <Progress.Circle
                    progress={1 - progress}
                    color={theme.colors.white}
                    thickness={theme.sizes.progressCircleThickness}
                    size={size}
                    borderWidth={1}
                />
            </Animated.View>

            <View style={style.percentLabelContainer}>
                <Text medium>{label}</Text>
            </View>
        </View>
    )
}

const styles = (theme: Theme, size: number) =>
    StyleSheet.create({
        container: {
            position: 'relative',
            alignItems: 'center',
            justifyContent: 'center',
            height: size,
            width: size,
        },
        progressCircleContainer: {
            position: 'absolute',
        },
        percentLabelContainer: {
            position: 'absolute',
        },
        holoCircle: {
            position: 'absolute',
            // Shaves a couple pixels off the holographic ring
            // to remove a thin border that appears while the white
            // progress ring is uncovering the holographic ring
            height: size,
            width: size,
        },
        holoCircleImage: {
            borderRadius: size * 0.5,
        },
        whiteCircle: {
            position: 'absolute',
            height: size - 10,
            width: size - 10,
            borderRadius: (size - 10) * 0.5,
            backgroundColor: theme.colors.white,
        },
    })

export default HoloLoader
