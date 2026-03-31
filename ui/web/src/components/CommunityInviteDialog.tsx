import React from 'react'
import { useTranslation } from 'react-i18next'

import { WEB_APP_URL } from '@fedi/common/constants/api'
import { selectCommunity } from '@fedi/common/redux'
import { stripFediPrefix } from '@fedi/common/utils/linking'

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

    const shareLink = `${WEB_APP_URL}/link#screen=join&id=${encodeURIComponent(stripFediPrefix(inviteCode))}`

    return (
        <QRDialog
            open={open}
            title={`${t('feature.communities.community-invite')}`}
            qrValue={inviteCode.toUpperCase()}
            copyValue={inviteCode}
            onCopyMessage={t('feature.communities.copied-community-invite')}
            shareValue={shareLink}
            onOpenChange={onClose}
        />
    )
}
