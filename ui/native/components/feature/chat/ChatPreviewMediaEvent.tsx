import { BlurView } from '@react-native-community/blur'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native'
import Video, { VideoRef } from 'react-native-video'

import { MatrixEvent } from '@fedi/common/types'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'
import { scaleAttachment } from '@fedi/common/utils/media'

import SvgImage from '../../ui/SvgImage'

type ChatImageEventProps = {
    event: MatrixEvent<MatrixEventContentType<'xyz.fedi.preview-media'>>
}

/**
 * A blurred placeholder image/video that appears upon sending media in chat
 * Disappears after the actual ChatImageEvent / ChatVideoEvent gets loaded
 */
const ChatPreviewMediaEvent: React.FC<ChatImageEventProps> = ({
    event,
}: ChatImageEventProps) => {
    const [isError, setIsError] = useState(false)
    const { theme } = useTheme()
    const { t } = useTranslation()

    const videoRef = useRef<VideoRef | null>(null)

    const style = styles(theme)

    const dimensions = scaleAttachment(
        event.content.info.w,
        event.content.info.h,
        theme.sizes.maxMessageWidth,
        400,
    )

    const containerBaseStyle = [style.containerBase, dimensions]

    return isError ? (
        <View style={containerBaseStyle}>
            {isError ? (
                <View style={style.mediaError}>
                    <SvgImage name="ImageOff" color={theme.colors.grey} />
                    <Text caption style={style.errorCaption}>
                        {t('errors.failed-to-load-image')}
                    </Text>
                </View>
            ) : (
                <ActivityIndicator />
            )}
        </View>
    ) : (
        <View style={containerBaseStyle}>
            {event.content.info.mimetype.startsWith('image') ? (
                <Image
                    source={{ uri: event.content.info.uri }}
                    onError={() => setIsError(true)}
                    style={style.absolute}
                />
            ) : (
                <Video
                    ref={videoRef}
                    source={{ uri: event.content.info.uri }}
                    onError={() => setIsError(true)}
                    paused
                    onLoad={() => {
                        videoRef.current?.seek(0)
                    }}
                    style={style.absolute}
                />
            )}
            <BlurView
                style={style.absolute}
                blurType="light"
                blurAmount={10}
                reducedTransparencyFallbackColor="white"
            />
            <View style={[style.absolute, style.loaderContainer]}>
                {/* TODO: add progress spinner when bridge functions available */}
                <ActivityIndicator color="black" />
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        containerBase: {
            maxWidth: theme.sizes.maxMessageWidth,
            maxHeight: 400,
            backgroundColor: theme.colors.extraLightGrey,
            padding: 16,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
        },
        mediaError: {
            flexDirection: 'column',
            gap: theme.spacing.md,
            alignItems: 'center',
        },
        absolute: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
        },
        errorCaption: {
            color: theme.colors.darkGrey,
        },
        loaderContainer: {
            alignItems: 'center',
            justifyContent: 'center',
        },
    })

export default ChatPreviewMediaEvent
