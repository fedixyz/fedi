import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { Theme } from '@rneui/themed'
import { useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { useNuxStep } from '@fedi/common/hooks/nux'
import {
    selectFederationPinnedMessage,
    selectFederations,
    selectIsActiveFederationRecovering,
} from '@fedi/common/redux'

import { useCommonSelector } from '../../common/hooks/redux'
import FirstTimeCommunityEntryOverlay, {
    FirstTimeCommunityEntryItem,
} from '../components/feature/federations/FirstTimeCommunityEntryOverlay'
import CommunityChats from '../components/feature/home/CommunityChats'
import DisplayNameOverlay from '../components/feature/home/DisplayNameOverlay'
import HomeWallets from '../components/feature/home/HomeWallets'
import HomeWalletsPlaceholder from '../components/feature/home/HomeWalletsPlaceholder'
import ShortcutsList from '../components/feature/home/ShortcutsList'
import WelcomeMessage from '../components/feature/home/WelcomeMessage'
import RecoveryInProgress from '../components/feature/recovery/RecoveryInProgress'
import type {
    RootStackParamList,
    TabsNavigatorParamList,
} from '../types/navigation'

export type Props = BottomTabScreenProps<
    TabsNavigatorParamList & RootStackParamList,
    'Home'
> & {
    offline: boolean
}

const Home: React.FC<Props> = ({ offline }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const federations = useCommonSelector(selectFederations)
    const recoveryInProgress = useCommonSelector(
        selectIsActiveFederationRecovering,
    )
    const pinnedMessage = useCommonSelector(selectFederationPinnedMessage)

    const homeFirstTimeOverlayItems: FirstTimeCommunityEntryItem[] = [
        {
            icon: 'Wallet',
            text: t('feature.onboarding.one-time-modal-option-1'),
        },
        {
            icon: 'CommunityOutline',
            text: t('feature.onboarding.one-time-modal-option-2'),
        },
    ]

    const [hasSeenDisplayName, completeSeenDisplayName] =
        useNuxStep('displayNameModal')
    const [hasSeenCommunity, completeSeenCommunity] =
        useNuxStep('communityModal')
    const [showCommunityOverlay, setShowCommunityOverlay] = useState(false)

    // Chain community overlay after display name is seen
    // After display name overlay is dismissed, trigger community overlay
    useEffect(() => {
        if (hasSeenDisplayName && !hasSeenCommunity) {
            const timer = setTimeout(() => setShowCommunityOverlay(true), 550)
            return () => clearTimeout(timer)
        }
    }, [hasSeenDisplayName, hasSeenCommunity])

    // Show placeholder wallet if no federations
    if (federations.length === 0) {
        return <HomeWalletsPlaceholder />
    }

    const style = styles(theme)
    return (
        <View style={style.bottomView}>
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
                            <HomeWallets offline={offline} />
                        )}
                    </View>

                    <View style={style.section}>
                        <CommunityChats />
                    </View>

                    <View style={style.section}>
                        <ErrorBoundary fallback={null}>
                            <ShortcutsList />
                        </ErrorBoundary>
                    </View>
                </View>
            </ScrollView>

            {/* Overlays */}
            <DisplayNameOverlay
                show={!hasSeenDisplayName}
                onDismiss={completeSeenDisplayName}
            />

            <FirstTimeCommunityEntryOverlay
                overlayItems={homeFirstTimeOverlayItems}
                title={t('feature.onboarding.one-time-modal-title')}
                show={showCommunityOverlay && !hasSeenCommunity}
                onDismiss={() => {
                    completeSeenCommunity()
                    setShowCommunityOverlay(false)
                }}
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        bottomView: {},
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
            // borderWidth: 1,
        },
    })

export default Home
