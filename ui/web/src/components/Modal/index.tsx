import * as RadixDialog from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import React from 'react'
import { useTranslation } from 'react-i18next'

import closeIcon from '@fedi/common/assets/svgs/close.svg'

import { keyframes, styled, theme } from '../../styles'
import { Button } from '../Button'
import { Icon } from '../Icon'

interface Props {
    open: boolean
    children: React.ReactElement
    onClick(): void
    title?: string
    description?: string
    buttonText?: string
    onOpenChange?(open: boolean): void
    showCloseButton?: boolean
}

export const Modal: React.FC<Props> = ({
    open,
    children,
    onClick,
    title,
    description,
    buttonText,
    onOpenChange,
    showCloseButton,
}) => {
    const { t } = useTranslation()

    return (
        <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
            <RadixDialog.Portal>
                <Overlay onClick={() => onOpenChange?.(false)}>
                    <Content>
                        {showCloseButton && (
                            <Close onClick={() => onOpenChange?.(false)}>
                                <Icon icon={closeIcon} size={20} />
                            </Close>
                        )}

                        <VisuallyHidden>
                            <RadixDialog.Title>{title}</RadixDialog.Title>
                            <RadixDialog.Description>
                                {description}
                            </RadixDialog.Description>
                        </VisuallyHidden>

                        <Children>{children}</Children>
                        <Actions>
                            <Button
                                variant="primary"
                                onClick={onClick}
                                width="full">
                                {buttonText ?? t('words.continue')}
                            </Button>
                        </Actions>
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

const Overlay = styled(RadixDialog.Overlay, {
    animation: `${overlayShow} 150ms ease`,
    background: theme.colors.primary80,
    display: 'grid',
    inset: 0,
    overflow: 'auto',
    position: 'fixed',
    placeItems: 'center',
    textAlign: 'center',
})

const Close = styled(RadixDialog.Close, {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 20,
    height: 20,
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

const Content = styled(RadixDialog.Content, {
    animation: `${contentShow} 150ms ease`,
    background: theme.colors.white,
    boxSizing: 'border-box',
    borderRadius: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 30,
    maxWidth: '400px',
    overflow: 'hidden',
    padding: 20,
    position: 'relative',
    width: '90%',
})

const Children = styled('div', {})

const Actions = styled('div', {
    alignItems: 'center',
    display: 'flex',
})
