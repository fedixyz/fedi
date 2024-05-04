import React from 'react'
import { useTranslation } from 'react-i18next'

import { useCameraPermission } from '../../../utils/hooks'
import { PermissionGate } from './PermissionGate'

interface Props {
    children: React.ReactNode
    alternativeActionButton?: React.ReactNode
}

export const CameraPermissionGate: React.FC<Props> = ({
    children,
    alternativeActionButton,
}) => {
    const { t } = useTranslation()
    const { cameraPermission, requestCameraPermission } = useCameraPermission()

    if (cameraPermission === 'denied') {
        return (
            <PermissionGate
                icon="Scan"
                title={t('feature.permissions.allow-camera-title')}
                descriptionIcons={['Qr', 'Chat', 'Wallet']}
                descriptionText={t(
                    'feature.permissions.allow-camera-description',
                )}
                onContinue={requestCameraPermission}
                alternativeActionButton={alternativeActionButton}
            />
        )
    }

    return <>{children}</>
}
