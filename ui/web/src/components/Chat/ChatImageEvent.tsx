import Image from 'next/image'
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MatrixEvent } from '@fedi/common/types'

import { Icon } from '../../components/Icon'
import { Text } from '../../components/Text'
import { useLoadMedia, useScaledDimensions } from '../../hooks/media'
import { styled, theme } from '../../styles'
import { ChatMediaPreview } from './ChatMediaPreview'

interface Props {
    event: MatrixEvent<'m.image'>
}

export const ChatImageEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()
    const widthRef = useRef<HTMLDivElement>(null)
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

    if (error) {
        return (
            <Error>
                <Icon icon="ImageOff" size="sm" />
                <Text variant="small" css={{ color: theme.colors.black }}>
                    {t('errors.failed-to-load-image')}
                </Text>
            </Error>
        )
    }

    return (
        <>
            <FullWidthRef ref={widthRef} />
            <ChatMediaPreview
                open={showMediaPreview}
                onOpenChange={setShowMediaPreview}
                src={src}
                name={event.content.body}
                trigger={
                    <ImgWrapper style={{ width, height }}>
                        {src && (
                            <Img
                                src={src}
                                alt="image"
                                width={width}
                                height={height}
                            />
                        )}
                    </ImgWrapper>
                }>
                {src && (
                    <PreviewImg
                        src={src}
                        alt="preview-image"
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
    visibility: 'hidden',
    width: '100%',
})

const ImgWrapper = styled('div', {
    alignItems: 'center',
    background: theme.colors.extraLightGrey,
    borderRadius: theme.sizes.xxs,
    display: 'flex',
    justifyContent: 'center',
    position: 'relative',
})

const Img = styled(Image, {
    borderRadius: theme.sizes.xxs,
})

const PreviewImg = styled(Image, {
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
