import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { ImageBackground, StyleSheet, View } from 'react-native'

import { Images } from '../../assets/images'

export type Props = {
    content: React.ReactNode
    size?: number
}

const HoloCircle: React.FC<Props> = ({ content, size }: Props) => {
    const { theme } = useTheme()
    const circleSize = size || theme.sizes.holoCircleSize

    const style = styles(theme)
    return (
        <View
            style={[
                style.container,
                { height: circleSize, width: circleSize },
            ]}>
            <ImageBackground
                source={Images.HoloBackgroundStrong}
                style={[
                    style.holoCircle,
                    { height: circleSize, width: circleSize },
                ]}
                imageStyle={{ borderRadius: circleSize * 0.5 }}
            />
            <View
                style={[
                    style.innerCircle,
                    {
                        // Shaves a couple pixels off the holographic ring
                        // covering it with a transparent white inner circle
                        height: circleSize - 3,
                        width: circleSize - 3,
                        borderRadius: circleSize * 0.5,
                    },
                ]}
            />
            <View style={style.contentContainer}>{content}</View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            position: 'relative',
            alignItems: 'center',
            justifyContent: 'center',
        },
        holoCircle: {
            position: 'absolute',
            opacity: 1,
        },
        contentContainer: {
            position: 'absolute',
        },
        innerCircle: {
            position: 'absolute',
            backgroundColor: theme.colors.white,
            opacity: 0.85,
        },
    })

export default HoloCircle
