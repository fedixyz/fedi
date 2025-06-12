import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Success from '../components/ui/Success'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'EcashSendCancelled'
>

const EcashSendCancelled: React.FC<Props> = () => {
    const { t } = useTranslation()

    return <Success messageText={t('phrases.canceled-ecash-send')} />
}

export default EcashSendCancelled
