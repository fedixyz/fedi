import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { useIsFocused } from '@react-navigation/native'
import { useTheme, type Theme } from '@rneui/themed'
import React, { useRef } from 'react'
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
import Flex from '../components/ui/Flex'
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
    const isFocused = useIsFocused()

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

    // NUX steps
    const [hasSeenDisplayName, completeSeenDisplayName] =
        useNuxStep('displayNameModal')
    const [hasSeenCommunity, completeSeenCommunity] =
        useNuxStep('communityModal')

    /**
     * Guards against showing more than one overlay during the current focus.
     * Reset happens synchronously on the first render **after** focus changes to
     * true, ensuring the next overlay can be evaluated in that same render.
     */
    const overlayShownThisFocus = useRef(false)
    const prevIsFocused = useRef(isFocused)

    // Detect focus gain **before** deciding what to show.
    if (isFocused && !prevIsFocused.current) {
        overlayShownThisFocus.current = false
    }
    prevIsFocused.current = isFocused

    // Decide which overlay (if any) to show for this render.
    const showCommunityOverlay =
        !hasSeenCommunity && !overlayShownThisFocus.current
    const showDisplayNameOverlay =
        hasSeenCommunity &&
        !hasSeenDisplayName &&
        !overlayShownThisFocus.current

    // Wrapper handlers: mark overlay as handled once dismissed so nothing else
    // can appear during the same focus.
    const handleCommunityDismiss = () => {
        overlayShownThisFocus.current = true
        completeSeenCommunity()
    }

    const handleDisplayNameDismiss = () => {
        overlayShownThisFocus.current = true
        completeSeenDisplayName()
    }

    // Show placeholder wallet if no federations
    if (federations.length === 0) {
        return <HomeWalletsPlaceholder />
    }

    const style = styles(theme)

    return (
        <View>
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
                </Flex>
            </ScrollView>

            {/* Overlays */}
            <DisplayNameOverlay
                show={showDisplayNameOverlay}
                onDismiss={handleDisplayNameDismiss}
            />

            <FirstTimeCommunityEntryOverlay
                overlayItems={homeFirstTimeOverlayItems}
                title={t('feature.onboarding.one-time-modal-title')}
                show={showCommunityOverlay}
                onDismiss={handleCommunityDismiss}
            />
        </View>
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
            // borderWidth: 1,
        },
    })

export default Home
