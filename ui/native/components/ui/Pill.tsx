import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'

export type Props = {
    label: string
}

export const Pill: React.FC<Props> = ({ label }: Props) => {
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <View style={style.container}>
            <Text bold small style={{ color: theme.colors.white }}>
                {label}
            </Text>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            backgroundColor: theme.colors.grey400,
            borderRadius: 5,
            display: 'flex',
            paddingVertical: theme.spacing.xxs,
            paddingHorizontal: theme.spacing.xs,
        },
    })
