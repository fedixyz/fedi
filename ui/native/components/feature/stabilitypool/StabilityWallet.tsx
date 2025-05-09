import { useNavigation } from '@react-navigation/native'
import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { LinearGradientProps } from 'react-native-linear-gradient'

import { useIsStabilityPoolEnabledByFederation } from '@fedi/common/hooks/federation'
import { useNuxStep } from '@fedi/common/hooks/nux'
import { useMonitorStabilityPool } from '@fedi/common/hooks/stabilitypool'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectFederationBalance,
    selectMaxStableBalanceSats,
    selectStableBalance,
    selectStableBalancePending,
    selectStableBalanceSats,
} from '@fedi/common/redux'

import { fedimint } from '../../../bridge'
import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import WalletButtons from '../../feature/wallet/WalletButtons'
import { BubbleCard } from '../../ui/BubbleView'
import StabilityWalletBalance from './StabilityWalletBalance'
import StabilityWalletTitle from './StabilityWalletTitle'

const StabilityWallet: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const toast = useToast()

    const [hasOpenedStabilityPool] = useNuxStep('hasOpenedStabilityPool')
    useMonitorStabilityPool(fedimint)

    const stabilityPoolDisabledByFederation =
        !useIsStabilityPoolEnabledByFederation()
    const stableBalance = useAppSelector(selectStableBalance)
    const stableBalanceSats = useAppSelector(selectStableBalanceSats)
    const stableBalancePending = useAppSelector(selectStableBalancePending)
    const maxStableBalanceSats = useAppSelector(selectMaxStableBalanceSats)
    const balance = useAppSelector(selectFederationBalance)

    const style = styles(theme)
    const gradientProps: LinearGradientProps = {
        colors: ['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.0)'],
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
    }

    const handleDeposit = () => {
        if (stabilityPoolDisabledByFederation) {
            toast.show({
                content: t(
                    'feature.stabilitypool.deposits-disabled-by-federation',
                ),
                status: 'error',
            })
        } else if (
            maxStableBalanceSats &&
            stableBalanceSats > maxStableBalanceSats
        ) {
            toast.show({
                content: t('feature.stabilitypool.max-stable-balance-amount'),
                status: 'error',
            })
        } else if (stableBalancePending < 0) {
            toast.show({
                content: t('feature.stabilitypool.pending-withdrawal-blocking'),
                status: 'error',
            })
        } else {
            navigation.navigate('StabilityDeposit')
        }
    }

    const handleWithdraw = () => {
        if (stableBalancePending < 0) {
            toast.show({
                content: t('feature.stabilitypool.pending-withdrawal-blocking'),
                status: 'error',
            })
        } else {
            navigation.navigate('StabilityWithdraw')
        }
    }

    return (
        <BubbleCard
            linearGradientProps={gradientProps}
            containerStyle={style.card}>
            <Pressable
                style={style.header}
                onPress={() =>
                    navigation.navigate(
                        hasOpenedStabilityPool
                            ? 'StabilityHome'
                            : 'StableBalanceIntro',
                    )
                }>
                {/* Icon, title, and chevron grouped together */}
                <View style={style.leftGroup}>
                    <StabilityWalletTitle />
                </View>
                {/* Balance on the right */}
                <StabilityWalletBalance />
            </Pressable>

            <View style={style.buttons}>
                <WalletButtons
                    offline={false} //used for 'SendOfflineAmount' - not relevant for StabilityWallet so hardcoded false
                    left={{
                        label: t('words.deposit'),
                        onPress: handleDeposit,
                        disabled: balance === 0,
                    }}
                    right={{
                        label: t('words.withdraw'),
                        onPress: handleWithdraw,
                        disabled:
                            stableBalance === 0 && stableBalancePending === 0,
                    }}
                />
            </View>
        </BubbleCard>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        card: {
            backgroundColor: theme.colors.mint,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        /** Allow the title group to shrink so the balance never gets clipped */
        leftGroup: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            flexShrink: 1,
            minWidth: 0,
        },
        buttons: {
            // marginTop: theme.spacing.lg,
        },
        chevron: {
            left: -58, // align with title text; matches placeholder offset
        },
    })

export default StabilityWallet
