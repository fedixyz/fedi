import React from 'react'

import { styled, theme } from '../styles'
import { Icon, IconProps } from './Icon'

interface Props extends Omit<IconProps, 'size'> {
    size?: Exclude<IconProps['size'], number | 'xs'>
    onClick(): void
}

const sizeOrder = ['xs', 'sm', 'md', 'lg', 'xl'] as const

export const IconButton: React.FC<Props> = ({ onClick, size = 'sm', icon }) => {
    const iconSize = sizeOrder[sizeOrder.indexOf(size) - 1]
    return (
        <ButtonBase size={size} onClick={onClick} type="button">
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
        size: {
            sm: { width: theme.sizes.sm, height: theme.sizes.sm },
            md: { width: theme.sizes.md, height: theme.sizes.md },
            lg: { width: theme.sizes.lg, height: theme.sizes.lg },
            xl: { width: theme.sizes.xl, height: theme.sizes.xl },
        },
    },
})
