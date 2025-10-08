import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'

import Flex from './Flex'
import GradientView from './GradientView'

export type Props = {
    content: React.ReactNode
    size?: number
}

const HoloCircle: React.FC<Props> = ({ content, size }: Props) => {
    const { theme } = useTheme()
    const circleSize = size || theme.sizes.holoCircleSize

    const style = styles(theme)
    return (
        <Flex
            center
            style={[
                style.container,
                { height: circleSize, width: circleSize },
            ]}>
            <GradientView
                variant="sky"
                style={[
                    style.holoCircle,
                    {
                        height: circleSize,
                        width: circleSize,
                        borderRadius: circleSize * 0.5,
                    },
                ]}
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
            <Flex
                center
                style={{
                    // Draws the largest possible square that fits in the circle
                    width: (circleSize - 3) / Math.sqrt(2),
                    height: (circleSize - 3) / Math.sqrt(2),
                }}>
                {content}
            </Flex>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            position: 'relative',
        },
        holoCircle: {
            position: 'absolute',
            opacity: 1,
        },
        innerCircle: {
            position: 'absolute',
            backgroundColor: theme.colors.white,
            opacity: 0.85,
        },
    })

export default HoloCircle
