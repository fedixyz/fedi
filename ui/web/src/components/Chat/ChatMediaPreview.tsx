import * as Dialog from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import React from 'react'

import Close from '@fedi/common/assets/svgs/close.svg'
import Download from '@fedi/common/assets/svgs/download.svg'

import { keyframes, styled, theme } from '../../styles'
import { downloadFile } from '../../utils/media'
import { Icon } from '../Icon'

interface Props {
    children: React.ReactNode
    trigger: React.ReactNode
    open: boolean
    onOpenChange(open: boolean): void
    src: string | null
    name?: string
}

export const ChatMediaPreview: React.FC<Props> = ({
    children,
    trigger,
    open,
    onOpenChange,
    src,
    name,
}) => {
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
            <Dialog.Portal>
                <Overlay>
                    <Dialog.Close asChild>
                        <CloseIcon icon={Close} size={24} />
                    </Dialog.Close>
                    {src && name && (
                        <DownloadIcon
                            icon={Download}
                            size={20}
                            onClick={() => downloadFile(src, name)}
                            aria-label="download-button"
                        />
                    )}
                    <Content
                        // Prevents dialog closing when clicking on overlay
                        onInteractOutside={event => event.preventDefault()}>
                        <VisuallyHidden>
                            <Dialog.Title />
                            <Dialog.Description />
                        </VisuallyHidden>
                        {children}
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
    display: 'flex',
    flexDirection: 'column',
    height: 'auto',
    maxHeight: '80%',
    maxWidth: 600,
    position: 'relative',
    outline: 'none',
    overflow: 'hidden',
    width: 'auto',
})

const CloseIcon = styled(Icon, {
    color: theme.colors.white,
    cursor: 'pointer',
    position: 'absolute',
    top: 12,
    left: 12,
})

const DownloadIcon = styled(Icon, {
    color: theme.colors.white,
    cursor: 'pointer',
    position: 'absolute',
    right: 12,
    top: 12,
})
