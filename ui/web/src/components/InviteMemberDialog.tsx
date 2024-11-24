import React from 'react'
import { useTranslation } from 'react-i18next'

import { selectLoadedFederation } from '@fedi/common/redux'

import { useAppSelector } from '../hooks'
import { QRDialog } from './QRDialog'

interface Props {
    open: boolean
    federationId: string
    onClose: () => void
}

export const InviteMemberDialog: React.FC<Props> = ({
    federationId,
    onClose,
    ...rest
}: Props) => {
    const { t } = useTranslation()

    const federation = useAppSelector(s =>
        selectLoadedFederation(s, federationId),
    )

    const inviteCode = federation?.inviteCode
    if (!inviteCode) return null

    const handleOpenChange = (isOpen: boolean) => {
        if (!isOpen) {
            onClose()
        }
    }

    return (
        <QRDialog
            title={`${t('feature.federations.federation-invite')} - ${
                federation.name
            }`}
            qrValue={inviteCode.toUpperCase()}
            copyValue={inviteCode}
            onCopyMessage={t('feature.federations.copied-federation-invite')}
            onOpenChange={handleOpenChange}
            {...rest}
        />
    )
}
