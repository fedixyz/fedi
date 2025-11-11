import React from 'react'

import { CSSProp, styled } from '../styles'

interface Props {
    children: React.ReactNode
    css?: CSSProp
}

export const ContentBlock: React.FC<Props> = ({ children, css }) => {
    return <Container css={css}>{children}</Container>
}

const Container = styled('div', {
    borderRadius: 0,
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    overflow: 'hidden',
    width: '100%',
})
