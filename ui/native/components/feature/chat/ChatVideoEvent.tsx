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
import Video, { VideoRef } from 'react-native-video'

import {
    selectPreviewMediaMatchingEventContent,
    setSelectedChatMessage,
} from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { scaleAttachment } from '@fedi/common/utils/media'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { useDownloadResource } from '../../../utils/hooks/media'
import { Column } from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'

type ChatVideoEventProps = {
    event: MatrixEvent<'m.video'>
    isInViewport?: boolean
}

const ChatVideoEvent: React.FC<ChatVideoEventProps> = ({
    event,
    isInViewport = true,
}: ChatVideoEventProps) => {
    // If the user sends a video, try to find the preview image matching the `event.content` to derive the existing URI
    const matchingPreviewVideo = useAppSelector(s =>
        selectPreviewMediaMatchingEventContent(s, event.content),
    )
    const { uri, isError, setIsError, handleCopyResource } =
        useDownloadResource(event, { loadResourceInitially: false })
    const [paused, setPaused] = useState(true)
    const { theme } = useTheme()
    const { t } = useTranslation()
    const videoRef = useRef<VideoRef | null>(null)
    const dispatch = useAppDispatch()
    const navigation = useNavigation()

    const resolvedUri = matchingPreviewVideo?.media?.uri ?? uri ?? ''

    const handleLongPress = () => {
        dispatch(setSelectedChatMessage(event))
    }

    const style = styles(theme)

    const dimensions = scaleAttachment(
        event.content.info?.width ?? 0,
        event.content.info?.height ?? 0,
        theme.sizes.maxMessageWidth,
        400,
    )

    const videoBaseStyle = [style.videoBase, dimensions]

    useEffect(() => {
        if (resolvedUri || !isInViewport) return

        handleCopyResource()
    }, [resolvedUri, isInViewport, handleCopyResource])

    if (resolvedUri)
        return (
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
                    resizeMode="cover"
                    // Prevents videos from being layered over each other
                    useTextureView
                />
                <TouchableOpacity
                    style={style.overlay}
                    onPress={() => {
                        // Android doesn't have a native fullscreen video player
                        if (Platform.OS === 'android') {
                            navigation.navigate('ChatVideoViewer', {
                                uri: resolvedUri,
                            })
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

    if (isError)
        return (
            <View style={videoBaseStyle}>
                <Column align="center" gap="md">
                    <SvgImage name="VideoOff" color={theme.colors.grey} />
                    <Text caption style={style.errorCaption}>
                        {t('errors.failed-to-load-video')}
                    </Text>
                </Column>
            </View>
        )

    return (
        <View style={videoBaseStyle}>
            <ActivityIndicator />
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
