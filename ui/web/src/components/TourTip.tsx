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
    open?: boolean
    onOpenChange?: (open: boolean) => void
}

export const TourTip: React.FC<Props> = ({
    children,
    content,
    open,
    onOpenChange,
    ...contentProps
}) => {
    return (
        <RadixPopover.Root open={open} onOpenChange={onOpenChange} modal>
            <RadixPopover.Anchor>{children}</RadixPopover.Anchor>
            <RadixPopover.Portal>
                <Content {...contentProps} arrowPadding={12}>
                    {content}
                    <Arrow />
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
    borderRadius: 12,
    background: theme.colors.blue200,
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    maxWidth: 256,
    userSelect: 'none',

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
    fill: theme.colors.blue200,
})
