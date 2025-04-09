import { useNavigation } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { NavigationHook } from '../../../types/navigation'
import Header from '../../ui/Header'

const CreatePollHeader: React.FC = () => {
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()

    return (
        <Header
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.chat.create-a-poll')}
                </Text>
            }
            closeButton
            onClose={() => navigation.goBack()}
        />
    )
}

export default CreatePollHeader
