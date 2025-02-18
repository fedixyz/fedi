import { useCallback, useMemo } from 'react'
import { useSelector } from 'react-redux'

import { selectNostrNpub } from '@fedi/common/redux'
import {
    selectSupportPermissionGranted,
    selectZendeskPushNotificationToken,
    grantSupportPermission,
    saveZendeskPushNotificationToken,
    selectZendeskInitialized,
    setZendeskInitialized,
} from '@fedi/common/redux/support'

import { useAppDispatch } from '../../state/hooks'

export function useNpub() {
    const nostrPublic = useSelector(selectNostrNpub) // Retrieve nostrPublic
    return nostrPublic
}

export function useSupportPermission() {
    const dispatch = useAppDispatch()
    const supportPermissionGranted = useSelector(selectSupportPermissionGranted)
    const zendeskPushNotificationToken = useSelector(
        selectZendeskPushNotificationToken,
    )

    const grantPermission = useCallback(() => {
        dispatch(grantSupportPermission())
    }, [dispatch])

    const savePushNotificationToken = useCallback(
        (token: string) => {
            dispatch(saveZendeskPushNotificationToken(token))
        },
        [dispatch],
    )

    return useMemo(() => {
        return {
            supportPermissionGranted,
            zendeskPushNotificationToken,
            grantPermission,
            savePushNotificationToken,
        }
    }, [
        supportPermissionGranted,
        zendeskPushNotificationToken,
        grantPermission,
        savePushNotificationToken,
    ])
}

// Hook to manage Zendesk initialization
export function useZendeskInitialization() {
    const dispatch = useAppDispatch()
    const zendeskInitialized = useSelector(selectZendeskInitialized)

    const handleZendeskInitialization = useCallback(
        (isInitialized: boolean) => {
            dispatch(setZendeskInitialized(isInitialized))
        },
        [dispatch],
    )

    return useMemo(() => {
        return {
            zendeskInitialized,
            handleZendeskInitialization,
        }
    }, [zendeskInitialized, handleZendeskInitialization])
}
