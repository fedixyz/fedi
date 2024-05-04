import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'

import QRScreen from '../components/ui/QRScreen'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'FederationInvite'
>

const FederationInvite: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const { inviteLink } = route.params

    return (
        <QRScreen
            dark
            qrValue={inviteLink}
            copyMessage={t('feature.federations.copied-federation-invite')}
        />
    )
}

export default FederationInvite
