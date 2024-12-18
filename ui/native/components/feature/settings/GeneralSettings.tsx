import { EULA_URL } from '@fedi/common/constants/tos'
import { useNuxStep } from '@fedi/common/hooks/nux'
import { selectDeveloperMode } from '@fedi/common/redux/environment'
import { useNavigation } from '@react-navigation/native'
import { Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet, View } from 'react-native'
import { usePinContext } from '../../../state/contexts/PinContext'
import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import SettingsItem from './SettingsItem'

export const GeneralSettings = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)
    const navigation = useNavigation<NavigationHook>()

    const developerMode = useAppSelector(selectDeveloperMode)
    const [hasPerformedPersonalBackup] = useNuxStep(
        'hasPerformedPersonalBackup',
    )
    const showSocialRecovery =
        useAppSelector(s => s.federation.authenticatedGuardian) !== null
    const { status } = usePinContext()

    const createOrManagePin = () => {
        if (hasPerformedPersonalBackup && status === 'set') {
            navigation.navigate('PinAccess')
        } else if (hasPerformedPersonalBackup) {
            navigation.navigate('SetPin')
        } else {
            navigation.navigate('CreatePinInstructions')
        }
    }

    return (
        <View style={style.container}>
            {developerMode && (
                <SettingsItem
                    icon="FediLogoIcon"
                    label={'Developer Settings'}
                    onPress={() => navigation.navigate('DeveloperSettings')}
                />
            )}
            <SettingsItem
                icon="User"
                label={t('phrases.edit-profile')}
                onPress={() => navigation.navigate('EditProfileSettings')}
            />
            <SettingsItem
                icon="Apps"
                label={t('feature.fedimods.fedi-mods')}
                onPress={() =>
                    navigation.navigate('FediModSettings', { type: 'fedi' })
                }
            />
            <SettingsItem
                icon="Language"
                label={t('words.language')}
                onPress={() => navigation.navigate('LanguageSettings')}
            />
            <SettingsItem
                icon="Usd"
                label={t('phrases.display-currency')}
                onPress={() => navigation.navigate('CurrencySettings')}
            />
            <SettingsItem
                icon="Note"
                label={t('feature.backup.personal-backup')}
                onPress={() => navigation.navigate('StartPersonalBackup')}
            />
            {showSocialRecovery && (
                <SettingsItem
                    icon="SocialPeople"
                    label={t('feature.recovery.recovery-assist')}
                    onPress={() => {
                        navigation.navigate('StartRecoveryAssist')
                    }}
                />
            )}
            <SettingsItem
                icon="LockSecurity"
                label={t('feature.pin.pin-access')}
                onPress={createOrManagePin}
            />
            <SettingsItem
                icon="Nostr"
                label={t('feature.nostr.nostr-settings')}
                onPress={() => navigation.navigate('NostrSettings')}
            />
            <SettingsItem
                icon="Bug"
                label={t('feature.bug.report-a-bug')}
                onPress={() => navigation.navigate('BugReport')}
            />
            <SettingsItem
                icon="SpeakerPhone"
                label={t('feature.notifications.notification-settings')}
                onPress={() => Linking.openSettings()}
            />
            <SettingsItem
                icon="Scroll"
                label={t('phrases.fedi-app-terms-of-service')}
                actionIcon="ExternalLink"
                onPress={() => Linking.openURL(EULA_URL)}
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            backgroundColor: theme.colors.offWhite100,
            borderRadius: theme.borders.settingsRadius,
            padding: theme.spacing.xs,
        },
        sectionTitle: {
            color: theme.colors.night,
            paddingVertical: theme.spacing.sm,
        },
    })
