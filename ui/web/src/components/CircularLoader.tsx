import { keyframes } from '@stitches/react'
import React from 'react'

import { styled, theme } from '../styles'

interface Props {
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number
}

export const CircularLoader: React.FC<Props> = ({ size }) => {
    const style =
        typeof size === 'number' ? { width: size, height: size } : undefined
    return (
        <Loader
            size={typeof size !== 'number' ? size : undefined}
            style={style}>
            <svg viewBox="25 25 50 50">
                <circle
                    cx="50"
                    cy="50"
                    r="20"
                    stroke="currentColor"
                    strokeWidth={4}
                    fill="none"
                />
            </svg>
        </Loader>
    )
}

const rotate = keyframes({
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(360deg)' },
})

const strokeGrowth = keyframes({
    '0%': {
        strokeDasharray: '1, 200',
        strokeDashoffset: ' 0',
    },
    '50%': {
        strokeDasharray: '89, 200',
        strokeDashoffset: '-35',
    },
    '100%': {
        strokeDasharray: '89, 200',
        strokeDashoffset: '-124',
    },
})

const Loader = styled('div', {
    display: 'block',
    position: 'relative',

    variants: {
        size: {
            xs: { width: theme.sizes.xs, height: theme.sizes.xs },
            sm: { width: theme.sizes.sm, height: theme.sizes.sm },
            md: { width: theme.sizes.md, height: theme.sizes.md },
            lg: { width: theme.sizes.lg, height: theme.sizes.lg },
            xl: { width: theme.sizes.xl, height: theme.sizes.xl },
        },
    },
    defaultVariants: {
        size: 'sm',
    },

    '& svg': {
        display: 'block',
        width: '100%',
        height: '100%',
        animation: `${rotate} 2s linear infinite`,
    },
    '& svg circle': {
        animation: `${strokeGrowth} 1.5s ease-in-out infinite`,
    },
})
