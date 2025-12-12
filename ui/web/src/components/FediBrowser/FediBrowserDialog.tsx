import * as RadixDialog from '@radix-ui/react-dialog'
import React from 'react'

import { keyframes, styled, theme } from '../../styles'

interface Props {
    open: boolean
    onOpenChange(open: boolean): void
    children: React.ReactNode
}

export const FediBrowserDialog: React.FC<Props> = ({
    open,
    onOpenChange,
    children,
}) => {
    return (
        <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
            <RadixDialog.Portal>
                <Overlay>
                    <Content>{children}</Content>
                </Overlay>
            </RadixDialog.Portal>
        </RadixDialog.Root>
    )
}

const overlayShow = keyframes({
    '0%': { opacity: 0 },
    '100%': { opacity: 1 },
})

const contentShow = keyframes({
    '0%': {
        opacity: 0,
        transform: 'translateY(3%) scale(0.95)',
    },
    '100%': {
        opacity: 1,
        transform: 'translateY(0) scale(1)',
    },
})

const Overlay = styled(RadixDialog.Overlay, {
    alignItems: 'center',
    animation: `${overlayShow} 150ms ease`,
    background: theme.colors.primary80,
    display: 'flex',
    inset: 0,
    justifyContent: 'center',
    position: 'fixed',
})

const Content = styled(RadixDialog.Content, {
    animation: `${contentShow} 150ms ease`,
    background: theme.colors.white,
    borderRadius: 20,
    boxSizing: 'border-box',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '80vh',
    maxWidth: 500,
    overflow: 'hidden',
    position: 'relative',

    '@sm': {
        background: theme.colors.black,
        borderRadius: 0,
        height: '100%',
    },
})
