import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Header from '../../ui/Header'
import BetaBanner from './BetaBanner'

const ConfirmWithdrawHeader: React.FC = () => {
    const { t } = useTranslation()

    return (
        <>
            <Header
                backButton
                headerCenter={
                    <Text bold>
                        {t('feature.stabilitypool.confirm-withdrawal')}
                    </Text>
                }
            />
            <BetaBanner />
        </>
    )
}

export default ConfirmWithdrawHeader
