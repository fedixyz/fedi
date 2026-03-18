import * as RadixDialog from '@radix-ui/react-dialog'
import { ResourceKey } from 'i18next'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import closeIcon from '@fedi/common/assets/svgs/close.svg'
import CopyIcon from '@fedi/common/assets/svgs/copy.svg'
import ShareIcon from '@fedi/common/assets/svgs/share.svg'
import { useToast } from '@fedi/common/hooks/toast'

import { keyframes, styled, theme } from '../styles'
import { Button } from './Button'
import { Row } from './Flex'
import { Icon } from './Icon'
import { QRCode } from './QRCode'
import { Text } from './Text'

interface Props {
    open: boolean
    title: string
    qrValue: string
    copyValue?: string
    onCopyMessage?: ResourceKey
    shareValue?: string
    notice?: string
    onOpenChange(open: boolean): void
}

export const QRDialog: React.FC<Props> = ({
    open,
    onOpenChange,
    title,
    qrValue,
    copyValue,
    onCopyMessage,
    shareValue,
    notice,
}) => {
    const { t } = useTranslation()
    const toast = useToast()

    const resolvedCopyValue = copyValue || qrValue

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(resolvedCopyValue)
            if (onCopyMessage) {
                toast.show({
                    content: t(onCopyMessage),
                    status: 'success',
                })
            }
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
    }, [resolvedCopyValue, onCopyMessage, t, toast])

    const handleShare = useCallback(async () => {
        if (!('share' in navigator)) {
            toast.show({
                status: 'error',
                content: t('errors.unknown-error'),
            })
            return
        }

        try {
            await navigator.share({
                text: shareValue || resolvedCopyValue,
            })
        } catch {
            // no-op, user cancelled
        }
    }, [shareValue, resolvedCopyValue, t, toast])

    return (
        <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
            <RadixDialog.Portal>
                <Overlay>
                    <Content>
                        <Header>
                            <div />
                            <Title variant="body" weight="bold">
                                {title}
                            </Title>
                            <Close onClick={() => onOpenChange?.(false)}>
                                <Icon icon={closeIcon} size={24} />
                            </Close>
                        </Header>
                        <Body>
                            <QRContainer>
                                <QRCode data={qrValue} />
                                <Row gap="md" fullWidth>
                                    <Button
                                        width="full"
                                        variant="secondary"
                                        icon={CopyIcon}
                                        onClick={handleCopy}>
                                        {t('words.copy')}
                                    </Button>
                                    <Button
                                        width="full"
                                        variant="secondary"
                                        icon={ShareIcon}
                                        onClick={handleShare}>
                                        {t('words.share')}
                                    </Button>
                                </Row>
                            </QRContainer>
                            {notice && (
                                <Notice>
                                    <Text variant="caption">{notice}</Text>
                                </Notice>
                            )}
                        </Body>
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
    maxWidth: 500,
    overflow: 'hidden',
    position: 'relative',

    '@sm': {
        background: theme.colors.black,
        borderRadius: 0,
        height: '100%',
    },
})

const Header = styled('div', {
    alignItems: 'center',
    display: 'flex',
    height: 60,
    justifyContent: 'center',
})

const Title = styled(Text, {
    color: theme.colors.black,
    flex: 1,
    textAlign: 'center',

    '@sm': {
        color: theme.colors.white,
    },
})

const Close = styled(RadixDialog.Close, {
    alignContent: 'center',
    color: theme.colors.black,
    display: 'flex',
    position: 'absolute',
    top: 20,
    right: 20,

    '@sm': {
        color: theme.colors.white,
    },
})

const Body = styled('div', {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    padding: 40,
})

const QRContainer = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
})

const Notice = styled('div', {
    textAlign: 'center',
    color: theme.colors.grey,
})
