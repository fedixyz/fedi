import { useNavigation } from '@react-navigation/native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RESULTS } from 'react-native-permissions'

import { useStoragePermission } from '../../../utils/hooks'
import { PermissionGate } from './PermissionGate'

interface Props {
    children: React.ReactNode
}

export const StoragePermissionGate: React.FC<Props> = ({ children }) => {
    const { t } = useTranslation()
    const navigation = useNavigation()
    const { storagePermission, requestStoragePermission } =
        useStoragePermission()

    const [didTry, setDidTry] = useState<boolean>(false)

    const handleContinueClick = async () => {
        await requestStoragePermission()
        setDidTry(true)
    }

    useEffect(() => {
        // Skip the Add Avatar Screen if permission denied
        if (storagePermission === RESULTS.DENIED && didTry) {
            navigation.reset({
                index: 0,
                routes: [{ name: 'FederationGreeting' }],
            })
        }
    }, [storagePermission, didTry, navigation])

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
            />
        )
    }

    return <>{children}</>
}
