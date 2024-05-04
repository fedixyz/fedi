import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Header from '../../ui/Header'

type SocialBackupHeaderProps = {
    backButton?: boolean
    closeButton?: boolean
}

const SocialBackupHeader: React.FC<SocialBackupHeaderProps> = ({
    backButton = false,
    closeButton = false,
}: SocialBackupHeaderProps) => {
    const { t } = useTranslation()

    return (
        <Header
            backButton={backButton}
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.backup.file-backup')}
                </Text>
            }
            closeButton={closeButton}
        />
    )
}

export default SocialBackupHeader
