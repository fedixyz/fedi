import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Header from '../../ui/Header'

type RecoveryAssistHeaderProps = {
    backButton?: boolean
    closeButton?: boolean
}

const RecoveryAssistHeader: React.FC<RecoveryAssistHeaderProps> = ({
    backButton = false,
    closeButton = false,
}: RecoveryAssistHeaderProps) => {
    const { t } = useTranslation()

    return (
        <Header
            backButton={backButton}
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.recovery.recovery-assist')}
                </Text>
            }
            closeButton={closeButton}
        />
    )
}

export default RecoveryAssistHeader
