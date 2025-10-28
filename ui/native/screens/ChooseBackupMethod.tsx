import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet } from 'react-native'

import { selectDoesAnyFederationHaveSocialBackup } from '@fedi/common/redux'

import HoloCard from '../components/ui/HoloCard'
import LineBreak from '../components/ui/LineBreak'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ChooseBackupMethod'
>

// TODO: When social backup is out of beta, use this screen to let the user choose between personal and social backup
// when coming from CreatePinInstructions
const ChooseBackupMethod: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const doesAnyFederationHaveSocialBackup = useAppSelector(
        selectDoesAnyFederationHaveSocialBackup,
    )
    const showSocialRecovery = doesAnyFederationHaveSocialBackup

    // TODO: Uncomment when bridge function is ready
    // const { locateRecoveryFile } = useBridge()
    //
    // const checkForExistingSocialBackup = async (): Promise<boolean> => {
    //     try {
    //         await locateRecoveryFile()
    //         return true
    //     } catch (error) {
    //         return false
    //     }
    // }

    const handleStartSocialBackup = async () => {
        navigation.navigate('CompleteSocialBackup')
        // TODO: Implement this when bridge function is ready
        // const backupFound = await checkForExistingSocialBackup()

        // if (backupFound) {
        //     // TODO: navigate to SocialBackupCloudUpload when it's implemented
        //     navigation.navigate('CompleteSocialBackup')
        // } else {
        //     navigation.navigate('StartSocialBackup')
        // }
    }

    const handleStartPersonalBackup = () => {
        navigation.navigate('RecoveryWords')
    }

    return (
        <ScrollView contentContainerStyle={styles(theme).container}>
            <Text style={styles(theme).instructionsText}>
                {t('feature.backup.choose-method-instructions')}
            </Text>
            {showSocialRecovery && (
                <HoloCard
                    iconImage={<SvgImage name="SocialPeople" />}
                    title={t('feature.backup.social-backup')}
                    body={
                        <>
                            <Text
                                style={styles(theme).backupMethodInstructions}>
                                {t('feature.backup.social-backup-instructions')}
                            </Text>
                            <Button
                                title={t('feature.backup.start-social-backup')}
                                containerStyle={
                                    styles(theme).backupMethodButton
                                }
                                onPress={handleStartSocialBackup}
                            />
                        </>
                    }
                />
            )}

            <LineBreak />
            <HoloCard
                iconImage={<SvgImage name="Note" />}
                title={t('feature.backup.personal-backup')}
                body={
                    <>
                        <Text style={styles(theme).backupMethodInstructions}>
                            {t('feature.backup.personal-backup-instructions')}
                        </Text>
                        <Button
                            title={t('feature.backup.start-personal-backup')}
                            containerStyle={styles(theme).backupMethodButton}
                            onPress={handleStartPersonalBackup}
                        />
                    </>
                }
            />
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: theme.spacing.xl,
        },
        backupMethodButton: {
            width: '100%',
            marginTop: theme.spacing.md,
        },
        backupMethodInstructions: {
            textAlign: 'center',
            fontWeight: '400',
            paddingVertical: theme.spacing.xs,
        },
        instructionsText: {
            textAlign: 'center',
            marginBottom: theme.spacing.xl,
            paddingHorizontal: theme.spacing.lg,
            fontWeight: '400',
        },
    })

export default ChooseBackupMethod
