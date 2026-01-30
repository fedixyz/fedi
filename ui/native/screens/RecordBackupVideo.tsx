import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { useCameraDevice } from 'react-native-vision-camera'

import BackupVideoRecorder from '../components/feature/backup/BackupVideoRecorder'
import { Column } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'RecordBackupVideo'
>

const RecordBackupVideo: React.FC<Props> = ({ navigation, route }) => {
    const { theme } = useTheme()
    const { federationId } = route.params

    const style = styles(theme)

    const onConfirmVideo = (videoFilePath: string) => {
        navigation.navigate('SocialBackupProcessing', {
            videoFilePath,
            federationId,
        })
    }

    const device = useCameraDevice('front')

    return (
        <SafeAreaContainer edges="bottom">
            <Column grow style={style.container}>
                {!device ? (
                    <Column center grow>
                        <ActivityIndicator size="large" />
                    </Column>
                ) : (
                    <BackupVideoRecorder onConfirmVideo={onConfirmVideo} />
                )}
            </Column>
        </SafeAreaContainer>
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
