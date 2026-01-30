import { Text, Theme, useTheme } from '@rneui/themed'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, Pressable, StyleSheet, View } from 'react-native'
import {
    Camera,
    useCameraDevice,
    type CameraDeviceFormat,
} from 'react-native-vision-camera'

import { useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'

import {
    saveVideo,
    useBackupRecoveryContext,
} from '../../../state/contexts/BackupRecoveryContext'
import { Column } from '../../ui/Flex'
import GradientView from '../../ui/GradientView'

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
            <Column align="center" gap="lg" grow>
                <View
                    style={[
                        styles(theme).cameraRing,
                        {
                            borderColor: isRecording
                                ? theme.colors.red
                                : theme.colors.extraLightGrey,
                        },
                    ]}>
                    <View style={styles(theme).cameraContainer}>
                        {device ? (
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
                        ) : (
                            <View style={styles(theme).cameraPlaceholder} />
                        )}
                    </View>
                </View>
                <Text style={{ color: theme.colors.darkGrey }}>
                    {t('feature.backup.record-video-tip')}
                </Text>

                <Text style={{ color: theme.colors.darkGrey }}>
                    {t('feature.backup.record-video-prompt')}
                </Text>

                <GradientView
                    variant="sky-banner"
                    style={{ borderRadius: 5, padding: theme.spacing.sm }}>
                    <Text medium>
                        {t('feature.backup.record-video-sentence')}
                    </Text>
                </GradientView>
            </Column>

            <Column align="center" gap="md">
                <Text style={{ color: theme.colors.darkGrey }}>
                    {isRecording
                        ? t('words.recording')
                        : t('feature.backup.record-video-hold-text')}
                </Text>

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
            </Column>
        </View>
    )
}

const screenWidth = Dimensions.get('screen').width
const ringSize = Math.min(300, screenWidth - 40)

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            flex: 1,
            gap: theme.spacing.lg,
            width: '100%',
        },
        cameraRing: {
            backgroundColor: theme.colors.white,
            borderRadius: '100%',
            borderWidth: 3,
            height: ringSize,
            overflow: 'hidden',
            padding: theme.spacing.md,
            width: ringSize,
        },
        cameraContainer: {
            borderRadius: '100%',
            height: '100%',
            width: '100%',
            overflow: 'hidden',
        },
        camera: {
            height: '100%',
            width: '100%',
        },
        cameraPlaceholder: {
            alignItems: 'center',
            backgroundColor: theme.colors.darkGrey,
            display: 'flex',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
        },
        recordButton: {
            textAlign: 'center',
            height: theme.sizes.recordButtonOuter,
            width: theme.sizes.recordButtonOuter,
            borderRadius: theme.sizes.recordButtonOuter / 2,
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
    })

export default RecordVideo
