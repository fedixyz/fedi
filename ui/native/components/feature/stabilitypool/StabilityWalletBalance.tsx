import { Text, useTheme, type Theme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { selectStableBalancePending } from '@fedi/common/redux/wallet'

import { useAppSelector, useStabilityPool } from '../../../state/hooks'
import Flex from '../../ui/Flex'

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
        <Flex row align="center" gap="lg">
            <Flex gap="xxs">
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
