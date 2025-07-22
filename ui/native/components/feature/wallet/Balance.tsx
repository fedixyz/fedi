import { Text, useTheme, type Theme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { useBalance } from '@fedi/common/hooks/amount'

import Flex from '../../ui/Flex'

const Balance: React.FC = () => {
    const { theme } = useTheme()
    const { formattedBalanceSats, formattedBalanceFiat } = useBalance()

    const style = styles(theme)

    return (
        <Flex row align="center" gap="lg">
            <Flex gap="xxs">
                <Text medium style={[style.balanceText]}>
                    {`${formattedBalanceFiat}`}
                </Text>
                <Text small style={style.balanceText}>
                    {`${formattedBalanceSats}`}
                </Text>
            </Flex>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        balanceText: {
            textAlign: 'right',
            color: theme.colors.secondary,
        },
        svgStyle: {
            opacity: 0.7,
        },
    })

export default Balance
