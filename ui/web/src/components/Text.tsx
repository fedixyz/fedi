import React from 'react'

import { styled, theme, CSSProp } from '../styles'

export interface TextProps {
    variant?: 'display' | 'h1' | 'h2' | 'body' | 'caption' | 'small' | 'tiny'
    weight?: 'normal' | 'medium' | 'bold' | 'bolder'
    ellipsize?: boolean
    children: React.ReactNode
    className?: string
    css?: CSSProp
}

export const Text: React.FC<TextProps> = ({
    variant = 'body',
    weight,
    children,
    ...props
}) => {
    if (!weight) {
        weight = ['h1', 'h2', 'display'].includes(variant) ? 'bolder' : 'normal'
    }
    return (
        <TextElement variant={variant} weight={weight} {...props}>
            {children}
        </TextElement>
    )
}

const TextElement = styled('div', {
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.25,
    letterSpacing: '-1%',
    color: 'inherit',

    variants: {
        weight: {
            normal: { fontWeight: theme.fontWeights.normal },
            medium: { fontWeight: theme.fontWeights.medium },
            bold: { fontWeight: theme.fontWeights.bold },
            bolder: { fontWeight: theme.fontWeights.bolder },
        },
        variant: {
            display: {
                fontSize: 80,
                fontWeight: 700,
                lineHeight: 1.5,
            },
            h1: {
                fontSize: 32,
                lineHeight: 1.5,
            },
            h2: {
                fontSize: 24,
                lineHeight: 1.5,
            },
            body: { fontSize: 16 },
            caption: { fontSize: 14 },
            small: { fontSize: 12 },
            tiny: { fontSize: 10 },
        },
        ellipsize: {
            true: {
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
            },
        },
    },
    defaultVariants: {
        variant: 'body',
        weight: 'normal',
    },
})
