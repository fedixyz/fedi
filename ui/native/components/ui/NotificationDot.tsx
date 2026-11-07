import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'

const NotificationDot: React.FC<{
    style?: StyleProp<ViewStyle>
    testID?: string
}> = ({ style, testID }) => {
    const { theme } = useTheme()
    return <View style={[styles(theme).dot, style]} testID={testID} />
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
