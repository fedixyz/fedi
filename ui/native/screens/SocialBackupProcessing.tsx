import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { uploadBackupFile } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { Column } from '../components/ui/Flex'
import HoloProgressCircle from '../components/ui/HoloProgressCircle'
import { useAppDispatch } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('SocialBackupProcessing')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'SocialBackupProcessing'
>

const SocialBackupProcessing: React.FC<Props> = ({
    navigation,
    route,
}: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const toast = useToast()
    const { videoFilePath, federationId } = route.params
    const [percentComplete, setPercentComplete] = useState<number>(0)
    const [uploadStarted, setUploadStarted] = useState(false)

    useEffect(() => {
        // FIXME: this is broken until the backend allows us to re-upload
        const startBackupFileUpload = async () => {
            setUploadStarted(true)
            try {
                if (!federationId) throw new Error('No federation ID')

                await dispatch(
                    uploadBackupFile({
                        fedimint,
                        federationId,
                        videoFilePath,
                    }),
                )
            } catch (error) {
                log.error('startBackupFileUpload', error)
                toast.error(t, error)
            }
        }

        // Only upload backup file once
        if (!uploadStarted) {
            startBackupFileUpload()
        }
    }, [
        navigation,
        toast,
        videoFilePath,
        uploadStarted,
        dispatch,
        federationId,
        setUploadStarted,
        t,
        fedimint,
    ])

    // TODO: Remove this simulation when bridge is emitting events
    useEffect(() => {
        if (percentComplete === 100) {
            // TODO: navigate to SocialBackupCloudUpload when it's implemented
            navigation.replace('CompleteSocialBackup')
        }
        const interval = setInterval(() => {
            setPercentComplete(percentComplete + 1)
        }, 50)

        return () => clearInterval(interval)
    }, [navigation, percentComplete])

    const style = styles(theme)

    return (
        <Column grow center style={style.container}>
            <HoloProgressCircle percentComplete={percentComplete} />
            <Text style={style.label}>
                <Trans
                    i18nKey="feature.backup.creating-recovery-file"
                    components={{
                        bold: <Text bold />,
                    }}
                />
            </Text>
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.xl,
        },
        label: {
            textAlign: 'center',
            marginVertical: theme.spacing.xl,
            paddingHorizontal: theme.spacing.xl,
        },
    })

export default SocialBackupProcessing
