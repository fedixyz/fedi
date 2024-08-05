import type { Theme } from '@rneui/themed'
import { Text, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'

import { useBalance } from '@fedi/common/hooks/amount'

const Balance: React.FC = () => {
    const { theme } = useTheme()
    const { formattedBalanceSats, formattedBalanceFiat } = useBalance()

    const style = styles(theme)

    return (
        <View style={style.container}>
            <Text medium style={[style.balanceText]}>
                {`${formattedBalanceFiat}`}
            </Text>
            <Text small style={style.balanceText}>
                {`${formattedBalanceSats}`}
            </Text>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            gap: theme.spacing.xxs,
        },
        balanceText: {
            textAlign: 'right',
            color: theme.colors.secondary,
        },
    })

export default Balance
