import React from 'react'
import { View, ViewProps } from 'react-native'

interface GradientConfig {
    colors: string[]
    start?: { x: number; y: number }
    end?: { x: number; y: number }
}

interface Props extends ViewProps {
    children: React.ReactNode
    gradient?: GradientConfig
}

export const OptionalGradient: React.FC<Props> = ({
    children,
    gradient,
    ...props
}) => {
    if (gradient) {
        const gradientStyle = {
            experimental_backgroundImage: `linear-gradient(to bottom, ${gradient.colors.join(', ')})`,
        }
        return (
            <View {...props} style={[props.style, gradientStyle]}>
                {children}
            </View>
        )
    } else {
        return <View {...props}>{children}</View>
    }
}
