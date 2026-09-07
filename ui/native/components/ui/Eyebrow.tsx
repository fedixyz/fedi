import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, TextStyle } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

/**
 * Small upper-cased section label — `GUARDIANS`, `TOTAL SETUP COST`, `GENERAL`.
 *
 * Upper-cases its own text so callers never hand-write shouting copy into
 * translation files.
 */
export const Eyebrow: React.FC<{ children: string; style?: TextStyle }> = ({
    children,
    style,
}) => {
    const { theme } = useTheme()

    return (
        <Text style={[styles(theme).label, style]}>
            {children.toUpperCase()}
        </Text>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        label: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.small,
            fontWeight: '600',
            letterSpacing: 1.2,
        },
    })
