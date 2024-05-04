import React from 'react'
import { View, ViewProps } from 'react-native'
import LinearGradient, {
    LinearGradientProps,
} from 'react-native-linear-gradient'

interface Props extends ViewProps {
    children: React.ReactNode
    gradient?: LinearGradientProps
}

export const OptionalGradient: React.FC<Props> = ({
    children,
    gradient,
    ...props
}) => {
    if (gradient) {
        return (
            <LinearGradient {...gradient} {...props}>
                {children}
            </LinearGradient>
        )
    } else {
        return <View {...props}>{children}</View>
    }
}
