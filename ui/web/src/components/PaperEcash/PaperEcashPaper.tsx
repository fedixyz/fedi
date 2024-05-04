import QRCode from 'qrcode'
import React, { useEffect, useState } from 'react'

import ArrowLeft from '@fedi/common/assets/svgs/arrow-left.svg'
import ScanIcon from '@fedi/common/assets/svgs/scan.svg'

import { styled, theme } from '../../styles'
import { Icon } from '../Icon'

interface Props {
    ecash: string
    frames: string[]
}

export const PaperEcashPaper: React.FC<Props> = ({ frames }) => {
    const [qrCodes, setQrCodes] = useState<string[]>([])

    useEffect(() => {
        Promise.all(
            frames.map(frame => QRCode.toString(frame, { type: 'svg' })),
        ).then(setQrCodes)
    }, [frames])

    return (
        <Container>
            <Instructions>
                <Arrow>
                    <Icon icon={ArrowLeft} />
                </Arrow>
                <InstructionsText>
                    <span>Open</span>
                    <Icon icon={ScanIcon} />
                    <span>Fedi Scanner. Move phone side to side.</span>
                </InstructionsText>
                <Arrow css={{ transform: 'rotate(180deg)' }}>
                    <Icon icon={ArrowLeft} />
                </Arrow>
            </Instructions>
            <QRCodes>
                {qrCodes.map((code, idx) => (
                    <QRCodeContainer
                        key={idx}
                        dangerouslySetInnerHTML={{ __html: code }}
                    />
                ))}
            </QRCodes>
        </Container>
    )
}

const Container = styled('div', {
    breakInside: 'avoid',
    marginBottom: 24,
})

const Instructions = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
    color: theme.colors.grey,
    fontWeight: 'bold',
})

const InstructionsText = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
})

const Arrow = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transformOrigin: 'center',
})

const QRCodes = styled('div', {
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
})

const QRCodeContainer = styled('div', {
    width: 120,

    '> svg': {
        width: '100%',
        height: 'auto',
    },
})
