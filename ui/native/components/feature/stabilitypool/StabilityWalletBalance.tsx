import type { Theme } from '@rneui/themed'
import { Text, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { selectStableBalancePending } from '@fedi/common/redux/wallet'

import { useAppSelector, useStabilityPool } from '../../../state/hooks'

const Balance: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const stableBalancePending = useAppSelector(selectStableBalancePending)
    const { formattedStableBalance, formattedStableBalancePending } =
        useStabilityPool()
    const formattedPending =
        stableBalancePending > 0
            ? '+' + formattedStableBalancePending
            : formattedStableBalancePending

    const style = styles(theme)

    return (
        <View style={style.container}>
            <View style={style.balanceContainer}>
                <Text
                    medium
                    style={style.balanceText}
                    adjustsFontSizeToFit
                    numberOfLines={1}>
                    {`${formattedStableBalance}`}
                </Text>
                {stableBalancePending !== 0 && (
                    <Text
                        small
                        style={style.balanceText}
                        adjustsFontSizeToFit
                        numberOfLines={1}>
                        {t('feature.stabilitypool.amount-pending', {
                            amount: formattedPending,
                        })}
                    </Text>
                )}
            </View>
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
