import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageBackground, Pressable, StyleSheet, View } from 'react-native'
import RNFS from 'react-native-fs'
import Video, { VideoRef } from 'react-native-video'

import { makeLog } from '@fedi/common/utils/log'

import { Images } from '../../../assets/images'
import {
    resetVideo,
    useBackupRecoveryContext,
} from '../../../state/contexts/BackupRecoveryContext'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

const log = makeLog('ReviewVideo')

const ReviewVideo = () => {
    const { t } = useTranslation()
    const navigation = useNavigation()
    const { theme } = useTheme()
    const [isPaused, setIsPaused] = useState(true)
    const [confirmingVideo, setConfirmingVideo] = useState(false)
    const { state, dispatch } = useBackupRecoveryContext()
    const videoFile = state.videoFile
    const videoRef = useRef<VideoRef | null>(null)

    useEffect(() => {
        const copyVideoAndProceed = async () => {
            try {
                if (!videoFile) throw new Error('No video file found')

                // Copy file to our temp directory so rust can read it
                const filename = Math.random().toString(20)
                const dest = `${RNFS.TemporaryDirectoryPath}/${filename}.mp4`
                await RNFS.copyFile(videoFile.path, dest)
                navigation.navigate('SocialBackupProcessing', {
                    videoFilePath: dest,
                })
            } catch (e) {
                log.error('copy failed', e)
                return
            }
        }
        if (confirmingVideo) {
            setTimeout(() => {
                copyVideoAndProceed()
            })
        }
    }, [confirmingVideo, navigation, videoFile])

    return (
        <View style={styles(theme).container}>
            <ImageBackground
                source={Images.HoloBackground}
                style={styles(theme).gradient}>
                <View style={styles(theme).cameraRing}>
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
            </ImageBackground>

            <Text style={styles(theme).instructionsText}>
                {t('feature.backup.please-review-backup-video')}
            </Text>

            <View style={styles(theme).buttonsContainer}>
                <Button
                    title={t('feature.backup.record-again')}
                    onPress={() => dispatch(resetVideo())}
                    type="clear"
                />

                <Button
                    title={t('feature.backup.confirm-backup-video')}
                    onPress={() => setConfirmingVideo(true)}
                    containerStyle={styles(theme).confirmButton}
                />
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'space-evenly',
            width: '100%',
        },
        buttonsContainer: {
            marginTop: 'auto',
            alignItems: 'center',
            width: '100%',
        },
        confirmButton: {
            marginTop: theme.spacing.md,
            width: '100%',
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
        confirmationContainer: {
            flex: 1,
            alignItems: 'flex-start',
            paddingHorizontal: 0,
            marginHorizontal: 0,
        },
        checkboxText: {
            paddingHorizontal: theme.spacing.md,
            textAlign: 'left',
        },
        instructionsText: {
            textAlign: 'center',
            marginTop: theme.spacing.lg,
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
