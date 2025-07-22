import * as RadixPopover from '@radix-ui/react-popover'
import React from 'react'

import { keyframes, styled, theme } from '../styles'

interface Props {
    children: React.ReactNode
    content: React.ReactNode
    side?: 'top' | 'right' | 'bottom' | 'left'
    sideOffset?: number
    align?: 'start' | 'center' | 'end'
    alignOffset?: number
    arrow?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
}

export const Popover: React.FC<Props> = ({
    children,
    content,
    arrow,
    open,
    onOpenChange,
    ...contentProps
}) => {
    return (
        <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
            <RadixPopover.Trigger>{children}</RadixPopover.Trigger>
            <RadixPopover.Portal>
                <Content {...contentProps} arrowPadding={12}>
                    {content}
                    {arrow && <Arrow />}
                </Content>
            </RadixPopover.Portal>
        </RadixPopover.Root>
    )
}

const popoverFadeIn = keyframes({
    '0%': { opacity: 0, transform: 'var(--start-transform)' },
    '100%': { opacity: 1, transform: 'translate(0, 0)' },
})

const Content = styled(RadixPopover.Content, {
    animation: `${popoverFadeIn} 300ms ease`,
    background: theme.colors.white,
    borderRadius: 12,
    boxShadow: `0px 7px 11px rgba(1, 153, 176, 0.06), 0px 16px 40px rgba(112, 153, 176, 0.16)`,
    padding: 20,
    minWidth: `var(--radix-popover-trigger-width)`,

    '&[data-state="open"][data-side="top"]': {
        '--start-transform': 'translate(0, 4px)',
    },
    '&[data-state="open"][data-side="right"]': {
        '--start-transform': 'translate(4px, 0)',
    },
    '&[data-state="open"][data-side="bottom"]': {
        '--start-transform': 'translate(0, -4px)',
    },
    '&[data-state="open"][data-side="left"]': {
        '--start-transform': 'translate(-4px, 0)',
    },
})

const Arrow = styled(RadixPopover.Arrow, {
    fill: theme.colors.white,
})
