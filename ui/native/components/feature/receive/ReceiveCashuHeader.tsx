import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Header from '../../ui/Header'

const ReceiveCashuHeader: React.FC = () => {
    const { t } = useTranslation()

    return (
        <Header
            backButton
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.receive.receive-cashu')}
                </Text>
            }
            closeButton
        />
    )
}

export default ReceiveCashuHeader
