import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Header from '../../ui/Header'

const DepositInitiatedHeader: React.FC = () => {
    const { t } = useTranslation()

    return (
        <>
            <Header
                centerContainerStyle={{ minHeight: 40 }}
                headerCenter={
                    <Text bold>
                        {t('feature.stabilitypool.deposit-intiated')}
                    </Text>
                }
            />
        </>
    )
}

export default DepositInitiatedHeader
