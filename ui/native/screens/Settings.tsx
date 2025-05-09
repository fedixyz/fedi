import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'

import {
    selectAlphabeticallySortedFederations,
    selectDeveloperMode,
    selectHasSetMatrixDisplayName,
    selectMatrixAuth,
} from '@fedi/common/redux'

import { CommunitySettings } from '../components/feature/settings/CommunitySettings'
import { GeneralSettings } from '../components/feature/settings/GeneralSettings'
import { UserQr } from '../components/feature/settings/UserQr'
import { VersionContainer } from '../components/feature/settings/VersionContainer'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>

const Settings: React.FC<Props> = () => {
    const { theme } = useTheme()
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const hasSetMatrixDisplayName = useAppSelector(
        selectHasSetMatrixDisplayName,
    )

    const { t } = useTranslation()
    const [unlockDevModeCount, setUnlockDevModeCount] = useState<number>(0)

    const developerMode = useAppSelector(selectDeveloperMode)
    const style = styles(theme)

    const sortedFederations = useAppSelector(
        selectAlphabeticallySortedFederations,
    )

    return (
        <ScrollView contentContainerStyle={style.container}>
            {hasSetMatrixDisplayName && <UserQr matrixUser={matrixAuth} />}
            <View style={style.section}>
                <Text color={theme.colors.night} style={style.sectionTitle}>
                    {t('words.general')}
                </Text>
                <GeneralSettings />
            </View>
            {sortedFederations.length > 0 && (
                <View style={style.section}>
                    <Text color={theme.colors.night} style={style.sectionTitle}>
                        {t('words.federations')}
                    </Text>
                    {sortedFederations.map(federation => (
                        <CommunitySettings
                            key={federation.id}
                            community={federation}
                        />
                    ))}
                </View>
            )}
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
            justifyContent: 'space-evenly',
            padding: theme.spacing.lg,
            paddingTop: 0,
        },
        section: {
            paddingTop: theme.spacing.lg,
            gap: theme.spacing.lg,
        },
        sectionTitle: {
            color: theme.colors.night,
        },
    })

export default Settings
