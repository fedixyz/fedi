import React from 'react'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import { styled, theme } from '../styles'
import { Icon, IconProps } from './Icon'

interface Props extends Omit<IconProps, 'size'> {
    variant?: 'primary' | 'secondary' | 'basic'
    size?: Exclude<IconProps['size'], number | 'xs'>
    outline?: boolean
    onClick(): void
}

const sizeOrder = ['xs', 'sm', 'md', 'lg', 'xl'] as const

export const IconButton: React.FC<Props> = ({
    onClick,
    size = 'sm',
    icon,
    variant = 'basic',
    outline = false,
    ...props
}) => {
    const iconSize = sizeOrder[sizeOrder.indexOf(size) - 1]
    const sharedProps = {
        variant: variant,
        size: size,
        outline: outline,
        onClick: onClick,
    }
    return (
        <ButtonBase
            {...(props as React.HTMLAttributes<HTMLButtonElement>)}
            {...sharedProps}
            type="button">
            <Icon size={iconSize} icon={icon} />
        </ButtonBase>
    )
}

const ButtonBase = styled('button', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '100%',
    background: 'transparent',
    transition: 'background-color 100ms ease',

    '&:hover, &:focus': {
        background: theme.colors.extraLightGrey,
    },
    '&:active': {
        background: theme.colors.lightGrey,
    },

    variants: {
        variant: {
            primary: {
                background: `linear-gradient(${theme.colors.white20}, transparent), linear-gradient(${theme.colors.primary}, ${theme.colors.primary})`,
                color: theme.colors.white,
            },
            secondary: {
                background: `linear-gradient(${theme.colors.white}, ${theme.colors.primary10}), linear-gradient(${theme.colors.white}, ${theme.colors.white})`,
                color: theme.colors.primary,
            },
            basic: {
                background: 'transparent',
                color: theme.colors.primary,
            },
        },
        size: {
            sm: {
                width: theme.sizes.sm,
                height: theme.sizes.sm,
                padding: `${fediTheme.sizes.sm * 0.2}px`,
            },
            md: {
                width: theme.sizes.md,
                height: theme.sizes.md,
                padding: `${fediTheme.sizes.md * 0.2}px`,
            },
            lg: {
                width: theme.sizes.lg,
                height: theme.sizes.lg,
                padding: `${fediTheme.sizes.lg * 0.2}px`,
            },
            xl: {
                width: theme.sizes.xl,
                height: theme.sizes.xl,
                padding: `${fediTheme.sizes.xl * 0.2}px`,
            },
        },
        outline: {
            true: {
                border: `1.5px solid ${theme.colors.primaryVeryLight}`,
            },
        },
    },
})
