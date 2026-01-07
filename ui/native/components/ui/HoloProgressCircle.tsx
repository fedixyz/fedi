import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import * as Progress from 'react-native-progress'

import GradientView from './GradientView'

export type Props = {
    progress: number | undefined
    size?: number
    thickness?: number
}

const HoloProgressCircle: React.FC<Props> = ({
    progress,
    size = 24,
    thickness = 2,
}: Props) => {
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <GradientView
            variant="sky-banner"
            style={[style.circle, { width: size, height: size }]}>
            <View style={style.progressCircleContainer}>
                <Progress.Circle
                    progress={progress}
                    color={theme.colors.orange}
                    thickness={thickness}
                    size={size}
                    strokeCap="round"
                    borderWidth={0}
                />
            </View>
            <View
                style={[
                    style.whiteCircle,
                    {
                        width: size - thickness * 2,
                        height: size - thickness * 2,
                    },
                ]}
            />
        </GradientView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        circle: {
            position: 'relative',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 1024,
            overflow: 'hidden',
        },
        progressCircleContainer: {
            position: 'absolute',
        },
        whiteCircle: {
            position: 'absolute',
            borderRadius: 1024,
            backgroundColor: theme.colors.white,
        },
    })

export default HoloProgressCircle
