import React from 'react'

import { keyframes, styled, theme } from '../styles'
import { Text } from './Text'

interface Props {
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number
    label?: string
}

export const HoloLoader: React.FC<Props> = ({ size = 'sm', label }) => {
    const style =
        typeof size === 'number' ? { width: size, height: size } : undefined

    return (
        <Container>
            <Loader
                size={typeof size !== 'number' ? size : undefined}
                style={style}>
                <Inner />
            </Loader>
            {label && (
                <ProgressLabel variant="caption" weight="bold">
                    {label}
                </ProgressLabel>
            )}
        </Container>
    )
}

const rotate = keyframes({
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(360deg)' },
})

const Container = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
})

const Loader = styled('div', {
    display: 'inline-flex',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    aspectRatio: '1 / 1',
    borderRadius: '100%',
    fediGradient: 'sky-heavy',
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

const ProgressLabel = styled(Text, {
    position: 'absolute',
    color: theme.colors.black,
    textAlign: 'center',
})
