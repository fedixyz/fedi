import React from 'react'

import { keyframes, styled, theme } from '../styles'

interface Props {
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number
}

export const HoloLoader: React.FC<Props> = ({ size = 'sm' }) => {
    const style =
        typeof size === 'number' ? { width: size, height: size } : undefined
    return (
        <Container
            size={typeof size !== 'number' ? size : undefined}
            style={style}>
            <Inner />
        </Container>
    )
}

const rotate = keyframes({
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(360deg)' },
})

const Container = styled('div', {
    display: 'inline-flex',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    aspectRatio: '1 / 1',
    borderRadius: '100%',
    holoGradient: '600',
    animation: `${rotate} 1s linear infinite`,

    variants: {
        size: {
            xs: { width: theme.sizes.xs, height: theme.sizes.xs },
            sm: { width: theme.sizes.sm, height: theme.sizes.sm },
            md: { width: theme.sizes.md, height: theme.sizes.md },
            lg: { width: theme.sizes.lg, height: theme.sizes.lg },
            xl: { width: theme.sizes.xl, height: theme.sizes.xl },
        },
    },
})

const Inner = styled('div', {
    position: 'absolute',
    inset: 2,
    borderRadius: '100%',
    background: theme.colors.white,
})
