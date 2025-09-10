import Image from 'next/image'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ImageOff from '@fedi/common/assets/svgs/image-off.svg'
import { MatrixEvent } from '@fedi/common/types'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'
import { scaleAttachment } from '@fedi/common/utils/media'

import { Icon } from '../../components/Icon'
import { Text } from '../../components/Text'
import { useLoadMedia } from '../../hooks/media'
import { styled, theme } from '../../styles'
import { ChatMediaPreview } from './ChatMediaPreview'

interface Props {
    event: MatrixEvent<MatrixEventContentType<'m.image'>>
}

const MAX_HEIGHT = 400

export const ChatImageEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()
    const { error, src } = useLoadMedia(event)

    const widthRef = useRef<HTMLDivElement>(null)

    const [scaledWidth, setScaledWidth] = useState<number>(0)
    const [scaledHeight, setScaledHeight] = useState<number>(0)
    const [showMediaPreview, setShowMediaPreview] = useState(false)
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

    if (error) {
        return (
            <Error>
                <Icon icon={ImageOff} size="sm" />
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
                    <ImgWrapper>
                        {!dataLoaded && (
                            <ImagePlaceholder
                                style={{
                                    width: scaledWidth,
                                    height: scaledHeight,
                                }}
                            />
                        )}
                        {src && (
                            <Img
                                src={src}
                                alt="image"
                                width={scaledWidth}
                                height={scaledHeight}
                                loading="lazy"
                                onLoad={() =>
                                    setTimeout(() => setDataLoaded(true), 200)
                                }
                            />
                        )}
                    </ImgWrapper>
                }>
                {src && (
                    <PreviewImg
                        src={src}
                        alt="preview-image"
                        width={scaledWidth}
                        height={scaledHeight}
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

const ImagePlaceholder = styled('div', {
    background: theme.colors.extraLightGrey,
    borderRadius: theme.sizes.xxs,
    position: 'absolute',
})

const Img = styled(Image, {
    borderRadius: theme.sizes.xxs,
})

const PreviewImg = styled(Image, {
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
