import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import PlayIcon from '@fedi/common/assets/svgs/play.svg'
import VideoOff from '@fedi/common/assets/svgs/video-off.svg'
import { MatrixEvent } from '@fedi/common/types'

import { Icon } from '../../components/Icon'
import { Text } from '../../components/Text'
import { useLoadMedia, useScaledDimensions } from '../../hooks/media'
import { styled, theme } from '../../styles'
import { ChatMediaPreview } from './ChatMediaPreview'

interface Props {
    event: MatrixEvent<'m.video'>
}

export const ChatVideoEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()
    const widthRef = useRef<HTMLDivElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const { error, src } = useLoadMedia(event)
    const { id, content } = event
    const { width, height } = useScaledDimensions({
        id,
        originalWidth: content.info?.width ?? 0,
        originalHeight: content.info?.height ?? 0,
        containerRef: widthRef,
    })

    const [showMediaPreview, setShowMediaPreview] = useState(false)

    const handleOnLoad = () => {
        const video = videoRef.current
        if (!video) return

        video.currentTime = 0.1
        video.pause()
    }

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
                    <VideoWrapper style={{ width, height }}>
                        <VideoOverlayWrapper>
                            <PlayButtonIcon icon={PlayIcon} size="md" />
                        </VideoOverlayWrapper>
                        <Video
                            {...(src ? { src } : {})}
                            ref={videoRef}
                            muted
                            playsInline
                            autoPlay
                            preload="metadata"
                            aria-label="video"
                            width={width}
                            height={height}
                            onLoadedData={handleOnLoad}
                        />
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

const Video = styled('video', {
    borderRadius: theme.sizes.xxs,
    display: 'block',
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
