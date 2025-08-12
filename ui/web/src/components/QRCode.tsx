import React, { useEffect, useState } from 'react'

import { renderStyledQrSvg } from '@fedi/common/utils/qrcode'

import { useMediaQuery } from '../hooks'
import { config, keyframes, styled, theme } from '../styles'
import { HoloLoader } from './HoloLoader'

interface Props {
    data: string | string[] | null | undefined
    logoOverrideUrl?: string
}

export const QRCode: React.FC<Props> = ({ data, logoOverrideUrl }) => {
    const [qrSvgs, setQrSvgs] = useState<string[] | null>(null)
    const [activeFrame, setActiveFrame] = useState(0)
    const isXs = useMediaQuery(config.media.xs)

    useEffect(() => {
        if (!data) return
        const dataArr = Array.isArray(data) ? data : [data]
        const svgs = dataArr.map(d => {
            return renderStyledQrSvg(d, {
                moduleShape: isXs ? 'square' : 'dot',
                hideLogo: isXs,
                logoOverrideUrl,
            })
        })
        setQrSvgs(svgs)
        setActiveFrame(0)
    }, [data, isXs, logoOverrideUrl])

    useEffect(() => {
        if (!qrSvgs || qrSvgs.length < 2) return
        const interval = setInterval(
            () => setActiveFrame(f => (f + 1) % qrSvgs.length),
            250,
        )
        return () => clearInterval(interval)
    }, [qrSvgs])

    return (
        <Container>
            {qrSvgs && qrSvgs.length ? (
                <Inner
                    key={activeFrame}
                    noAnimation={qrSvgs.length > 1}
                    dangerouslySetInnerHTML={{ __html: qrSvgs[activeFrame] }}
                />
            ) : (
                <Inner>
                    <Loading>
                        <HoloLoader size="xl" />
                    </Loading>
                </Inner>
            )}
        </Container>
    )
}

const Container = styled('div', {
    width: '100%',
    aspectRatio: '1 / 1',
    holoGradient: '900',
    padding: 4,
    borderRadius: 20,
})

const fadeIn = keyframes({
    '0%': { opacity: 0 },
    '100%': { opacity: 1 },
})

const Inner = styled('div', {
    position: 'relative',
    width: '100%',
    aspectRatio: '1 / 1',
    background: theme.colors.white,
    padding: 20,
    borderRadius: 16,

    '> *': {
        animation: `${fadeIn} 100ms ease`,
    },

    '@sm': {
        padding: 16,
    },

    '@xs': {
        padding: 12,
    },

    variants: {
        noAnimation: {
            true: {
                '> *': {
                    animation: 'none',
                },
            },
        },
    },
})

const Loading = styled('div', {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
})
