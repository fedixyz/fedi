import React from 'react'
import { useTranslation } from 'react-i18next'

import { selectAuthenticatedMember } from '@fedi/common/redux'
import { encodeDirectChatLink } from '@fedi/common/utils/xmpp'

import { useAppSelector } from '../hooks'
import { QRDialog } from './QRDialog'

interface Props {
    open: boolean
    onOpenChange(open: boolean): void
}

export const MemberQRDialog: React.FC<Props> = props => {
    const { t } = useTranslation()
    const member = useAppSelector(selectAuthenticatedMember)

    if (!member) return null

    const directChatLink = encodeDirectChatLink(member.username)

    return (
        <QRDialog
            title={member.username}
            qrValue={directChatLink}
            onCopyMessage={t('feature.federations.copied-federation-invite')}
            notice={t('feature.chat.scan-member-code-notice')}
            {...props}
        />
    )
}
