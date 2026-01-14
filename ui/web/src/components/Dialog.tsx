import * as RadixDialog from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useCallback } from 'react'

import CloseIcon from '@fedi/common/assets/svgs/close.svg'

import { keyframes, styled, theme } from '../styles'
import { Icon } from './Icon'
import { Text } from './Text'

interface Props {
    open: boolean
    onOpenChange(open: boolean): void
    title?: React.ReactNode
    description?: React.ReactNode
    children: React.ReactNode
    disableClose?: boolean
    hideCloseButton?: boolean
    disablePadding?: boolean
    /**
     * trays appear at the bottom of the screen on mobile only
     */
    type?: 'modal' | 'tray'
}

export const Dialog: React.FC<Props> = ({
    open,
    onOpenChange,
    title,
    description,
    children,
    disableClose,
    hideCloseButton,
    disablePadding = false,
    type = 'modal',
}) => {
    const handleCloseTrigger = useCallback(
        (ev: Event) => {
            if (disableClose) ev.preventDefault()
        },
        [disableClose],
    )

    const renderContents = useCallback(() => {
        return (
            <>
                {!hideCloseButton && (
                    <CloseButton>
                        <Icon icon={CloseIcon} />
                    </CloseButton>
                )}

                <Header disablePadding={disablePadding}>
                    {title && (
                        <Title asChild>
                            <Text variant="body" weight="bold">
                                {title}
                            </Text>
                        </Title>
                    )}
                    {description && (
                        <Description asChild>
                            <Text variant="caption" weight="medium">
                                {description}
                            </Text>
                        </Description>
                    )}
                </Header>

                <Body>{children}</Body>
            </>
        )
    }, [children, description, disablePadding, hideCloseButton, title])

    return (
        <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
            <RadixDialog.Portal>
                <Overlay isTray={type === 'tray'}>
                    <Content
                        disablePadding={disablePadding}
                        onOpenAutoFocus={ev => ev.preventDefault()}
                        onEscapeKeyDown={handleCloseTrigger}
                        onPointerDownOutside={handleCloseTrigger}
                        onInteractOutside={handleCloseTrigger}
                        isTray={type === 'tray'}>
                        <VisuallyHidden>
                            <div>{title || ''}</div>
                            <div>{description || ''}</div>
                        </VisuallyHidden>
                        {renderContents()}
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
    position: 'fixed',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    overflow: 'auto',
    background: theme.colors.primary80,
    animation: `${overlayShow} 150ms ease`,

    '@sm': {
        padding: 0,
        alignItems: 'flex-start',
        background: theme.colors.secondary,
    },

    variants: {
        isTray: {
            true: {
                '@sm': {
                    background: theme.colors.primary80,
                    alignItems: 'flex-end',
                },
            },
        },
    },
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
    position: 'relative',
    borderRadius: 20,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: 24,
    width: theme.sizes.desktopAppWidth,

    '@sm': {
        borderRadius: 0,
        height: '100%',
        width: '100%',
    },

    '@standalone': {
        '@sm': {
            paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
        },
    },

    variants: {
        disablePadding: {
            true: {
                padding: 0,
            },
        },
        isTray: {
            true: {
                '@sm': {
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 'auto',
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                },
            },
        },
    },
})

const Header = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
    position: 'relative',
    width: '100%',

    variants: {
        disablePadding: {
            true: {
                marginBottom: 0,
            },
        },
    },
})

const CloseButton = styled(RadixDialog.Close, {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    position: 'absolute',
    right: 20,
    top: 34,
    transform: 'translateY(-50%)',
    outline: 'none',
    cursor: 'pointer',
    zIndex: 1000,
})

const Title = styled(RadixDialog.Title, {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    textAlign: 'center',
})

const Description = styled(RadixDialog.Description, {
    color: theme.colors.darkGrey,
    marginBottom: 20,
    textAlign: 'center',
    width: '100%',
})

const Body = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
})
