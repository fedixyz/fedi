import * as RadixDialog from '@radix-ui/react-dialog'
import React from 'react'

import closeIcon from '@fedi/common/assets/svgs/close.svg'

import { keyframes, styled, theme } from '../styles'
import { CopyInput } from './CopyInput'
import { Icon } from './Icon'
import { QRCode } from './QRCode'
import { Text } from './Text'

interface Props {
    open: boolean
    title: string
    qrValue: string
    copyValue?: string
    onCopyMessage?: string
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
    notice,
}) => {
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
                                <CopyInput
                                    value={copyValue || qrValue}
                                    onCopyMessage={onCopyMessage}
                                />
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
