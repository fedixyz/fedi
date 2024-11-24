import type { Theme } from '@rneui/themed'
import { Text, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'

import { useBalance } from '@fedi/common/hooks/amount'
import SvgImage from '../../ui/SvgImage'

const Balance: React.FC = () => {
    const { theme } = useTheme()
    const { formattedBalanceSats, formattedBalanceFiat } = useBalance()

    const style = styles(theme)

    return (
        <View style={style.container}>
            <View style={style.balanceContainer}>
                <Text medium style={[style.balanceText]}>
                    {`${formattedBalanceFiat}`}
                </Text>
                <Text small style={style.balanceText}>
                    {`${formattedBalanceSats}`}
                </Text>
            </View>
            <SvgImage
                name="ChevronRightSmall"
                color={theme.colors.secondary}
                dimensions={{ width: 10, height: 18 }}
                svgProps={{ style: style.svgStyle }}
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.lg,
        },
        balanceContainer: {
            gap: theme.spacing.xxs,
        },
        balanceText: {
            textAlign: 'right',
            color: theme.colors.secondary,
        },
        svgStyle: {
            opacity: 0.7,
        },
    })

export default Balance
