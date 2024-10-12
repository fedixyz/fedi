import { useRoute } from '@react-navigation/native'
import { useCallback, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import {
    PERMISSIONS,
    PermissionStatus,
    RESULTS,
    checkMultiple,
    checkNotifications,
    check as checkPermission,
    requestMultiple,
    requestNotifications,
    request as requestPermission,
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

export function useStoragePermission() {
    const [storagePermission, setStoragePermission] =
        useState<PermissionStatus>()

    const getPermissions = useCallback(() => {
        switch (Platform.OS) {
            case 'ios':
                return [PERMISSIONS.IOS.PHOTO_LIBRARY]

            case 'android':
                if (Platform.Version >= 33) {
                    return [PERMISSIONS.ANDROID.READ_MEDIA_IMAGES]
                }

                return [PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE]

            default:
                return null
        }
    }, [])

    useEffect(() => {
        const permissions = getPermissions()

        if (permissions === null) {
            log.error('useStoragePermission: unsupported platform')
            setStoragePermission('unavailable')
            return
        }

        checkMultiple(permissions)
            .then(statuses => {
                let allGranted = true

                for (const permission of permissions) {
                    if (statuses[permission] !== RESULTS.GRANTED) {
                        allGranted = false
                        break
                    }
                }

                setStoragePermission(
                    allGranted ? RESULTS.GRANTED : RESULTS.DENIED,
                )
            })
            .catch(err => {
                log.error('useStoragePermission check', err)
                setStoragePermission('unavailable')
            })
    }, [getPermissions])

    const requestStoragePermission = useCallback(() => {
        const permissions = getPermissions()

        if (permissions === null) {
            log.error('requestStoragePermission: unsupported platform')
            throw new Error('Unsupported platform')
        }

        return requestMultiple(permissions)
            .then(statuses => {
                let allGranted = true

                for (const permission of permissions) {
                    if (statuses[permission] !== RESULTS.GRANTED) {
                        allGranted = false
                        break
                    }
                }

                setStoragePermission(
                    allGranted ? RESULTS.GRANTED : RESULTS.DENIED,
                )
            })
            .catch(err => {
                log.error('useStoragePermission check', err)
                setStoragePermission('unavailable')
            })
    }, [getPermissions])

    return { storagePermission, requestStoragePermission }
}
