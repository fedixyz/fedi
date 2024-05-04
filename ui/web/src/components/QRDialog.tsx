import React from 'react'
import { useTranslation } from 'react-i18next'

import { styled, theme } from '../styles'
import { CopyInput } from './CopyInput'
import { Dialog } from './Dialog'
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
    qrValue,
    copyValue,
    onCopyMessage,
    notice,
    ...props
}) => {
    const { t } = useTranslation()
    return (
        <Dialog {...props}>
            <Content>
                <QRContainer>
                    <QRCode data={qrValue} />
                    <CopyInput
                        value={copyValue || qrValue}
                        onCopyMessage={
                            onCopyMessage || t('phrases.copied-to-clipboard')
                        }
                    />
                </QRContainer>
                {notice && (
                    <Notice>
                        <Text variant="caption">{notice}</Text>
                    </Notice>
                )}
            </Content>
        </Dialog>
    )
}

const Content = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 16,
    gap: 16,
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
