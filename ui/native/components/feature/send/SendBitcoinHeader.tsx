import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Header from '../../ui/Header'

const SendBitcoinHeader: React.FC = () => {
    const { t } = useTranslation()

    return (
        <Header
            backButton
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.send.send-bitcoin')}
                </Text>
            }
            closeButton
            closeRoute="Federations"
        />
    )
}

export default SendBitcoinHeader
