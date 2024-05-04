import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'
import LinearGradient from 'react-native-linear-gradient'

import { theme as fediTheme } from '@fedi/common/constants/theme'

const nightGradient = [...fediTheme.nightHoloAmbientGradient]

type HoloGradientProps = {
    size?: number
    rounded?: boolean
    style?: ViewStyle
    gradientStyle?: ViewStyle
    children?: React.ReactNode
}

const HoloGradient: React.FC<HoloGradientProps> = ({
    size,
    rounded = false,
    children,
    ...props
}: HoloGradientProps) => {
    const { theme } = useTheme()
    const height = size
    const width = size

    const innerGradientStyle = {
        height,
        width,
        ...(rounded && size ? { borderRadius: size * 0.5 } : {}),
    }

    const style = styles(theme)
    return (
        <View style={[style.container, props.style]}>
            <LinearGradient
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                colors={['rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0)']}
                style={style.outerGradient}>
                <LinearGradient
                    start={{ x: 0, y: 0.75 }}
                    end={{ x: 1, y: 0.95 }}
                    colors={nightGradient}
                    style={[innerGradientStyle, props.gradientStyle]}>
                    {children}
                </LinearGradient>
            </LinearGradient>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            backgroundColor: theme.colors.night,
        },
        outerGradient: {
            flex: 1,
        },
    })

export default HoloGradient
