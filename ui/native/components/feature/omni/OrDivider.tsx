import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

export const OrDivider: React.FC = () => {
    const { theme } = useTheme()
    const s = styles(theme)

    return (
        <View style={s.container}>
            <View style={s.line} />
            <Text style={s.text}>or</Text>
            <View style={s.line} />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            width: '100%',
            gap: 16, // <-- 16px between each child
            marginVertical: 0,
        },
        line: {
            flex: 1,
            height: 1,
            backgroundColor: theme.colors.extraLightGrey,
        },
        text: {
            // no more manual margins needed!
            color: theme.colors.grey,
            fontWeight: '600',
        },
    })
