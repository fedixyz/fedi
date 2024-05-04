import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'

import { DetailItem } from '@fedi/common/utils/wallet'

export type FeeBreakdownItemProps = DetailItem & {
    noBorder?: boolean
}

export const FeeBreakdownItem: React.FC<FeeBreakdownItemProps> = props => {
    const { theme } = useTheme()

    const style = styles(theme)

    const containerStyle = [
        style.container,
        props.noBorder ? {} : style.containerBorder,
    ]

    return (
        <View style={containerStyle}>
            <Text caption bold style={style.labelText}>
                {props.label}
            </Text>
            <Text caption>{props.value}</Text>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            minHeight: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        containerBorder: {
            paddingBottom: theme.spacing.md,
            marginBottom: theme.spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.extraLightGrey,
        },
        labelText: {
            color: theme.colors.darkGrey,
        },
    })
