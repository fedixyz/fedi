import QRCode from 'qrcode'
import React, { useCallback, useEffect, useState } from 'react'

import { styled, theme } from '../../styles'
import { Text } from '../Text'

interface Props {
    url: string
}

export const DeepLinkResult: React.FC<Props> = ({ url }) => {
    const [qrSvg, setQrSvg] = useState('')
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        QRCode.toString(url, { type: 'svg', width: 240 })
            .then(setQrSvg)
            .catch(() => setQrSvg(''))
    }, [url])

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            // clipboard unavailable — silent fail is acceptable for an internal tool
        }
    }, [url])

    return (
        <Container>
            <Warning>
                <Text variant="caption" weight="bold" css={{ color: '$red' }}>
                    This is an internal tool. There may be bugs. Always test
                    deep links yourself before sharing them with real users.
                </Text>
            </Warning>
            {qrSvg && (
                <QRContainer dangerouslySetInnerHTML={{ __html: qrSvg }} />
            )}
            <UrlBox>
                <CopyRow
                    type="button"
                    onClick={handleCopy}
                    title="Click to copy">
                    <UrlText variant="small">{url}</UrlText>
                    <CopyIndicator variant="small">
                        {copied ? 'Copied!' : 'Copy'}
                    </CopyIndicator>
                </CopyRow>
                <Actions>
                    <OpenLink href={url}>Open</OpenLink>
                    <OpenLink
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer">
                        New tab
                    </OpenLink>
                </Actions>
            </UrlBox>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    paddingTop: 16,
})

const Warning = styled('div', {
    width: '100%',
    padding: '12px 16px',
    background: '#FEF2F2',
    border: `1px solid ${theme.colors.red}`,
    borderRadius: 8,
    textAlign: 'center',
})

const QRContainer = styled('div', {
    width: 240,

    '> svg': {
        width: '100%',
        height: 'auto',
    },
})

const UrlBox = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    border: `1px solid ${theme.colors.lightGrey}`,
})

const CopyRow = styled('button', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '10px 12px',
    background: theme.colors.extraLightGrey,
    border: 'none',
    borderBottom: `1px solid ${theme.colors.lightGrey}`,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 80ms ease',

    '&:hover': {
        background: theme.colors.lightGrey,
    },
})

const UrlText = styled(Text, {
    wordBreak: 'break-all',
    color: theme.colors.darkGrey,
    fontFamily: theme.fonts.mono,
})

const CopyIndicator = styled(Text, {
    flexShrink: 0,
    color: theme.colors.darkGrey,
    fontWeight: theme.fontWeights.medium,
})

const Actions = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    background: theme.colors.white,
})

const OpenLink = styled('a', {
    flex: 1,
    padding: '8px 14px',
    fontSize: theme.fontSizes.small,
    fontWeight: theme.fontWeights.medium,
    color: theme.colors.night,
    background: theme.colors.white,
    border: 'none',
    borderRight: `1px solid ${theme.colors.lightGrey}`,
    cursor: 'pointer',
    textDecoration: 'none',
    textAlign: 'center',
    transition: 'background 80ms ease',

    '&:last-child': {
        borderRight: 'none',
    },

    '&:hover': {
        background: theme.colors.extraLightGrey,
    },
})
