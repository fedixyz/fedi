import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'

const NotificationDot: React.FC<{ style?: StyleProp<ViewStyle> }> = ({
    style,
}) => {
    const { theme } = useTheme()
    return <View style={[styles(theme).dot, style]} />
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        dot: {
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: theme.colors.red,
        },
    })

export default NotificationDot
