import React, {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useEffect,
    useRef,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Linking } from 'react-native'
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
    const { t } = useTranslation()
    const { notificationsPermission, requestNotificationsPermission } =
        useNotificationsPermission()
    const supportPermissionGranted = useSelector(selectSupportPermissionGranted)
    const chatList = useSelector(
        selectMatrixChatsWithoutDefaultGroupPreviewsList,
    )
    const fedimint = useFedimint()
    const isRequestingPermission = useRef(false)

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

    // 'denied' only means the OS prompt is unanswered (iOS notDetermined,
    // Android still requestable); an actual decline settles to 'blocked'.
    // The ref keeps chat-sync re-fires from stacking OS requests while a
    // prompt is open and unanswered.
    useEffect(() => {
        if (
            chatList.length === 0 ||
            notificationsPermission !== 'denied' ||
            isRequestingPermission.current
        ) {
            return
        }
        isRequestingPermission.current = true
        requestNotificationsPermission()
            .then(status => {
                if (status === 'granted' || status === 'limited') {
                    triggerPushNotificationSetup()
                } else if (status === 'blocked') {
                    Alert.alert(
                        t('feature.permissions.notifications-off-title'),
                        t('feature.permissions.notifications-off-description'),
                        [
                            { text: t('phrases.not-now'), style: 'cancel' },
                            {
                                text: t('phrases.open-settings'),
                                onPress: () => Linking.openSettings(),
                            },
                        ],
                    )
                }
            })
            .catch(err =>
                log.error('notifications permission request failed', err),
            )
            .finally(() => {
                isRequestingPermission.current = false
            })
    }, [
        chatList.length,
        notificationsPermission,
        requestNotificationsPermission,
        triggerPushNotificationSetup,
        t,
    ])

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
