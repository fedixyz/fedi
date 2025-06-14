import * as RadixAlertDialog from '@radix-ui/react-alert-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { keyframes, styled, theme } from '../../styles'
import { Button } from '../Button'

interface Props {
    open: boolean
    children: React.ReactElement
    onClick(): void
    title?: string
    description?: string
}

export const Modal: React.FC<Props> = ({
    open,
    children,
    onClick,
    title,
    description,
}) => {
    const { t } = useTranslation()

    return (
        <RadixAlertDialog.Root open={open}>
            <RadixAlertDialog.Portal>
                <Overlay>
                    <Content>
                        <VisuallyHidden>
                            <RadixAlertDialog.Title>
                                {title}
                            </RadixAlertDialog.Title>
                            <RadixAlertDialog.Description>
                                {description}
                            </RadixAlertDialog.Description>
                        </VisuallyHidden>

                        <Children>{children}</Children>
                        <Actions>
                            <Button
                                variant="primary"
                                onClick={onClick}
                                width="full">
                                {t('words.continue')}
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
    animation: `${overlayShow} 150ms ease`,
    background: theme.colors.primary80,
    display: 'grid',
    inset: 0,
    overflow: 'auto',
    position: 'fixed',
    placeItems: 'center',
    textAlign: 'center',
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
