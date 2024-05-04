import { useRoute } from '@react-navigation/native'
import { useCallback, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import {
    check as checkPermission,
    request as requestPermission,
    checkNotifications,
    requestNotifications,
    PermissionStatus,
    PERMISSIONS,
} from 'react-native-permissions'

import { makeLog } from '@fedi/common/utils/log'

const log = makeLog('native/util/hooks')

/** Return whether or not we're in a screen that has the tabs navigator visible */
export function useHasBottomTabsNavigation() {
    const { name } = useRoute()
    return ['Home', 'Chat', 'OmniScanner'].includes(name)
}

export function useCameraPermission() {
    const [cameraPermission, setCameraPermission] = useState<PermissionStatus>()
    const permission = Platform.select({
        ios: PERMISSIONS.IOS.CAMERA,
        android: PERMISSIONS.ANDROID.CAMERA,
    })

    useEffect(() => {
        if (!permission) {
            log.error('useCameraPermission: unsupported platform')
            setCameraPermission('unavailable')
            return
        }
        checkPermission(permission)
            .then(status => {
                setCameraPermission(status)
            })
            .catch(err => {
                log.error('useCameraPermission check', err)
                setCameraPermission('unavailable')
            })
    }, [permission])

    const requestCameraPermission = useCallback(() => {
        if (!permission) {
            log.error('requestCameraPermission: unsupported platform')
            throw new Error('Unsupported platform')
        }
        return requestPermission(permission).then(status => {
            setCameraPermission(status)
        })
    }, [permission])

    return { cameraPermission, requestCameraPermission }
}

export function useNotificationsPermission() {
    const [notificationsPermission, setNotificationsPermission] =
        useState<PermissionStatus>()

    useEffect(() => {
        checkNotifications().then(res => {
            setNotificationsPermission(res.status)
        })
    }, [])

    const requestNotificationsPermission = useCallback(() => {
        requestNotifications(['alert', 'sound']).then(res => {
            setNotificationsPermission(res.status)
        })
    }, [])

    return { notificationsPermission, requestNotificationsPermission }
}
