import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import { useCameraDevices } from 'react-native-vision-camera'

import BackupVideoRecorder from '../components/feature/backup/BackupVideoRecorder'
import CameraPermissionsRequired from '../components/feature/scan/CameraPermissionsRequired'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'RecordBackupVideo'
>

const RecordBackupVideo: React.FC<Props> = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    const devices = useCameraDevices()
    const device = devices.front

    return (
        <CameraPermissionsRequired
            requireMicrophone
            alternativeActionButton={null}
            message={t('feature.backup.camera-access-information')}>
            <ScrollView contentContainerStyle={styles(theme).container}>
                {device === null ? (
                    <ActivityIndicator />
                ) : (
                    <BackupVideoRecorder />
                )}
            </ScrollView>
        </CameraPermissionsRequired>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            paddingVertical: theme.spacing.xl,
        },
    })

export default RecordBackupVideo
