import React from 'react'

import { styled, theme } from '../styles'

interface Props {
    children: React.ReactNode
}

export const ChatEmptyState: React.FC<Props> = ({ children }) => {
    return <Container>{children}</Container>
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    width: '100%',
    height: '100%',
    padding: 16,
    gap: 16,
    color: theme.colors.darkGrey,
})
