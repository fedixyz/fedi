import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { Theme } from '@rneui/themed'
import { useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { useShouldShowStabilityPool } from '@fedi/common/hooks/federation'
import { selectIsActiveFederationRecovering } from '@fedi/common/redux'

import ShortcutsList from '../components/feature/home/ShortcutsList'
import RecoveryInProgress from '../components/feature/recovery/RecoveryInProgress'
import StabilityWallet from '../components/feature/stabilitypool/StabilityWallet'
import BitcoinWallet from '../components/feature/wallet/BitcoinWallet'
import { useAppSelector } from '../state/hooks'
import type {
    RootStackParamList,
    TabsNavigatorParamList,
} from '../types/navigation'

export type Props =
    | BottomTabScreenProps<
          TabsNavigatorParamList & RootStackParamList,
          'Home'
      > & {
          offline: boolean
      }

const Home: React.FC<Props> = ({ offline }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const recoveryInProgress = useAppSelector(
        selectIsActiveFederationRecovering,
    )
    const showStabilityWallet = useShouldShowStabilityPool()

    return (
        <ScrollView
            contentContainerStyle={styles(theme).container}
            alwaysBounceVertical={false}>
            <View style={styles(theme).wallet}>
                {recoveryInProgress ? (
                    <View style={styles(theme).border}>
                        <RecoveryInProgress
                            label={t(
                                'feature.recovery.recovery-in-progress-balance',
                            )}
                        />
                    </View>
                ) : (
                    <>
                        <BitcoinWallet offline={offline} />
                        {showStabilityWallet && <StabilityWallet />}
                    </>
                )}
            </View>
            <ErrorBoundary fallback={null}>
                <ShortcutsList />
            </ErrorBoundary>
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingTop: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
        },
        wallet: {
            width: '100%',
            minHeight: theme.sizes.walletCardHeight,
        },
        border: {
            padding: theme.spacing.lg,
            width: '100%',
            minHeight: theme.sizes.walletCardHeight,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.colors.extraLightGrey,
        },
    })

export default Home
