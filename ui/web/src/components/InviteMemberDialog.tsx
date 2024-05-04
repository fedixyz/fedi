import React from 'react'
import { useTranslation } from 'react-i18next'

import { selectActiveFederation } from '@fedi/common/redux'

import { useAppSelector } from '../hooks'
import { QRDialog } from './QRDialog'

interface Props {
    open: boolean
    onOpenChange(open: boolean): void
}

export const InviteMemberDialog: React.FC<Props> = props => {
    const { t } = useTranslation()
    const inviteCode = useAppSelector(selectActiveFederation)?.inviteCode

    if (!inviteCode) return null

    return (
        <QRDialog
            title={t('feature.federations.federation-invite')}
            qrValue={inviteCode.toUpperCase()}
            copyValue={inviteCode}
            onCopyMessage={t('feature.federations.copied-federation-invite')}
            {...props}
        />
    )
}
