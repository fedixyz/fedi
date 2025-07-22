import * as Dialog from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import React from 'react'

import { keyframes, styled } from '../../styles'

interface Props {
    children: React.ReactNode
    trigger: React.ReactNode
    open: boolean
    onOpenChange(open: boolean): void
}

export const ChatMediaPreview: React.FC<Props> = ({
    children,
    trigger,
    open,
    onOpenChange,
}) => {
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
            <Dialog.Portal>
                <Overlay>
                    <Content>
                        <VisuallyHidden>
                            <Dialog.Title />
                            <Dialog.Description />
                        </VisuallyHidden>
                        <Dialog.Close asChild>{children}</Dialog.Close>
                    </Content>
                </Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    )
}

const fadeIn = keyframes({
    '0%': { opacity: 0 },
    '100%': { opacity: 1 },
})

const Overlay = styled(Dialog.Overlay, {
    position: 'fixed',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    overflow: 'auto',
    background: 'rgba(0, 0, 0, 0.9)',
    animation: `${fadeIn} 150ms ease`,
    userSelect: 'none',
})

const Content = styled(Dialog.Content, {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    height: 'auto',
    maxWidth: 600,
    width: '100%',
    overflow: 'hidden',
    outline: 'none',
})
