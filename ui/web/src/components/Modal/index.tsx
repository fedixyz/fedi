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
    onClick?(): void
    title?: string
    description?: string
    buttonText?: string
    showActions?: boolean
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
    showActions = true,
    onOpenChange,
    showCloseButton,
}) => {
    const { t } = useTranslation()

    return (
        <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
            <RadixDialog.Portal>
                <Overlay />
                <Content>
                    <VisuallyHidden>
                        <RadixDialog.Title>{title}</RadixDialog.Title>
                        <RadixDialog.Description>
                            {description}
                        </RadixDialog.Description>
                    </VisuallyHidden>
                    <Children>{children}</Children>
                    {showCloseButton && (
                        <Close>
                            <Icon icon={closeIcon} size={20} />
                        </Close>
                    )}
                    {showActions && (
                        <Actions>
                            <Button
                                variant="primary"
                                onClick={onClick ?? (() => {})}
                                width="full">
                                {buttonText ?? t('words.continue')}
                            </Button>
                        </Actions>
                    )}
                </Content>
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
    background: theme.colors.primary50,
    inset: 0,
    position: 'fixed',
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
        transform: 'translate(-50%, calc(-50% + 12px)) scale(0.95)',
    },
    '100%': {
        opacity: 1,
        transform: 'translate(-50%, -50%) scale(1)',
    },
})

const Content = styled(RadixDialog.Content, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
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
    width: '90%',
    textAlign: 'center',
})

const Children = styled('div', {})

const Actions = styled('div', {
    alignItems: 'center',
    display: 'flex',
})
