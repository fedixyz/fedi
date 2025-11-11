import { useNavigation } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Header from '../../ui/Header'

const JoinFederationHeader: React.FC = () => {
    const { t } = useTranslation()
    const navigation = useNavigation()

    return (
        <Header
            backButton
            onBackButtonPress={() => {
                if (navigation.canGoBack()) navigation.goBack()
                else navigation.navigate('PublicFederations')
            }}
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('words.welcome')}
                </Text>
            }
        />
    )
}

export default JoinFederationHeader
