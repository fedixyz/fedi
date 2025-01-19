import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Platform,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native'
import { TemporaryDirectoryPath, exists } from 'react-native-fs'
import Video from 'react-native-video'

import { setSelectedChatMessage } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'
import { scaleAttachment } from '@fedi/common/utils/media'

import { fedimint } from '../../../bridge'
import { useAppDispatch } from '../../../state/hooks'
import { pathJoin, prefixFileUri } from '../../../utils/media'
import SvgImage from '../../ui/SvgImage'

type ChatVideoEventProps = {
    event: MatrixEvent<MatrixEventContentType<'m.video'>>
}

const log = makeLog('ChatVideoEvent')

const ChatVideoEvent: React.FC<ChatVideoEventProps> = ({
    event,
}: ChatVideoEventProps) => {
    const [isLoading, setIsLoading] = useState(true)
    const [isError, setIsError] = useState(false)
    const [uri, setURI] = useState<string>('')
    const [paused, setPaused] = useState(true)
    const { theme } = useTheme()
    const { t } = useTranslation()
    const videoRef = useRef<Video | null>(null)
    const dispatch = useAppDispatch()
    const navigation = useNavigation()

    const resolvedUri = prefixFileUri(uri)

    const handleLongPress = () => {
        dispatch(setSelectedChatMessage(event))
    }

    useEffect(() => {
        const loadVideo = async () => {
            try {
                const destinationPath = pathJoin(
                    TemporaryDirectoryPath,
                    event.content.body,
                )

                const videoPath = await fedimint.matrixDownloadFile(
                    destinationPath,
                    event.content,
                )

                const videoUri = prefixFileUri(videoPath)

                if (await exists(videoUri)) {
                    setURI(videoUri)
                } else {
                    throw new Error('Video does not exist in fs')
                }
            } catch (err) {
                log.error('Failed to load video', err)
                setIsError(true)
            } finally {
                setIsLoading(false)
            }
        }

        loadVideo()
    }, [event.content])

    const style = styles(theme)

    const dimensions = scaleAttachment(
        event.content.info.w,
        event.content.info.h,
        theme.sizes.maxMessageWidth,
        400,
    )

    const videoBaseStyle = [style.videoBase, dimensions]

    return isLoading || !uri || isError ? (
        <View style={videoBaseStyle}>
            {isError ? (
                <View style={style.videoStyle}>
                    <SvgImage name="VideoOff" color={theme.colors.grey} />
                    <Text caption style={style.errorCaption}>
                        {t('errors.failed-to-load-video')}
                    </Text>
                </View>
            ) : (
                <ActivityIndicator />
            )}
        </View>
    ) : (
        <View style={style.videoContainer}>
            <Video
                ref={videoRef}
                source={{ uri: resolvedUri }}
                style={videoBaseStyle}
                onError={() => setIsError(true)}
                paused={paused}
                onFullscreenPlayerDidPresent={() => {
                    setPaused(false)
                }}
                onFullscreenPlayerDidDismiss={() => {
                    setPaused(true)
                }}
                onLoad={() => {
                    videoRef.current?.seek(0)
                }}
            />
            <TouchableOpacity
                style={style.overlay}
                onPress={() => {
                    // Android doesn't have a native fullscreen video player
                    if (Platform.OS === 'android') {
                        navigation.navigate('ChatVideoViewer', { uri })
                    } else {
                        // iOS has a native fullscreen video player
                        videoRef.current?.presentFullscreenPlayer()
                    }
                }}
                onLongPress={handleLongPress}>
                <View style={style.playButton}>
                    <SvgImage name="Play" color={theme.colors.white} />
                </View>
            </TouchableOpacity>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        videoBase: {
            maxWidth: theme.sizes.maxMessageWidth,
            maxHeight: 400,
            backgroundColor: theme.colors.extraLightGrey,
            padding: 16,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
        },
        videoStyle: {
            flexDirection: 'column',
            gap: theme.spacing.md,
            alignItems: 'center',
        },
        errorCaption: {
            color: theme.colors.darkGrey,
        },
        videoContainer: {
            position: 'relative',
        },
        overlay: {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            justifyContent: 'center',
            alignItems: 'center',
        },
        playButton: {
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
        },
    })

export default ChatVideoEvent
