import React from 'react'
import { useTranslation } from 'react-i18next'

import { selectMatrixAuth } from '@fedi/common/redux'
import { encodeFediMatrixUserUri } from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../hooks'
import { QRDialog } from '../QRDialog'

interface Props {
    open: boolean
    onOpenChange(open: boolean): void
}

export const ChatUserQRDialog: React.FC<Props> = props => {
    const { t } = useTranslation()
    const matrixAuth = useAppSelector(selectMatrixAuth)

    if (!matrixAuth) return null

    const directChatLink = encodeFediMatrixUserUri(matrixAuth.userId)

    return (
        <QRDialog
            title={t('feature.chat.chat-invite')}
            qrValue={directChatLink}
            onCopyMessage={t('phrases.copied-to-clipboard')}
            notice={t('feature.chat.scan-member-code-notice')}
            {...props}
        />
    )
}
