import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Text, StyleSheet } from 'react-native'

import Flex from '../../ui/Flex'

export const OrDivider: React.FC = () => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Flex row align="center" gap="lg" fullWidth style={style.divider}>
            <Flex grow style={style.line} />
            <Text style={style.text}>or</Text>
            <Flex grow style={style.line} />
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        divider: {
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.sm,
        },
        line: {
            height: 1,
            backgroundColor: theme.colors.extraLightGrey,
        },
        text: {
            // no more manual margins needed!
            color: theme.colors.grey,
            fontWeight: '600',
        },
    })
