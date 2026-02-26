import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { useIsFocused } from '@react-navigation/native'
import { useTheme, type Theme } from '@rneui/themed'
import React, { useRef } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import {
    selectShouldShowAutojoinedCommunityNotice,
    selectLastSelectedCommunity,
} from '@fedi/common/redux'
import { getFederationPinnedMessage } from '@fedi/common/utils/FederationUtils'

import AnalyticsConsentOverlay from '../components/feature/home/AnalyticsConsentOverlay'
import AutojoinedCommunityNotice from '../components/feature/home/AutojoinedCommunityNotice'
import CommunityChats from '../components/feature/home/CommunityChats'
import PinnedMessage from '../components/feature/home/PinnedMessage'
import ShortcutsList from '../components/feature/home/ShortcutsList'
import SurveyOverlay from '../components/feature/home/SurveyOverlay'
import { Column } from '../components/ui/Flex'
import { useAppSelector } from '../state/hooks'
import type {
    RootStackParamList,
    TabsNavigatorParamList,
} from '../types/navigation'

export type Props = BottomTabScreenProps<
    TabsNavigatorParamList & RootStackParamList,
    'Home'
>

const Home: React.FC<Props> = () => {
    const { theme } = useTheme()
    const isFocused = useIsFocused()
    const selectedCommunity = useAppSelector(selectLastSelectedCommunity)

    const pinnedMessage = getFederationPinnedMessage(
        selectedCommunity?.meta || {},
    )
    const shouldShowAutojoinedCommunityNotice = useAppSelector(s =>
        selectShouldShowAutojoinedCommunityNotice(
            s,
            selectedCommunity?.id || '',
        ),
    )

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

    const style = styles(theme)

    // TODO: handle if we can't join fedi global community?
    if (!selectedCommunity) return null

    return (
        <View>
            <ScrollView
                contentContainerStyle={style.container}
                alwaysBounceVertical={false}>
                <Column gap="lg" fullWidth>
                    {shouldShowAutojoinedCommunityNotice && (
                        <AutojoinedCommunityNotice
                            communityId={selectedCommunity.id}
                        />
                    )}
                    {pinnedMessage && <PinnedMessage message={pinnedMessage} />}

                    <CommunityChats />

                    <ErrorBoundary fallback={null}>
                        <ShortcutsList communityId={selectedCommunity.id} />
                    </ErrorBoundary>
                </Column>
            </ScrollView>

            {/* Overlays */}
            <SurveyOverlay />

            <AnalyticsConsentOverlay />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: theme.spacing.lg,
            paddingBottom: theme.spacing.xl,
            width: '100%',
        },
    })

export default Home
