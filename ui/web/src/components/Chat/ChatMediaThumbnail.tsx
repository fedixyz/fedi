import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

import CloseIcon from '@fedi/common/assets/svgs/close.svg'

import { styled, theme } from '../../styles'
import { Icon } from '../Icon'

type Props = {
    file: File
    onRemove(): void
}

const THUMBNAIL_SIZE = 40

export const ChatMediaThumbnail: React.FC<Props> = ({ file, onRemove }) => {
    const videoRef = useRef<HTMLVideoElement>(null)

    const [src, setSrc] = useState<string | null>(null)

    useEffect(() => {
        const url = URL.createObjectURL(file)

        setSrc(url)

        return () => {
            URL.revokeObjectURL(url)
        }
    }, [file])

    useEffect(() => {
        if (!src) return

        if (!videoRef.current) return
        const video = videoRef.current

        // Prevent Android from autoplaying
        // autoplay is required for iOS so it shows image
        const handleLoad = () => {
            video.pause()
            video.currentTime = 0.1
        }

        video.addEventListener('loadeddata', handleLoad)
        return () => video.removeEventListener('loadeddata', handleLoad)
    }, [src])

    if (!src) return null

    return (
        <ThumbnailWrapper>
            <RemoveIconWrapper aria-label="remove-button" onClick={onRemove}>
                <RemoveIcon icon={CloseIcon} size={16} />
            </RemoveIconWrapper>
            {file.type.startsWith('image/') ? (
                <ImageThumbnail
                    src={src}
                    alt="image-thumbnail"
                    width={0}
                    height={0}
                />
            ) : (
                <VideoThumbnail
                    ref={videoRef}
                    autoPlay // required
                    src={src}
                    muted
                    preload="metadata"
                    aria-label="video-thumbnail"
                />
            )}
        </ThumbnailWrapper>
    )
}

const ThumbnailWrapper = styled('div', {
    background: theme.colors.extraLightGrey,
    borderRadius: 4,
    height: THUMBNAIL_SIZE,
    position: 'relative',
    width: THUMBNAIL_SIZE,
})

const RemoveIconWrapper = styled('div', {
    alignItems: 'center',
    background: theme.colors.black,
    borderRadius: '50%',
    display: 'flex',
    height: 16,
    justifyContent: 'center',
    position: 'absolute',
    right: -6,
    top: -6,
    width: 16,
    zIndex: 10,
})

const RemoveIcon = styled(Icon, {
    color: theme.colors.white,
})

const ImageThumbnail = styled(Image, {
    height: '100%',
    objectFit: 'cover',
    width: '100%',
})

const VideoThumbnail = styled('video', {
    height: '100%',
    objectFit: 'cover',
    width: '100%',
})
