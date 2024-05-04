import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Header from '../../ui/Header'
import BetaBanner from './BetaBanner'

const ConfirmDepositHeader: React.FC = () => {
    const { t } = useTranslation()

    return (
        <>
            <Header
                backButton
                headerCenter={
                    <Text bold>
                        {t('feature.stabilitypool.confirm-deposit')}
                    </Text>
                }
            />
            <BetaBanner />
        </>
    )
}

export default ConfirmDepositHeader
