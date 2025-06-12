import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Success from '../components/ui/Success'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'CreatedPin'>

const CreatedPin: React.FC<Props> = () => {
    const { t } = useTranslation()

    return (
        <Success
            messageText={t('feature.pin.pin-setup-successful')}
            buttonText={t('words.done')}
            nextScreen="PinAccess"
        />
    )
}

export default CreatedPin
