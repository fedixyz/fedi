import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import PlayIcon from '@fedi/common/assets/svgs/play.svg'
import VideoOff from '@fedi/common/assets/svgs/video-off.svg'
import { MatrixEvent } from '@fedi/common/types'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'
import { scaleAttachment } from '@fedi/common/utils/media'

import { Icon } from '../../components/Icon'
import { Text } from '../../components/Text'
import { useLoadMedia } from '../../hooks/media'
import { styled, theme } from '../../styles'
import { ChatMediaPreview } from './ChatMediaPreview'

interface Props {
    event: MatrixEvent<MatrixEventContentType<'m.video'>>
}

const MAX_HEIGHT = 400

export const ChatVideoEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()
    const { error, src } = useLoadMedia(event)

    const widthRef = useRef<HTMLDivElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)

    const [showMediaPreview, setShowMediaPreview] = useState(false)
    const [scaledWidth, setScaledWidth] = useState<number>(0)
    const [scaledHeight, setScaledHeight] = useState<number>(0)
    const [dataLoaded, setDataLoaded] = useState(false)

    useEffect(() => {
        if (!src) return
        if (!widthRef.current) return

        const wrapper = widthRef.current
        const { width, height } = scaleAttachment(
            event.content.info.w,
            event.content.info.h,
            wrapper.clientWidth,
            MAX_HEIGHT,
        )

        setScaledWidth(width)
        setScaledHeight(height)
    }, [event.content, src])

    // autoplay is required for iOS so it shows initial video frame
    // but also means Android will autoplay (which we don't want)
    useEffect(() => {
        if (!src) return
        if (!videoRef.current) return

        const video = videoRef.current

        const handleLoad = () => {
            video.pause()
            video.currentTime = 0.1

            // Creates a slightly nicer ux by waiting
            setTimeout(() => setDataLoaded(true), 200)
        }

        video.addEventListener('loadeddata', handleLoad)
        return () => video.removeEventListener('loadeddata', handleLoad)
    }, [src])

    if (error) {
        return (
            <Error>
                <Icon icon={VideoOff} size="sm" />
                <Text variant="small" css={{ color: theme.colors.black }}>
                    {t('errors.failed-to-load-video')}
                </Text>
            </Error>
        )
    }

    return (
        <>
            {/* This ref allows us to get the full width of the parent */}
            {/* * so that we can scale the video to fit the width */}
            <FullWidthRef ref={widthRef} />
            <ChatMediaPreview
                open={showMediaPreview}
                onOpenChange={setShowMediaPreview}
                src={src}
                name={event.content.body}
                trigger={
                    <VideoWrapper>
                        {!dataLoaded && (
                            <VideoPlaceholder
                                style={{
                                    width: scaledWidth,
                                    height: scaledHeight,
                                }}
                            />
                        )}
                        {dataLoaded && (
                            <VideoOverlayWrapper>
                                <PlayButtonIcon icon={PlayIcon} size="md" />
                            </VideoOverlayWrapper>
                        )}
                        {src && (
                            <Video
                                ref={videoRef}
                                autoPlay // required
                                src={src}
                                muted
                                playsInline
                                preload="metadata"
                                aria-label="video"
                                width={scaledWidth}
                                height={scaledHeight}
                            />
                        )}
                    </VideoWrapper>
                }>
                {src && (
                    <PreviewVideo
                        src={src}
                        autoPlay
                        playsInline
                        aria-label="preview-video"
                    />
                )}
            </ChatMediaPreview>
        </>
    )
}

const FullWidthRef = styled('div', {
    flex: 1,
    visibility: 'visible',
    width: '100%',
})

const VideoWrapper = styled('div', {
    alignItems: 'center',
    background: theme.colors.extraLightGrey,
    borderRadius: theme.sizes.xxs,
    display: 'flex',
    justifyContent: 'center',
    position: 'relative',
})

const VideoPlaceholder = styled('div', {
    background: theme.colors.extraLightGrey,
    borderRadius: theme.sizes.xxs,
    position: 'absolute',
})

const Video = styled('video', {
    borderRadius: theme.sizes.xxs,
})

const VideoOverlayWrapper = styled('div', {
    background: 'rgba(0, 0, 0, 0.6)',
    borderRadius: '50%',
    left: '50%',
    padding: 10,
    position: 'absolute',
    top: '50%',
    transform: 'translate(-50%, -50%)',
})

const PlayButtonIcon = styled(Icon, {
    color: theme.colors.white,
    height: 24,
    width: 24,
})

const PreviewVideo = styled('video', {
    height: 'auto',
    width: '100%',
})

const Error = styled('div', {
    alignItems: 'center',
    background: theme.colors.extraLightGrey,
    borderRadius: theme.sizes.xxs,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    height: 150,
    padding: 10,
    textAlign: 'center',
    width: '100%',
})
