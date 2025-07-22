import Image from 'next/image'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import ImageOff from '@fedi/common/assets/svgs/image-off.svg'
import { MatrixEvent } from '@fedi/common/types'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'

import { Icon } from '../../components/Icon'
import { Text } from '../../components/Text'
import { useLoadMedia } from '../../hooks/media'
import { keyframes, styled, theme } from '../../styles'
import { ChatMediaPreview } from './ChatMediaPreview'

interface Props {
    event: MatrixEvent<MatrixEventContentType<'m.image'>>
}

export const ChatImageEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()
    const { error, src } = useLoadMedia(event)

    const [showMediaPreview, setShowMediaPreview] = useState(false)

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

    if (!src) {
        return <ImgWrapper />
    }

    return (
        <div>
            <ChatMediaPreview
                open={showMediaPreview}
                onOpenChange={setShowMediaPreview}
                trigger={
                    <Img
                        src={src}
                        placeholder="empty"
                        alt="image"
                        width={0}
                        height={0}
                        loading="lazy"
                    />
                }>
                <PreviewImg
                    src={src}
                    alt="preview-image"
                    width={0}
                    height={0}
                />
            </ChatMediaPreview>
        </div>
    )
}

const fadeIn = keyframes({
    '0%': { opacity: 0 },
    '100%': { opacity: 1 },
})

const ImgWrapper = styled('div', {
    background: theme.colors.extraLightGrey,
    borderRadius: theme.sizes.xxs,
    height: 300,
    width: '100%',
})

const Img = styled(Image, {
    animation: `${fadeIn} 200ms ease`,
    height: 'auto',
    width: '100%',
})

const PreviewImg = styled(Image, {
    height: 'auto',
    width: '100%',
})

const Error = styled('div', {
    background: theme.colors.extraLightGrey,
    padding: 10,
    textAlign: 'center',
})
