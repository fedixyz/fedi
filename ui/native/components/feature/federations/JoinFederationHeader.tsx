import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Header from '../../ui/Header'

const JoinFederationHeader: React.FC = () => {
    const { t } = useTranslation()

    return (
        <Header
            backButton
            // onBackButtonPress={}
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.federations.join-federation')}
                </Text>
            }
        />
    )
}

export default JoinFederationHeader
