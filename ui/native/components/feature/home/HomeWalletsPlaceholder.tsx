import type { Theme } from '@rneui/themed'
import { useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import {
    selectFederationPinnedMessage,
    selectIsActiveFederationRecovering,
} from '@fedi/common/redux'

import ShortcutsListPlaceholder from '../../../components/feature/home/ShortcutListPlaceholder'
import WelcomeMessage from '../../../components/feature/home/WelcomeMessage'
import RecoveryInProgress from '../../../components/feature/recovery/RecoveryInProgress'
import BitcoinWalletPlaceholder from '../../../components/feature/wallet/BitcoinWalletPlaceholder'
import StabilityWalletPlaceholder from '../../../components/feature/wallet/StabilityWalletPlaceholder'
import { useAppSelector } from '../../../state/hooks'
import CommunityChatsPlaceholder from './CommunityChatsPlaceholder'

const HomeWalletsPlaceholder: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const recoveryInProgress = useAppSelector(
        selectIsActiveFederationRecovering,
    )
    const pinnedMessage = useAppSelector(selectFederationPinnedMessage)

    const style = styles(theme)

    return (
        <ScrollView
            contentContainerStyle={style.container}
            alwaysBounceVertical={false}>
            <View style={style.content}>
                {pinnedMessage && (
                    <View style={style.section}>
                        <WelcomeMessage message={pinnedMessage} />
                    </View>
                )}
                <View style={style.section}>
                    {recoveryInProgress ? (
                        <View style={style.recovery}>
                            <RecoveryInProgress
                                label={t(
                                    'feature.recovery.recovery-in-progress-balance',
                                )}
                            />
                        </View>
                    ) : (
                        <View style={style.wallets}>
                            <BitcoinWalletPlaceholder />
                            <StabilityWalletPlaceholder />
                        </View>
                    )}
                </View>
                <View style={style.section}>
                    <CommunityChatsPlaceholder />
                </View>
                <View style={style.section}>
                    <ErrorBoundary fallback={null}>
                        <ShortcutsListPlaceholder />
                    </ErrorBoundary>
                </View>
            </View>
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            justifyContent: 'flex-start',
            marginTop: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.xl,
            width: '100%',
        },
        content: {
            width: '100%',
            gap: theme.spacing.lg,
        },
        recovery: {
            minHeight: theme.sizes.walletCardHeight,
            borderRadius: 20,
            borderColor: theme.colors.extraLightGrey,
        },
        section: {
            // Uncomment the following line to debug section boundaries:
            // borderWidth: 1,
        },
        wallets: {
            gap: theme.spacing.lg,
        },
    })

export default HomeWalletsPlaceholder
