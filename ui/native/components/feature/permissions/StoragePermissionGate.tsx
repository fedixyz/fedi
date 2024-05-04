import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RESULTS } from 'react-native-permissions'

import { useStoragePermission } from '../../../utils/hooks'
import { PermissionGate } from './PermissionGate'

interface Props {
    children: React.ReactNode
    alternativeActionButton?: React.ReactNode
}

export const StoragePermissionGate: React.FC<Props> = ({
    children,
    alternativeActionButton,
}) => {
    const { t } = useTranslation()
    const { storagePermission, requestStoragePermission } =
        useStoragePermission()

    const [didTry, setDidTry] = useState<boolean>(false)

    const handleContinueClick = async () => {
        await requestStoragePermission()
        setDidTry(true)
    }

    // we only have one chance to request permissions
    if (storagePermission === RESULTS.DENIED && !didTry) {
        return (
            <PermissionGate
                icon="FediFile"
                title={t('feature.permissions.allow-storage-title')}
                descriptionIcons={['Photo', 'Note', 'Video']}
                descriptionText={t(
                    'feature.permissions.allow-storage-description',
                )}
                onContinue={handleContinueClick}
                alternativeActionButton={alternativeActionButton}
            />
        )
    }

    return <>{children}</>
}
