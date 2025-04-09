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
        requestNotifications(['alert', 'sound', 'badge']).then(res => {
            setNotificationsPermission(res.status)
        })
    }, [])

    return { notificationsPermission, requestNotificationsPermission }
}

/*
 * Permissions hook for storing files to the OS filesystem
 * which is required for downloading files from chat messages
 */
export function useDownloadPermission() {
    const [downloadPermission, setDownloadPermission] =
        useState<PermissionStatus>()

    const getPermissions = useCallback(() => {
        switch (Platform.OS) {
            case 'ios':
                // TODO: Update to react-native-permissions v4 and use
                // PHOTO_LIBRARY_ADD_ONLY since we shouldn't need read
                // access to the photo library
                return [PERMISSIONS.IOS.PHOTO_LIBRARY]

            case 'android':
                // Android 10+ doesn't require any permission to download files
                if (Platform.Version >= 29) {
                    return []
                } else {
                    return [PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE]
                }

            default:
                return null
        }
    }, [])

    useEffect(() => {
        const permissions = getPermissions()

        if (permissions === null) {
            log.error('useDownloadPermission: unsupported platform')
            setDownloadPermission('unavailable')
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

                setDownloadPermission(
                    allGranted ? RESULTS.GRANTED : RESULTS.DENIED,
                )
            })
            .catch(err => {
                log.error('useDownloadPermission check', err)
                setDownloadPermission('unavailable')
            })
    }, [getPermissions])

    const requestDownloadPermission =
        useCallback((): Promise<PermissionStatus> => {
            const permissions = getPermissions()
            log.info('requestStoragePermission permissions', permissions)
            if (permissions === null) {
                log.error('requestDownloadPermission: unsupported platform')
                throw new Error('Unsupported platform')
            }

            return requestMultiple(permissions)
                .then(statuses => {
                    let allGranted = true
                    log.info('requestDownloadPermission statuses', statuses)

                    for (const permission of permissions) {
                        if (statuses[permission] !== RESULTS.GRANTED) {
                            allGranted = false
                            break
                        }
                    }

                    const result = allGranted ? RESULTS.GRANTED : RESULTS.DENIED

                    setDownloadPermission(result)
                    return result
                })
                .catch(err => {
                    log.error('useDownloadPermission check', err)
                    setDownloadPermission('unavailable')
                    return RESULTS.UNAVAILABLE
                })
        }, [getPermissions])

    return { downloadPermission, requestDownloadPermission }
}
/*
 * Permissions hook for reading from the OS filesystem
 * which is required for attaching files to chat messages
 */
export function useStoragePermission() {
    const [storagePermission, setStoragePermission] =
        useState<PermissionStatus>()

    const getPermissions = useCallback(() => {
        switch (Platform.OS) {
            case 'ios':
                return [PERMISSIONS.IOS.PHOTO_LIBRARY]

            case 'android':
                if (Platform.Version >= 33) {
                    return [] // No permissions needed on Android 11+
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

    const requestStoragePermission =
        useCallback((): Promise<PermissionStatus> => {
            const permissions = getPermissions()
            if (permissions === null) {
                log.error('requestStoragePermission: unsupported platform')
                throw new Error('Unsupported platform')
            }

            return requestMultiple(permissions)
                .then(statuses => {
                    let allGranted = true
                    let hasLimitedAccess = false

                    for (const permission of permissions) {
                        if (statuses[permission] === RESULTS.LIMITED) {
                            hasLimitedAccess = true
                        } else if (statuses[permission] !== RESULTS.GRANTED) {
                            allGranted = false
                        }
                    }

                    // Determine final result
                    const result = allGranted
                        ? RESULTS.GRANTED
                        : hasLimitedAccess
                          ? RESULTS.LIMITED
                          : RESULTS.DENIED

                    setStoragePermission(result)
                    return result
                })
                .catch(err => {
                    log.error('requestStoragePermission check', err)
                    setStoragePermission('unavailable')
                    return RESULTS.UNAVAILABLE
                })
        }, [getPermissions])

    return { storagePermission, requestStoragePermission }
}
