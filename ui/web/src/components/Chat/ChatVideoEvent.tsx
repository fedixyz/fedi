import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
    const originalWidth = content.info?.width ?? 0
    const originalHeight = content.info?.height ?? 0
    const { width, height } = useScaledDimensions({
        id,
        originalWidth,
        originalHeight,
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
                <Icon icon="VideoOff" size="sm" />
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
                            <PlayButtonIcon icon="Play" size="md" />
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
                        width={originalWidth || width}
                        height={originalHeight || height}
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
    display: 'grid',
    height: 48,
    left: '50%',
    placeItems: 'center',
    position: 'absolute',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 48,
})

const PlayButtonIcon = styled(Icon, {
    color: theme.colors.white,
    height: 24,
    transform: 'translateX(1px)',
    width: 24,
})

const PreviewVideo = styled('video', {
    height: 'auto',
    maxHeight: 'calc(100vh - 96px)',
    maxWidth: 'calc(100vw - 32px)',
    objectFit: 'contain',
    width: 'auto',

    '@sm': {
        height: 'calc(100vh - 96px)',
        maxWidth: '100vw',
        width: '100vw',
    },

    '@supports (height: 100dvh)': {
        maxHeight: 'calc(100dvh - 96px)',
        maxWidth: 'calc(100dvw - 32px)',

        '@sm': {
            height: 'calc(100dvh - 96px)',
            maxWidth: '100dvw',
            width: '100dvw',
        },
    },
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
