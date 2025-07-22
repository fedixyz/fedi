import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { selectRegisteredDevices } from '@fedi/common/redux'

import Success from '../components/ui/Success'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'PersonalRecoverySuccess'
>

const PersonalRecoverySuccess: React.FC<Props> = () => {
    const { t } = useTranslation()
    const registeredDevices = useAppSelector(selectRegisteredDevices)

    if (registeredDevices.length === 0) {
        return <ActivityIndicator />
    }

    return (
        <Success
            messageText={t('feature.recovery.you-completed-personal-recovery')}
            buttonText={t('words.okay')}
            nextScreen={'RecoveryWalletOptions'}
        />
    )
}

export default PersonalRecoverySuccess
