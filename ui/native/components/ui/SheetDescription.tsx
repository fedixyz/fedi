import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, TextStyle } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

/**
 * The explanation line under a wallet-service sheet title, shared so the
 * sheets cannot drift.
 */
export const SheetDescription: React.FC<{
    children: React.ReactNode
    style?: TextStyle
    testID?: string
}> = ({ children, style, testID }) => {
    const { theme } = useTheme()

    return (
        <Text testID={testID} style={[styles(theme).description, style]}>
            {children}
        </Text>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        description: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.caption,
            lineHeight: 20,
        },
    })
