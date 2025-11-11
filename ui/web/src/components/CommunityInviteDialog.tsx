import React from 'react'
import { useTranslation } from 'react-i18next'

import { selectCommunity } from '@fedi/common/redux'

import { useAppSelector } from '../hooks'
import { QRDialog } from './QRDialog'

interface Props {
    open: boolean
    communityId: string
    onClose: () => void
}

export const CommunityInviteDialog: React.FC<Props> = ({
    open,
    communityId,
    onClose,
}: Props) => {
    const { t } = useTranslation()

    const community = useAppSelector(s => selectCommunity(s, communityId))

    const inviteCode = community?.communityInvite.invite_code_str
    if (!inviteCode) return null

    return (
        <QRDialog
            open={open}
            title={`${t('feature.communities.community-invite')}`}
            qrValue={inviteCode.toUpperCase()}
            copyValue={inviteCode}
            onCopyMessage={t('feature.communities.copied-community-invite')}
            onOpenChange={onClose}
        />
    )
}
