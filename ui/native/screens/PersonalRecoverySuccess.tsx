import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { selectActiveFederationId } from '@fedi/common/redux'

import Success from '../components/ui/Success'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'PersonalRecoverySuccess'
>

const PersonalRecoverySuccess: React.FC<Props> = () => {
    const { t } = useTranslation()
    const activeFederationId = useAppSelector(selectActiveFederationId)

    return (
        <Success
            messageText={t('feature.recovery.you-completed-personal-recovery')}
            buttonText={t('words.okay')}
            // returning members might still need to set their username
            nextScreen={activeFederationId ? 'Initializing' : 'JoinFederation'}
        />
    )
}

export default PersonalRecoverySuccess
