import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native'

import {
    selectAlphabeticallySortedCommunities,
    selectAlphabeticallySortedWalletFederations,
    selectDeveloperMode,
    selectMatrixAuth,
} from '@fedi/common/redux'

import CommunityMenu from '../components/feature/settings/CommunityMenu'
import FederationMenu from '../components/feature/settings/FederationMenu'
import { GeneralSettings } from '../components/feature/settings/GeneralSettings'
import { UserQr } from '../components/feature/settings/UserQr'
import { VersionContainer } from '../components/feature/settings/VersionContainer'
import Flex from '../components/ui/Flex'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>

const Settings: React.FC<Props> = () => {
    const { theme } = useTheme()
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const { t } = useTranslation()
    const [unlockDevModeCount, setUnlockDevModeCount] = useState<number>(0)

    const developerMode = useAppSelector(selectDeveloperMode)
    const style = styles(theme)

    const sortedWalletFederations = useAppSelector(
        selectAlphabeticallySortedWalletFederations,
    )
    const sortedCommunities = useAppSelector(
        selectAlphabeticallySortedCommunities,
    )

    return (
        <ScrollView
            testID="UserQrContainer"
            contentContainerStyle={style.container}>
            <Flex gap="lg">
                {/* in case matrix is not initialized yet */}
                {matrixAuth ? (
                    <UserQr matrixUser={matrixAuth} />
                ) : (
                    <ActivityIndicator />
                )}
                <Flex gap="lg">
                    <Text color={theme.colors.night} style={style.sectionTitle}>
                        {t('words.general')}
                    </Text>
                    <GeneralSettings />
                </Flex>
                {sortedWalletFederations.length > 0 && (
                    <Flex gap="lg">
                        <Text
                            color={theme.colors.night}
                            style={style.sectionTitle}>
                            {t('words.federations')}
                        </Text>
                        {sortedWalletFederations.map(federation => (
                            <FederationMenu
                                testID={federation.name}
                                key={federation.id}
                                federation={federation}
                            />
                        ))}
                    </Flex>
                )}
                {sortedCommunities.length > 0 && (
                    <Flex gap="lg">
                        <Text
                            color={theme.colors.night}
                            style={style.sectionTitle}>
                            {t('words.communities')}
                        </Text>
                        {sortedCommunities.map(federation => (
                            <CommunityMenu
                                testID={federation.name}
                                key={federation.id}
                                community={federation}
                            />
                        ))}
                    </Flex>
                )}
            </Flex>
            <VersionContainer
                unlockDevModeCount={unlockDevModeCount}
                setUnlockDevModeCount={setUnlockDevModeCount}
                developerMode={developerMode}
            />
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.lg,
        },
        sectionTitle: {
            color: theme.colors.night,
        },
    })

export default Settings
