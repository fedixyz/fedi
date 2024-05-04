import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Header from '../../ui/Header'

type PersonalRecoveryHeaderProps = {
    backButton?: boolean
}

const PersonalRecoveryHeader: React.FC<PersonalRecoveryHeaderProps> = ({
    backButton,
}: PersonalRecoveryHeaderProps) => {
    const { t } = useTranslation()

    return (
        <Header
            backButton={backButton}
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.recovery.personal-recovery')}
                </Text>
            }
        />
    )
}

export default PersonalRecoveryHeader
