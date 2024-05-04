import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Success from '../components/ui/Success'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'RecoveryAssistSuccess'
>

const RecoveryAssistSuccess: React.FC<Props> = () => {
    const { t } = useTranslation()

    return (
        <Success
            messageText={t('feature.recovery.recovery-assist-thank-you')}
            buttonText={t('words.continue')}
        />
    )
}

export default RecoveryAssistSuccess
