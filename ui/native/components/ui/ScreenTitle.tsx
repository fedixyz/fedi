import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, TextStyle } from 'react-native'

/**
 * Page heading for the wallet service flow.
 *
 * RNE's `h2` is 24px; the design's `.app-title` is 20px / 500 with a 28px line
 * box. Keeping this in one component stops the eleven screens drifting apart.
 */
export const ScreenTitle: React.FC<{
    children: React.ReactNode
    style?: TextStyle
    testID?: string
}> = ({ children, style, testID }) => {
    const { theme } = useTheme()

    return (
        <Text testID={testID} style={[styles(theme).title, style]}>
            {children}
        </Text>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        title: {
            color: theme.colors.primary,
            fontSize: 20,
            fontWeight: '500',
            lineHeight: 28,
        },
    })
