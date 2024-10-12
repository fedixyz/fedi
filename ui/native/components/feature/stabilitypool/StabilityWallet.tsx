import { useNavigation } from '@react-navigation/native'
import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { LinearGradientProps } from 'react-native-linear-gradient'

import { useNuxStep } from '@fedi/common/hooks/nux'
import { useMonitorStabilityPool } from '@fedi/common/hooks/stabilitypool'

import { fedimint } from '../../../bridge'
import { NavigationHook } from '../../../types/navigation'
import { BubbleCard } from '../../ui/BubbleView'
import StabilityWalletBalance from './StabilityWalletBalance'
import StabilityWalletTitle from './StabilityWalletTitle'

const StabilityWallet: React.FC = () => {
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()

    const [hasOpenedStabilityPool] = useNuxStep('hasOpenedStabilityPool')

    // React Navigation should keep this mounted even when clicking into the StabilityHome screen so the monitor will continue to run
    useMonitorStabilityPool(fedimint)

    const style = styles(theme)
    const gradientProps: LinearGradientProps = {
        colors: ['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.0)'],
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
    }

    return (
        <BubbleCard
            linearGradientProps={gradientProps}
            containerStyle={style.card}>
            <Pressable
                style={style.container}
                onPress={() =>
                    navigation.navigate(
                        hasOpenedStabilityPool
                            ? 'StabilityHome'
                            : 'StableBalanceIntro',
                    )
                }>
                <StabilityWalletTitle />
                <StabilityWalletBalance />
            </Pressable>
        </BubbleCard>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        card: {
            backgroundColor: theme.colors.mint,
        },
        container: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
    })

export default StabilityWallet
