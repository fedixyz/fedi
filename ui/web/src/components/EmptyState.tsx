import React from 'react'

import { styled, theme } from '../styles'

interface Props {
    children: React.ReactNode
}

export const EmptyState: React.FC<Props> = ({ children }) => {
    return <Container>{children}</Container>
}

const Container = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px 16px',
    textAlign: 'center',
    color: theme.colors.darkGrey,
    border: `1px dashed ${theme.colors.lightGrey}`,
    borderRadius: 16,

    '@sm': {
        margin: '0 16px',
        border: 'none',
    },
})
