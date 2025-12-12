import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Header from '../../ui/Header'
import { StabilityInfoIcon } from './StabilityInfoIcon'

const StabilityTransferHeader: React.FC = () => {
    const { t } = useTranslation()

    return (
        <>
            <Header
                backButton
                headerCenter={
                    <Text bold numberOfLines={1} adjustsFontSizeToFit>
                        {t('words.transfer')}
                    </Text>
                }
                headerRight={<StabilityInfoIcon />}
            />
        </>
    )
}

export default StabilityTransferHeader
