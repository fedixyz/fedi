import React from 'react'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import { styled, theme } from '../styles'
import { Icon, IconProps, IconSize } from './Icon'

interface Props extends Omit<IconProps, 'size' | 'onClick'> {
    variant?: 'primary' | 'secondary' | 'basic'
    size?: Exclude<IconSize, 'xxs'>
    outline?: boolean
    disabled?: boolean
    onClick?: React.MouseEventHandler<HTMLButtonElement>
}

export const IconButton: React.FC<Props> = ({
    onClick,
    size = 'sm',
    icon,
    disabled,
    variant = 'basic',
    outline = false,
    style,
    ...props
}) => {
    // Since IconButton has a width and height of `size`,
    // Downscale the icon by one size
    const iconSizeMap: Record<typeof size, IconSize> = {
        xl: 'lg',
        lg: 'md',
        md: 'sm',
        sm: 'xs',
        xs: 'xxs',
    }
    const iconSize: IconSize = iconSizeMap[size]
    const buttonPadding = fediTheme.sizes[size] * 0.2
    const sharedProps = {
        variant: variant,
        outline: outline,
        onClick: onClick,
        disabled,
    }
    return (
        <ButtonBase
            {...(props as React.HTMLAttributes<HTMLButtonElement>)}
            {...sharedProps}
            style={{
                ...style,
                width: fediTheme.sizes[size],
                height: fediTheme.sizes[size],
                padding: buttonPadding,
            }}
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
        disabled: {
            true: {
                opacity: 0.5,
                pointerEvents: 'none',
            },
        },
        outline: {
            true: {
                border: `1.5px solid ${theme.colors.primaryVeryLight}`,
            },
        },
    },
})
