import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Success from '../components/ui/Success'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'GuardianFeesSuccess'
>

const GuardianFeesSuccess: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()

    return (
        <Success
            messageText={t('feature.guardian-fees.transfer-success')}
            button={
                <Button
                    title={t('words.done')}
                    onPress={() => navigation.goBack()}
                />
            }
        />
    )
}

export default GuardianFeesSuccess
