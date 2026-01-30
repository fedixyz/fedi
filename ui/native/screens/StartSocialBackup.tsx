import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Linking, StyleSheet } from 'react-native'

import { Images } from '../assets/images'
import { Column } from '../components/ui/Flex'
import GradientView from '../components/ui/GradientView'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import type { RootStackParamList } from '../types/navigation'
import { useCameraPermission, useMicrophonePermission } from '../utils/hooks'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StartSocialBackup'
>

const StartSocialBackup: React.FC<Props> = ({ navigation, route }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const { cameraPermission, requestCameraPermission } = useCameraPermission()
    const { microphonePermission, requestMicrophonePermission } =
        useMicrophonePermission()

    const isBlocked =
        cameraPermission === 'blocked' || microphonePermission === 'blocked'
    const isDenied =
        cameraPermission === 'denied' || microphonePermission === 'denied'
    const isGranted =
        cameraPermission === 'granted' && microphonePermission === 'granted'

    const { federationId } = route.params

    const style = styles(theme)

    const handleOnStart = async () => {
        navigation.navigate('RecordBackupVideo', {
            federationId,
        })
    }

    const requestPermissions = async () => {
        await Promise.all([
            requestCameraPermission(),
            requestMicrophonePermission(),
        ])
    }

    return (
        <SafeAreaContainer edges="bottom">
            <Column grow style={style.container}>
                <Column grow center gap="lg">
                    <GradientView
                        variant="sky-banner"
                        style={style.iconWrapper}>
                        <Image
                            source={Images.SocialRecoveryIcon}
                            style={{ width: 60, height: 60 }}
                        />
                    </GradientView>
                    <Text h2 bold center>
                        {t('feature.backup.social-backup')}
                    </Text>
                    <Text center style={{ color: theme.colors.darkGrey }}>
                        {t('feature.backup.start-social-backup-desc')}
                    </Text>
                    <Text center style={{ color: theme.colors.darkGrey }}>
                        {t('feature.backup.start-social-backup-warning')}
                    </Text>
                </Column>
                <Column gap="md">
                    {isBlocked && (
                        <>
                            <Text
                                center
                                small
                                style={{ color: theme.colors.darkGrey }}>
                                {t(
                                    'feature.backup.start-social-backup-permissions-text',
                                )}
                            </Text>
                            <Button
                                fullWidth
                                title="Open Settings"
                                onPress={Linking.openSettings}
                            />
                        </>
                    )}

                    {isDenied && (
                        <>
                            <Text
                                center
                                small
                                style={{ color: theme.colors.darkGrey }}>
                                {t(
                                    'feature.backup.start-social-backup-permissions-text',
                                )}
                            </Text>
                            <Button
                                fullWidth
                                title={t('words.start')}
                                onPress={requestPermissions}
                            />
                        </>
                    )}

                    {isGranted && (
                        <Button
                            fullWidth
                            title={t('words.start')}
                            onPress={handleOnStart}
                        />
                    )}
                </Column>
            </Column>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.lg,
        },
        iconWrapper: {
            alignItems: 'center',
            borderRadius: '100%',
            display: 'flex',
            justifyContent: 'center',
            height: 120,
            width: 120,
        },
    })

export default StartSocialBackup
