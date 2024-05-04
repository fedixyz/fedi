import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { ImageBackground, StyleSheet, View } from 'react-native'

import { Images } from '../../assets/images'

export type Props = {
    content: React.ReactNode
}

const HoloCircle: React.FC<Props> = ({ content }: Props) => {
    const { theme } = useTheme()

    return (
        <View style={styles(theme).container}>
            <ImageBackground
                source={Images.HoloBackgroundStrong}
                style={styles(theme).holoCircle}
                imageStyle={styles(theme).holoCircleImage}
            />
            <View style={styles(theme).innerCircle} />
            <View style={styles(theme).contentContainer}>{content}</View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            position: 'relative',
            alignItems: 'center',
            justifyContent: 'center',
            height: theme.sizes.holoCircleSize,
            width: theme.sizes.holoCircleSize,
        },
        holoCircle: {
            position: 'absolute',
            height: theme.sizes.holoCircleSize,
            width: theme.sizes.holoCircleSize,
            opacity: 1,
        },
        holoCircleImage: {
            borderRadius: theme.sizes.holoCircleSize * 0.5,
        },
        contentContainer: {
            position: 'absolute',
        },
        innerCircle: {
            position: 'absolute',
            // Shaves a couple pixels off the holographic ring
            // covering it with a transparent white inner circle
            height: theme.sizes.holoCircleSize - 3,
            width: theme.sizes.holoCircleSize - 3,
            borderRadius: theme.sizes.holoCircleSize * 0.5,
            backgroundColor: theme.colors.white,
            opacity: 0.85,
        },
    })

export default HoloCircle
