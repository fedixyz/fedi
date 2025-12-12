import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'

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
            <View style={style.outerGradient}>
                <View
                    style={[
                        innerGradientStyle,
                        props.gradientStyle,
                        style.innerGradient,
                    ]}>
                    {children}
                </View>
            </View>
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
            experimental_backgroundImage:
                'linear-gradient(to bottom, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0))',
        },
        innerGradient: {
            experimental_backgroundImage: `linear-gradient(125deg, ${nightGradient.join(', ')})`,
        },
    })

export default HoloGradient
