import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import PlayIcon from '@fedi/common/assets/svgs/play.svg'
import VideoOff from '@fedi/common/assets/svgs/video-off.svg'
import { MatrixEvent } from '@fedi/common/types'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'

import { Icon } from '../../components/Icon'
import { Text } from '../../components/Text'
import { useLoadMedia } from '../../hooks/media'
import { keyframes, styled, theme } from '../../styles'
import { ChatMediaPreview } from './ChatMediaPreview'

interface Props {
    event: MatrixEvent<MatrixEventContentType<'m.video'>>
}

export const ChatVideoEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()
    const { error, src } = useLoadMedia(event)
    const [showMediaPreview, setShowMediaPreview] = useState(false)
    const videoRef = useRef<HTMLVideoElement>(null)

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.defaultMuted = true
        }
    }, [])

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

    if (!src) {
        return <Video />
    }

    return (
        <ChatMediaPreview
            open={showMediaPreview}
            onOpenChange={setShowMediaPreview}
            trigger={
                <VideoWrapper aria-label="video">
                    <PlayButtonWrapper>
                        <PlayButtonIcon icon={PlayIcon} size="md" />
                    </PlayButtonWrapper>
                    <Video ref={videoRef} muted>
                        <source src={src} type={event.content.info.mimetype} />
                    </Video>
                </VideoWrapper>
            }>
            <PreviewVideo autoPlay playsInline aria-label="preview-video">
                <source src={src} type={event.content.info.mimetype} />
            </PreviewVideo>
        </ChatMediaPreview>
    )
}

const fadeIn = keyframes({
    '0%': { opacity: 0 },
    '100%': { opacity: 1 },
})

const VideoWrapper = styled('div', {
    position: 'relative',
})

const PlayButtonWrapper = styled('div', {
    background: 'rgba(0, 0, 0, 0.6)',
    borderRadius: '50%',
    left: '50%',
    padding: 8,
    position: 'absolute',
    top: '50%',
    transform: 'translate(-50%, -50%)',
})

const PlayButtonIcon = styled(Icon, {
    color: theme.colors.white,
    height: 32,
    width: 32,
})

const Video = styled('video', {
    animation: `${fadeIn} 200ms ease`,
    height: 'auto',
    maxHeight: 300,
    width: '100%',
})

const PreviewVideo = styled('video', {
    animation: `${fadeIn} 200ms ease`,
    height: 'auto',
    width: '100%',
})

const Error = styled('div', {
    background: theme.colors.extraLightGrey,
    padding: 10,
    textAlign: 'center',
})
