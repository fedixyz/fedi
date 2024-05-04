import { useNavigation } from '@react-navigation/native'
import { Theme } from '@rneui/themed'
import { Card, Text, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { useNuxStep } from '@fedi/common/hooks/nux'
import { useMonitorStabilityPool } from '@fedi/common/hooks/stabilitypool'
import { selectCurrency, selectStableBalancePending } from '@fedi/common/redux'

import { fedimint } from '../../../bridge'
import { useAppSelector, useStabilityPool } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import SvgImage from '../../ui/SvgImage'
import { CurrencyAvatar } from './CurrencyAvatar'

const StabilityWallet: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const selectedCurrency = useAppSelector(selectCurrency)
    const stableBalancePending = useAppSelector(selectStableBalancePending)

    const { formattedStableBalance, formattedStableBalancePending } =
        useStabilityPool()

    const [hasOpenedStabilityPool] = useNuxStep('hasOpenedStabilityPool')

    // React Navigation should keep this mounted even when clicking into the StabilityHome screen so the monitor will continue to run
    useMonitorStabilityPool(fedimint)

    const style = styles(theme)
    return (
        <Pressable
            style={style.container}
            onPress={() =>
                navigation.navigate(
                    hasOpenedStabilityPool
                        ? 'StabilityHome'
                        : 'StableBalanceIntro',
                )
            }>
            <Card
                containerStyle={style.cardContainer}
                wrapperStyle={style.cardWrapper}>
                <View style={style.titleContainer}>
                    <CurrencyAvatar />
                    <Text bold style={style.titleText}>
                        {`${selectedCurrency} ${t('words.balance')}`}
                    </Text>
                    <View style={style.amountContainer}>
                        <Text medium style={style.balanceText}>
                            {`${formattedStableBalance}`}
                        </Text>
                        {stableBalancePending !== 0 && (
                            <Text small style={style.balanceText}>
                                {t('feature.stabilitypool.amount-pending', {
                                    amount:
                                        stableBalancePending > 0
                                            ? '+' +
                                              formattedStableBalancePending
                                            : formattedStableBalancePending,
                                })}
                            </Text>
                        )}
                    </View>
                    <SvgImage
                        name="ChevronRight"
                        color={theme.colors.primary}
                    />
                </View>
            </Card>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            width: '100%',
            marginTop: theme.spacing.lg,
        },
        balanceText: {
            color: theme.colors.primary,
            marginLeft: 'auto',
            paddingHorizontal: theme.spacing.sm,
            textAlign: 'right',
        },
        cardContainer: {
            borderRadius: theme.borders.defaultRadius,
            backgroundColor: theme.colors.offWhite,
            padding: theme.spacing.lg,
            borderWidth: 0,
            shadowColor: 'transparent',
            margin: 0,
        },
        cardWrapper: {
            flex: 1,
            justifyContent: 'space-between',
            gap: theme.spacing.lg,
        },
        titleContainer: {
            textAlign: 'left',
            flexDirection: 'row',
            alignItems: 'center',
        },
        titleText: {
            color: theme.colors.primary,
            paddingHorizontal: theme.spacing.sm,
            flex: 1,
        },
        amountContainer: {
            display: 'flex',
            gap: theme.spacing.xs,
            flexDirection: 'column',
            justifyContent: 'center',
        },
        button: {
            backgroundColor: theme.colors.secondary,
        },
    })

export default StabilityWallet
