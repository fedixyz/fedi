import * as RadixDialog from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import React from 'react'

import { keyframes, styled, theme } from '../../styles'

type Props = {
    children: React.ReactNode
    open: boolean
    title: string
    onOpenChange(open: boolean): void
    overlayTestId?: string
}

export const ChatBottomDrawer: React.FC<Props> = ({
    children,
    open,
    title,
    onOpenChange,
    overlayTestId,
}) => {
    return (
        <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
            <RadixDialog.Portal>
                <Overlay data-testid={overlayTestId}>
                    <Content onOpenAutoFocus={ev => ev.preventDefault()}>
                        <VisuallyHidden>
                            <RadixDialog.Title>{title}</RadixDialog.Title>
                            <RadixDialog.Description />
                        </VisuallyHidden>
                        {children}
                    </Content>
                </Overlay>
            </RadixDialog.Portal>
        </RadixDialog.Root>
    )
}

const overlayShow = keyframes({
    '0%': { opacity: 0 },
    '100%': { opacity: 1 },
})

const drawerShow = keyframes({
    '0%': { transform: 'translateY(100%)' },
    '100%': { transform: 'translateY(0)' },
})

const Overlay = styled(RadixDialog.Overlay, {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    background: theme.colors.primary80,
    animation: `${overlayShow} 150ms ease`,
})

const Content = styled(RadixDialog.Content, {
    width: '100%',
    maxWidth: theme.sizes.desktopAppWidth,
    background: theme.colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 8,
    animation: `${drawerShow} 180ms ease`,
    outline: 'none',

    '@standalone': {
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
    },
})
