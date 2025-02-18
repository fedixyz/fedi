import { Text, Theme, useTheme } from '@rneui/themed'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageBackground, Pressable, StyleSheet, View } from 'react-native'
import type { CameraDeviceFormat } from 'react-native-vision-camera'
import { Camera, useCameraDevice } from 'react-native-vision-camera'

import { useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'

import { Images } from '../../../assets/images'
import {
    saveVideo,
    useBackupRecoveryContext,
} from '../../../state/contexts/BackupRecoveryContext'

const log = makeLog('RecordVideo')

const RecordVideo = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const [isRecording, setIsRecording] = useState(false)
    const camera = useRef<Camera>(null)
    const device = useCameraDevice('front')
    const toast = useToast()

    const { dispatch } = useBackupRecoveryContext()

    function resolution(format: CameraDeviceFormat): number {
        return format.videoWidth * format.videoWidth
    }

    function supports15Fpx(format: CameraDeviceFormat): boolean {
        if (format.maxFps >= 15 && format.maxFps <= 15) return true
        return false
    }

    const format = useMemo<CameraDeviceFormat | undefined>(() => {
        if (device === undefined) return undefined
        const deviceFormat = device.formats.reduce(
            (
                prev: CameraDeviceFormat | undefined,
                curr: CameraDeviceFormat,
            ) => {
                // Initialize
                if (prev === undefined) return curr
                // Filter out formats that don't have video dimensions specified, or are smaller than 100 pixels
                if (curr.videoHeight == null || curr.videoHeight < 100)
                    return prev
                // Filter out formats that don't support 15 frames-per-second
                if (!supports15Fpx(curr)) return prev
                // Find the smallest resolution
                if (resolution(curr) < resolution(prev)) return curr
                else return prev
            },
            undefined,
        )
        if (deviceFormat === undefined) {
            log.error('No suitable camera format found')
            toast.show({
                content: t('feature.backup.record-error'),
                status: 'error',
            })
        }
        return deviceFormat
    }, [device, t, toast])

    if (device === undefined || format === undefined) return null

    const startRecording = async () => {
        setIsRecording(true)
        camera.current?.startRecording({
            onRecordingFinished: video => {
                if (video.size && video.size > 3000) {
                    toast.show({
                        content: t('feature.backup.video-file-too-large'),
                        status: 'error',
                    })
                } else {
                    dispatch(saveVideo(video))
                }
            },
            onRecordingError: error => {
                log.error('onRecordingError', error)
            },
            // FIXME: will this always be available?
            fileType: 'mp4',
            videoCodec: 'h264',
        })
    }

    const stopRecording = async () => {
        setIsRecording(false)
        camera.current?.stopRecording()
    }

    const handleError = (e: Error) => {
        log.error('Camera error', e)
        toast.show({
            content: t('feature.backup.record-error'),
            status: 'error',
        })
    }

    return (
        <View style={styles(theme).container}>
            <ImageBackground
                source={isRecording ? Images.Red : Images.HoloBackground}
                style={styles(theme).gradient}>
                <View style={styles(theme).cameraRing}>
                    <View
                        style={[
                            styles(theme).cameraContainer,
                            isRecording
                                ? styles(theme).recordingActive
                                : styles(theme).recordingInactive,
                        ]}>
                        <Camera
                            style={styles(theme).camera}
                            ref={camera}
                            device={device}
                            isActive={true}
                            video={true}
                            audio={true}
                            format={format}
                            fps={15}
                            videoHdr={false}
                            onError={handleError}
                        />
                    </View>
                </View>
            </ImageBackground>
            <Text
                style={[
                    styles(theme).instructionsText,
                    isRecording ? { color: theme.colors.primaryVeryLight } : {},
                ]}>
                {t('feature.backup.hold-record-button')}
            </Text>
            <ImageBackground
                source={Images.HoloBackground}
                style={styles(theme).promptGradient}>
                <View style={styles(theme).promptContainer}>
                    <Text medium>
                        {'"'}
                        {t('feature.backup.social-backup-video-prompt')}
                        {'"'}
                    </Text>
                </View>
            </ImageBackground>
            <View style={styles(theme).privacyNotice}>
                <Text style={styles(theme).privacyText}>
                    {t('feature.backup.privacy-notice')}
                </Text>
            </View>
            <Pressable
                style={[
                    styles(theme).recordButton,
                    isRecording
                        ? styles(theme).recordingActive
                        : styles(theme).recordingInactive,
                ]}
                onPressOut={stopRecording}
                onPressIn={startRecording}>
                <View style={styles(theme).innerRecordButton} />
            </Pressable>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            width: '100%',
            paddingHorizontal: theme.spacing.md,
        },
        gradient: {
            borderRadius: 1024,
            padding: 4,
            overflow: 'hidden',
            height: theme.sizes.socialBackupCameraHeight,
            width: theme.sizes.socialBackupCameraWidth,
            backgroundColor: theme.colors.red,
        },
        cameraRing: {
            padding: 16,
            borderRadius: 1024,
            overflow: 'hidden',
            backgroundColor: theme.colors.white,
        },
        cameraContainer: {
            borderWidth: 0,
            borderRadius: 1024,
            overflow: 'hidden',
        },
        camera: {
            height: '100%',
            width: '100%',
        },
        instructionsText: {
            textAlign: 'center',
            marginTop: theme.spacing.xl,
        },
        playIconContainer: {
            position: 'absolute',
            justifyContent: 'center',
            alignItems: 'center',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
        },
        recordButton: {
            textAlign: 'center',
            height: theme.sizes.recordButtonOuter,
            width: theme.sizes.recordButtonOuter,
            borderRadius: theme.sizes.recordButtonOuter / 2,
            marginBottom: theme.spacing.xl,
        },
        recordingActive: {
            backgroundColor: theme.colors.red,
            borderColor: theme.colors.red,
        },
        recordingInactive: {
            backgroundColor: theme.colors.primary,
            borderColor: theme.colors.primary,
        },
        innerRecordButton: {
            alignItems: 'center',
            top:
                (theme.sizes.recordButtonOuter -
                    theme.sizes.recordButtonInner) /
                2,
            left:
                (theme.sizes.recordButtonOuter -
                    theme.sizes.recordButtonInner) /
                2,
            height: theme.sizes.recordButtonInner,
            width: theme.sizes.recordButtonInner,
            borderRadius: theme.sizes.recordButtonInner / 2,
            borderWidth: 3,
            borderColor: theme.colors.secondary,
        },
        promptGradient: {
            borderRadius: 16,
            padding: 2,
            width: theme.sizes.socialBackupCameraWidth,
            overflow: 'hidden',
            marginTop: theme.spacing.md,
        },
        promptContainer: {
            padding: 16,
            borderRadius: 12,
            backgroundColor: theme.colors.white,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
        },
        privacyNotice: {
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
        },
        privacyText: {
            color: theme.colors.grey,
        },
    })

export default RecordVideo
