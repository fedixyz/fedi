import React from 'react'
import { useTranslation } from 'react-i18next'

import { useNotificationsPermission } from '../../../utils/hooks'
import { PermissionGate } from './PermissionGate'

interface Props {
    children: React.ReactNode
}

export const NotificationsPermissionGate: React.FC<Props> = ({ children }) => {
    const { t } = useTranslation()
    const { notificationsPermission, requestNotificationsPermission } =
        useNotificationsPermission()

    if (notificationsPermission === 'denied') {
        return (
            <PermissionGate
                icon="Bell"
                title={t('feature.permissions.allow-notifications-title')}
                descriptionIcons={['Chat', 'Wallet', 'Notification']}
                descriptionText={t(
                    'feature.permissions.allow-notifications-description',
                )}
                onContinue={requestNotificationsPermission}
            />
        )
    }

    return <>{children}</>
}
