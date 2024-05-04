import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Header from '../../ui/Header'

const ConfirmSendEcashHeader: React.FC = () => {
    const { t } = useTranslation()

    return (
        <Header
            backButton
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.send.confirm-ecash-send')}
                </Text>
            }
            closeButton
        />
    )
}

export default ConfirmSendEcashHeader
