import React, {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useEffect,
} from 'react'
import { Linking } from 'react-native'
import { requestNotifications } from 'react-native-permissions'
import { useSelector } from 'react-redux'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { selectMatrixChatsWithoutDefaultGroupPreviewsList } from '@fedi/common/redux/matrix'
import { selectSupportPermissionGranted } from '@fedi/common/redux/support'
import { makeLog } from '@fedi/common/utils/log'

import { useNotificationsPermission } from '../../utils/hooks'
import { useUpdateZendeskNotificationCount } from '../../utils/hooks/support'
import { manuallyPublishNotificationToken } from '../../utils/notifications'
import { useMatrixPushNotifications } from '../hooks'

const log = makeLog('NotificationContext')

interface NotificationContextState {
    isNotificationEnabled: boolean
    triggerPushNotificationSetup: () => void
}

const NotificationContext = createContext<NotificationContextState | null>(null)

export const NotificationContextProvider: React.FC<{
    children: React.ReactNode
}> = ({ children }) => {
    const { notificationsPermission } = useNotificationsPermission()
    const supportPermissionGranted = useSelector(selectSupportPermissionGranted)
    const chatList = useSelector(
        selectMatrixChatsWithoutDefaultGroupPreviewsList,
    )
    const fedimint = useFedimint()

    log.debug(`Current notifications permission: ${notificationsPermission}`)

    // Automatically run the push notification setup on app startup
    useMatrixPushNotifications() // Triggers automatically if permissions are granted
    useUpdateZendeskNotificationCount() //initalise zendesk on startup and start polling for notifcation count. This also takes care of intialising the SDK

    // Manual trigger for publishing the notification token
    const triggerPushNotificationSetup = useCallback(async () => {
        log.info(
            'Manually triggering push notification setup... Permissions are: ' +
                notificationsPermission,
        )

        await manuallyPublishNotificationToken(
            supportPermissionGranted,
            fedimint,
        )
    }, [notificationsPermission, supportPermissionGranted, fedimint])

    const value = useMemo(
        () => ({
            isNotificationEnabled: notificationsPermission === 'granted',
            triggerPushNotificationSetup,
        }),
        [notificationsPermission, triggerPushNotificationSetup],
    )

    // Prompt for permissions once the user has at least one chats
    useEffect(() => {
        if (chatList.length >= 1 && notificationsPermission !== 'granted') {
            requestNotifications(['alert', 'sound', 'badge']).then(
                ({ status }) => {
                    if (status === 'blocked') return

                    if (status !== 'granted') {
                        Linking.openSettings()
                    }

                    triggerPushNotificationSetup()
                },
            )
        }
    }, [chatList.length, notificationsPermission, triggerPushNotificationSetup])

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
