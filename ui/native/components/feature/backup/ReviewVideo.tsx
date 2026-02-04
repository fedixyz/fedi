import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import RNFS from 'react-native-fs'
import Video, { VideoRef } from 'react-native-video'

import { makeLog } from '@fedi/common/utils/log'

import {
    resetVideo,
    useBackupRecoveryContext,
} from '../../../state/contexts/BackupRecoveryContext'
import { Column } from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

const log = makeLog('ReviewVideo')

type Props = {
    onConfirmVideo: (videoFilePath: string) => void
}

const ReviewVideo = ({ onConfirmVideo }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { width: screenWidth } = useWindowDimensions()
    const { state, dispatch } = useBackupRecoveryContext()

    const [isPaused, setIsPaused] = useState(true)
    const [confirmingVideo, setConfirmingVideo] = useState(false)
    const videoFile = state.videoFile
    const videoRef = useRef<VideoRef | null>(null)

    const ringSize = Math.min(300, screenWidth - 40)

    useEffect(() => {
        const copyVideoAndProceed = async () => {
            try {
                if (!videoFile) throw new Error('No video file found')

                const exists = await RNFS.exists(videoFile.path)
                if (!exists) throw new Error('Source video missing')

                const filename = `${Math.random().toString(20)}.mp4`
                const dest = `${RNFS.CachesDirectoryPath}/${filename}`

                await RNFS.copyFile(videoFile.path, dest)

                onConfirmVideo(dest)
            } catch (e) {
                log.error('copyVideoAndProceed', e)
                return
            }
        }
        if (confirmingVideo) {
            copyVideoAndProceed()
        }
    }, [confirmingVideo, onConfirmVideo, videoFile])

    return (
        <View style={styles(theme).container}>
            <Column align="center" gap="lg" grow>
                <View
                    style={[
                        styles(theme).cameraRing,
                        { height: ringSize, width: ringSize },
                    ]}>
                    <View style={styles(theme).cameraContainer}>
                        <Video
                            ref={videoRef}
                            source={{ uri: videoFile?.path }} // Can be a URL or a local file.
                            style={styles(theme).video}
                            paused={isPaused}
                            ignoreSilentSwitch={'ignore'}
                            resizeMode={'cover'}
                            onError={error => {
                                log.error('Video onError', error)
                            }}
                            onEnd={() => setIsPaused(true)}
                        />
                        {isPaused && (
                            <Pressable
                                style={styles(theme).playIconContainer}
                                onPress={() => {
                                    videoRef.current?.seek(0)
                                    setIsPaused(false)
                                }}>
                                <SvgImage
                                    name="Play"
                                    size={SvgImageSize.lg}
                                    color={theme.colors.white}
                                />
                            </Pressable>
                        )}
                    </View>
                </View>

                <Text center style={{ color: theme.colors.darkGrey }}>
                    {t('feature.backup.confirm-video-text')}
                </Text>
            </Column>
            <Column gap="md">
                <Button
                    fullWidth
                    title={t('feature.backup.confirm-backup-video')}
                    onPress={() => setConfirmingVideo(true)}
                />
                <Button
                    fullWidth
                    title={t('feature.backup.record-again')}
                    onPress={() => dispatch(resetVideo())}
                    type="clear"
                />
            </Column>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
        },
        cameraRing: {
            backgroundColor: theme.colors.white,
            borderColor: theme.colors.green500,
            borderRadius: '100%',
            borderWidth: 3,
            overflow: 'hidden',
            padding: theme.spacing.md,
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
        playIconContainer: {
            position: 'absolute',
            justifyContent: 'center',
            alignItems: 'center',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
        },
        video: {
            height: '100%',
            width: '100%',
        },
    })

export default ReviewVideo
