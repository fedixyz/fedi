import React from 'react'

import { CSSProp, styled, theme } from '../styles'

interface Props {
    children: React.ReactNode
    css?: CSSProp
}

export const ContentBlock: React.FC<Props> = ({ children, css }) => {
    return <Container css={css}>{children}</Container>
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: 600,
    flexShrink: 0,
    padding: '64px 72px',
    background: theme.colors.white,
    borderRadius: 20,
    boxShadow:
        '0px 7px 11px rgba(1, 153, 176, 0.06), 0px 16px 40px rgba(112, 153, 176, 0.16)',
    overflow: 'hidden',
    // Fixes an issue with Safari and resizing the block
    transform: `translate3d(0, 0, 0)`,

    '@md': {
        padding: 48,
    },

    '@sm': {
        flex: 1,
        padding: 0,
        borderRadius: 0,
        boxShadow: 'none',
        maxWidth: 'none',
        animation: 'none',
    },
})
