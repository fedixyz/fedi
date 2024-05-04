import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { selectCurrency } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import Header from '../../ui/Header'
import BetaBanner from './BetaBanner'

const StabilityHistoryHeader: React.FC = () => {
    const { t } = useTranslation()
    const selectedCurrency = useAppSelector(selectCurrency)

    return (
        <>
            <Header
                backButton
                headerCenter={
                    <Text bold>{`${selectedCurrency} ${t(
                        'words.history',
                    )}`}</Text>
                }
            />
            <BetaBanner />
        </>
    )
}

export default StabilityHistoryHeader
