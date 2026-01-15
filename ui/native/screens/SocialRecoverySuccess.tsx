import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Success from '../components/ui/Success'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'SocialRecoverySuccess'
>

const SocialRecoverySuccess: React.FC<Props> = () => {
    const { t } = useTranslation()

    return (
        <Success
            messageText={t('feature.recovery.you-completed-social-recovery')}
            buttonText={t('words.okay')}
            nextScreen={'RecoveryWalletOptions'}
        />
    )
}

export default SocialRecoverySuccess
