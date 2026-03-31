import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { WEB_APP_URL } from '@fedi/common/constants/api'
import { stripFediPrefix } from '@fedi/common/utils/linking'

import QRScreen from '../components/ui/QRScreen'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'CommunityInvite'
>

const CommunityInvite: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const { inviteLink } = route.params

    const shareLink = `${WEB_APP_URL}/link#screen=join&id=${encodeURIComponent(stripFediPrefix(inviteLink))}`

    return (
        <QRScreen
            dark
            qrValue={inviteLink}
            copyMessage={t('feature.communities.copied-community-invite')}
            shareValue={shareLink}
        />
    )
}

export default CommunityInvite
