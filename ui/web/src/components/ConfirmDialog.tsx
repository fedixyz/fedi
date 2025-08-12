import * as RadixAlertDialog from '@radix-ui/react-alert-dialog'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { keyframes, styled, theme } from '../styles'
import { Button } from './Button'
import { Text } from './Text'

interface Props {
    open: boolean
    title: React.ReactNode
    description: React.ReactNode
    onConfirm(): void | Promise<void>
    onClose?(): void
    primaryButtonLabel?: string
    secondaryButtonLabel?: string
}

export const ConfirmDialog: React.FC<Props> = ({
    open,
    title,
    description,
    onConfirm,
    onClose,
    primaryButtonLabel,
    secondaryButtonLabel,
}) => {
    const { t } = useTranslation()
    const [isConfirming, setIsConfirming] = useState(false)

    useEffect(() => {
        if (!open) {
            setIsConfirming(false)
        }
    }, [open])

    const handleOpenChange = useCallback(
        (isOpen: boolean) => {
            if (!isOpen && onClose) onClose()
        },
        [onClose],
    )

    const handleConfirm = useCallback(async () => {
        const maybePromise = onConfirm()
        if (maybePromise) {
            setIsConfirming(true)
            try {
                await maybePromise
            } catch {
                /* no-op */
            }
            setIsConfirming(false)
        }
    }, [onConfirm])

    return (
        <RadixAlertDialog.Root open={open} onOpenChange={handleOpenChange}>
            <RadixAlertDialog.Portal>
                <Overlay>
                    <Content onOpenAutoFocus={ev => ev.preventDefault()}>
                        <Title>
                            <Text variant="body" weight="bold">
                                {title}
                            </Text>
                        </Title>
                        <Description>
                            <Text variant="caption" weight="medium">
                                {description}
                            </Text>
                        </Description>
                        <Actions>
                            {onClose && (
                                <Button
                                    disabled={isConfirming}
                                    variant="tertiary"
                                    onClick={onClose}>
                                    {secondaryButtonLabel || t('words.cancel')}
                                </Button>
                            )}
                            <Button
                                disabled={isConfirming}
                                variant="primary"
                                onClick={handleConfirm}>
                                {primaryButtonLabel || t('words.confirm')}
                            </Button>
                        </Actions>
                    </Content>
                </Overlay>
            </RadixAlertDialog.Portal>
        </RadixAlertDialog.Root>
    )
}

const overlayShow = keyframes({
    '0%': { opacity: 0 },
    '100%': { opacity: 1 },
})

const Overlay = styled(RadixAlertDialog.Overlay, {
    position: 'fixed',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    overflow: 'auto',
    background: theme.colors.primary80,
    animation: `${overlayShow} 150ms ease`,
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

const Content = styled(RadixAlertDialog.Content, {
    position: 'relative',
    padding: 32,
    borderRadius: 20,
    width: '90vw',
    maxWidth: 440,
    background: theme.colors.white,
    overflow: 'hidden',
    animation: `${contentShow} 150ms ease`,
})

const Title = styled(RadixAlertDialog.Title, {
    marginBottom: 8,
})

const Description = styled(RadixAlertDialog.Description, {
    color: theme.colors.darkGrey,
    marginBottom: 20,
})

const Actions = styled('div', {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
})
