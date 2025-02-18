import React, { createContext, useCallback, useContext, useMemo } from 'react'

import { makeLog } from '@fedi/common/utils/log'

import { useNotificationsPermission } from '../../utils/hooks'
import { manuallyPublishNotificationToken } from '../../utils/notifications'
import { useMatrixPushNotifications } from '../hooks'

const log = makeLog('NotificationContext')

interface NotificationContextState {
    isNotificationEnabled: boolean
    triggerPushNotificationSetup: () => void // Manual trigger function
}

const NotificationContext = createContext<NotificationContextState | null>(null)

export const NotificationContextProvider: React.FC<{
    children: React.ReactNode
}> = ({ children }) => {
    const { notificationsPermission } = useNotificationsPermission() // Track permission status
    log.debug(`Current notifications permission: ${notificationsPermission}`)

    // Automatically run the push notification setup on app startup
    useMatrixPushNotifications() // Triggers automatically if permissions are granted

    // Manual trigger for publishing the notification token
    const triggerPushNotificationSetup = useCallback(async () => {
        log.info(
            'Manually triggering push notification setup... Permissions are: ' +
                notificationsPermission,
        )
        await manuallyPublishNotificationToken() // Call manual publishing function
    }, [notificationsPermission]) // Add dependencies

    const value = useMemo(
        () => ({
            isNotificationEnabled: notificationsPermission === 'granted',
            triggerPushNotificationSetup, // Expose manual trigger
        }),
        [notificationsPermission, triggerPushNotificationSetup],
    )

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    )
}

export function useNotificationContext() {
    const context = useContext(NotificationContext)
    if (!context) {
        log.error(
            'useNotificationContext called outside NotificationContextProvider',
        )
        throw new Error(
            'useNotificationContext must be used within a NotificationContextProvider',
        )
    }
    return context
}
