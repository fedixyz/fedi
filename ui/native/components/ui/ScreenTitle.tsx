import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, TextStyle } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

/**
 * Page heading for the wallet service flow.
 *
 * Sized to the app's `h2` token so the flow's headings match every other
 * screen's page title. Keeping this in one component stops the eleven screens
 * drifting apart.
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
            fontSize: fediTheme.fontSizes.h2,
            fontWeight: '500',
            lineHeight: 32,
        },
    })
