import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import * as Progress from 'react-native-progress'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useIsStabilityPoolEnabledByFederation } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectFederationBalance,
    selectMaxStableBalanceSats,
    selectStableBalance,
    selectStableBalancePending,
    selectStableBalanceSats,
} from '@fedi/common/redux'
import { makePendingBalanceText } from '@fedi/common/utils/wallet'

import { StabilityBitcoinBanner } from '../components/feature/wallet/StabilityBitcoinBanner'
import { useAppSelector, useStabilityPool } from '../state/hooks'
import type { NavigationHook, RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'StabilityHome'>

const StabilityHome: React.FC<Props> = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const toast = useToast()
    const { width } = useWindowDimensions()
    const navigation = useNavigation<NavigationHook>()
    const stableBalance = useAppSelector(selectStableBalance)
    const stableBalanceSats = useAppSelector(selectStableBalanceSats)
    const stableBalancePending = useAppSelector(selectStableBalancePending)
    const stabilityPoolDisabledByFederation =
        !useIsStabilityPoolEnabledByFederation()
    const maxStableBalanceSats = useAppSelector(selectMaxStableBalanceSats)
    const balance = useAppSelector(selectFederationBalance)

    const { formattedStableBalance, formattedStableBalancePending } =
        useStabilityPool()

    const style = styles(theme)

    return (
        <SafeAreaView
            style={style.container}
            edges={{ left: 'additive', right: 'additive', bottom: 'maximum' }}>
            <StabilityBitcoinBanner />
            <View style={style.content}>
                <View style={style.balanceContainer}>
                    <Progress.Circle
                        progress={1}
                        color={
                            stableBalance > 0
                                ? theme.colors.green
                                : theme.colors.primaryVeryLight
                        }
                        thickness={theme.sizes.stabilityPoolCircleThickness}
                        size={width - theme.spacing.lg * 2}
                        borderWidth={1}
                    />
                    <View style={style.balanceTextContainer}>
                        <Text h1 h1Style={style.balanceText}>
                            {`${formattedStableBalance}`}
                        </Text>
                        {stableBalancePending !== 0 && (
                            <Text small style={style.balancePendingText}>
                                {makePendingBalanceText(
                                    t,
                                    stableBalancePending,
                                    formattedStableBalancePending,
                                )}
                            </Text>
                        )}
                    </View>
                </View>
                <View style={style.buttonContainer}>
                    <Button
                        containerStyle={style.button}
                        onPress={() => {
                            // Block deposits if the stability pool is disabled by the federation
                            if (stabilityPoolDisabledByFederation) {
                                toast.show({
                                    content: t(
                                        'feature.stabilitypool.deposits-disabled-by-federation',
                                    ),
                                    status: 'error',
                                })
                            }
                            // Block deposits if the max stable balance amount is reached
                            else if (
                                maxStableBalanceSats &&
                                stableBalanceSats > maxStableBalanceSats
                            ) {
                                toast.show({
                                    content: t(
                                        'feature.stabilitypool.max-stable-balance-amount',
                                    ),
                                    status: 'error',
                                })
                            }
                            // Block deposits if pending balance is negative because we have to wait until pending withdrawals have processed
                            else if (stableBalancePending < 0) {
                                toast.show({
                                    content: t(
                                        'feature.stabilitypool.pending-withdrawal-blocking',
                                    ),
                                    status: 'error',
                                })
                            } else {
                                navigation.navigate('StabilityDeposit')
                            }
                        }}
                        title={
                            <Text medium caption style={style.buttonText}>
                                {t('words.deposit')}
                            </Text>
                        }
                        disabled={balance === 0}
                    />
                    <Button
                        containerStyle={style.button}
                        onPress={() => {
                            // Block withdrawals if pending balance is negative because we have to wait until pending withdrawals have processed
                            if (stableBalancePending < 0) {
                                toast.show({
                                    content: t(
                                        'feature.stabilitypool.pending-withdrawal-blocking',
                                    ),
                                    status: 'error',
                                })
                            } else {
                                navigation.navigate('StabilityWithdraw')
                            }
                        }}
                        title={
                            <Text medium caption style={style.buttonText}>
                                {t('words.withdraw')}
                            </Text>
                        }
                        // TODO: implement withdrawals && compare against minimum withdraw amount
                        disabled={
                            stableBalance === 0 && stableBalancePending === 0
                        }
                    />
                </View>
            </View>
        </SafeAreaView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
        },
        content: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.lg,
        },
        balanceContainer: {
            flex: 1,
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
        },
        balanceTextContainer: {
            position: 'absolute',
            flexDirection: 'column',
            alignItems: 'center',
        },
        balanceText: {
            flex: 1,
        },
        balancePendingText: {
            flex: 1,
        },
        buttonContainer: {
            width: '100%',
            flexDirection: 'row',
            marginTop: 'auto',
            gap: 20,
        },
        button: {
            flex: 1,
        },
        buttonText: {
            color: theme.colors.secondary,
        },
    })

export default StabilityHome
