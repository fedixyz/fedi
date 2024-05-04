import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { Theme } from '@rneui/themed'
import { useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import {
    selectActiveFederation,
    selectFederationPinnedMessage,
    selectFederations,
    selectIsActiveFederationRecovering,
} from '@fedi/common/redux'

import NoFederations from '../components/feature/federations/NoFederations'
import CommunityChats from '../components/feature/home/CommunityChats'
import HomeWallets from '../components/feature/home/HomeWallets'
import ShortcutsList from '../components/feature/home/ShortcutsList'
import WelcomeMessage from '../components/feature/home/WelcomeMessage'
import RecoveryInProgress from '../components/feature/recovery/RecoveryInProgress'
import { useAppSelector } from '../state/hooks'
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

const Home: React.FC<Props> = ({ offline }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const federations = useAppSelector(selectFederations)
    const recoveryInProgress = useAppSelector(
        selectIsActiveFederationRecovering,
    )
    const activeFederation = useAppSelector(selectActiveFederation)
    const pinnedMessage = useAppSelector(selectFederationPinnedMessage)

    if (federations.length === 0) {
        return <NoFederations />
    }

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
                {activeFederation?.hasWallet && (
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
                )}
                <View style={style.section}>
                    <ErrorBoundary fallback={null}>
                        <ShortcutsList />
                    </ErrorBoundary>
                </View>
                <View style={style.section}>
                    <CommunityChats />
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
            // borderWidth: 1,
        },
    })

export default Home
