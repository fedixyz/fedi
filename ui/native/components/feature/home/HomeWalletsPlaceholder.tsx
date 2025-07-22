import { useTheme, type Theme } from '@rneui/themed'
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
import Flex from '../../ui/Flex'
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
            <Flex gap="lg" fullWidth>
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
                        <Flex gap="lg">
                            <BitcoinWalletPlaceholder />
                            <StabilityWalletPlaceholder />
                        </Flex>
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
            </Flex>
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
        recovery: {
            minHeight: theme.sizes.walletCardHeight,
            borderRadius: 20,
            borderColor: theme.colors.extraLightGrey,
        },
        section: {
            // Uncomment the following line to debug section boundaries:
            // borderWidth: 1,
        },
    })

export default HomeWalletsPlaceholder
