import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Header from '../../ui/Header'

const RecoveryWordsHeader: React.FC = () => {
    const { t } = useTranslation()

    return (
        <Header
            backButton
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.backup.personal-backup')}
                </Text>
            }
        />
    )
}

export default RecoveryWordsHeader
