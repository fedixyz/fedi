import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import React from 'react'

import { keyframes, styled, theme } from '../styles'

interface Props {
    children: React.ReactNode
    menu: React.ReactNode
    align?: DropdownMenu.DropdownMenuContentProps['align']
    side?: DropdownMenu.DropdownMenuContentProps['side']
    disabled?: boolean
}

export const DropdownSheet: React.FC<Props> = ({
    children,
    menu,
    align,
    side,
    disabled,
}) => {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild disabled={disabled}>
                {children}
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenuContentContainer>
                    <DropdownMenuContent align={align} side={side}>
                        {menu}
                    </DropdownMenuContent>
                </DropdownMenuContentContainer>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    )
}

const overlayFadeIn = keyframes({
    from: {
        backgroundColor: 'transparent',
    },
    to: {
        backgroundColor: theme.colors.primary80,
    },
})

const DropdownMenuContentContainer = styled('div', {
    '@sm': {
        '[data-radix-popper-content-wrapper]': {
            transform: 'none !important',
            bottom: 0,
            top: 'auto',
            width: '100%',
            animation: `${overlayFadeIn} 200ms ease both`,
        },
    },
})

const dropdownScaleIn = keyframes({
    from: {
        opacity: 0,
        transform: 'scale(0.95) translateY(-5px)',
    },
    to: {
        opacity: 1,
        transform: 'scale(1)',
    },
})

const sheetSlideUp = keyframes({
    from: {
        transform: 'translateY(100%)',
    },
    to: {
        transform: 'translateY(0)',
    },
})

const DropdownMenuContent = styled(DropdownMenu.Content, {
    background: theme.colors.white,
    padding: 8,
    borderRadius: 12,
    minWidth: 260,
    boxShadow: `0 4px 24px 0 ${theme.colors.primary20}`,
    animation: `${dropdownScaleIn} 250ms ease`,
    transformOrigin: 'var(--radix-dropdown-menu-content-transform-origin)',

    '@sm': {
        position: 'fixed',
        bottom: 0,
        left: 0,
        minWidth: 0,
        width: '100%',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        animation: `${sheetSlideUp} 200ms 200ms ease both`,
        transformOrigin: 'center',
    },
})

export const DropdownSheetMenuItem = styled(DropdownMenu.Item, {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    borderRadius: 8,
    fontWeight: theme.fontWeights.bold,
    transition: 'background-color 100ms ease',
    '&:hover, &:focus': {
        background: theme.colors.primary05,
        cursor: 'pointer',
    },
    '&[data-disabled], &:disabled': {
        background: 'none',
        opacity: 0.5,
        cursor: 'not-allowed',
    },

    variants: {
        active: {
            true: {
                color: theme.colors.blue,
            },
        },
    },
})

export const DropdownSheetMenuLabel = styled(DropdownMenu.Label, {
    padding: 8,
    fontSize: theme.fontSizes.caption,
    fontWeight: theme.fontWeights.medium,
    color: theme.colors.grey,
})
