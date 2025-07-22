import messaging from '@react-native-firebase/messaging'
import { useNavigation } from '@react-navigation/native'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Platform } from 'react-native'
import DeviceInfo from 'react-native-device-info'
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux'

import { usePublishNotificationToken } from '@fedi/common/hooks/chat'
import { usePushNotificationToken } from '@fedi/common/hooks/matrix'
import {
    refreshActiveStabilityPool,
    selectCurrency,
    selectCurrencyLocale,
    selectStableBalance,
    selectStableBalancePending,
} from '@fedi/common/redux'
import { selectSupportPermissionGranted } from '@fedi/common/redux/support'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../bridge'
import { NavigationHook } from '../../types/navigation'
import { useNotificationsPermission } from '../../utils/hooks'
import { updateZendeskPushNotificationToken } from '../../utils/support'
import type { AppDispatch, AppState } from '../store'

/**
 * Provides a `dispatch` function that allows you to dispatch redux actions.
 */
export const useAppDispatch: () => AppDispatch = useDispatch

/**
 * Provides application state from redux, given a selector.
 */
export const useAppSelector: TypedUseSelectorHook<AppState> = useSelector

export const usePrevious = <T = unknown>(value: T): T | undefined => {
    const ref = useRef<T>()
    useEffect(() => {
        ref.current = value
    })
    return ref.current
}

const notificationLog = makeLog('useMatrixPushNotifications')

// This hook gets the device's FCM token and publishes it
// to the Matrix Sygnal server
export const useMatrixPushNotifications = () => {
    const { notificationsPermission: permissionGranted } =
        useNotificationsPermission()
    const pushNotificationToken = usePushNotificationToken()
    const supportPermissionGranted = useSelector(selectSupportPermissionGranted)

    const getDeviceToken = useMemo<() => Promise<string>>(() => {
        return async () => {
            try {
                if (permissionGranted !== 'granted') {
                    const authStatus = await messaging().requestPermission()
                    if (
                        authStatus !==
                            messaging.AuthorizationStatus.AUTHORIZED &&
                        authStatus !== messaging.AuthorizationStatus.PROVISIONAL
                    ) {
                        const errorMsgNotGranted =
                            'Notification permission were not granted.'
                        notificationLog.warn(errorMsgNotGranted)
                        throw new Error(errorMsgNotGranted)
                    }
                } else {
                    notificationLog.info(
                        'Notification permissions already granted',
                    )
                }

                if (!messaging().isDeviceRegisteredForRemoteMessages) {
                    await messaging().registerDeviceForRemoteMessages()
                }

                // Fetch the APNs token (iOS only)
                if (Platform.OS === 'ios') {
                    const apnsToken = await messaging().getAPNSToken()
                    if (apnsToken) {
                        notificationLog.debug(`APNs Token: ${apnsToken}`)
                    } else {
                        notificationLog.warn('APNs Token not available.')
                    }
                }

                // Fetch the FCM token
                const fcmToken = await messaging().getToken()
                if (!fcmToken) {
                    const errorMsgTokenNotFetched =
                        "FCM Token couldn't be fetched."
                    notificationLog.warn(errorMsgTokenNotFetched)
                    throw new Error(errorMsgTokenNotFetched)
                }

                return fcmToken
            } catch (error) {
                notificationLog.error(
                    `Error fetching device tokens: ${JSON.stringify(error)}`,
                )
                throw error
            }
        }
    }, [permissionGranted])

    usePublishNotificationToken(
        getDeviceToken,
        DeviceInfo.getBundleId(),
        DeviceInfo.getApplicationName(),
        permissionGranted === 'granted',
        updateZendeskPushNotificationToken,
        supportPermissionGranted,
        pushNotificationToken,
    )
}

// This hook provides a stability pool function
// to makes sure to regularly refresh the account balance
export const useStabilityPool = () => {
    const dispatch = useAppDispatch()
    const navigation = useNavigation<NavigationHook>()
    const stableBalance = useAppSelector(selectStableBalance)
    const stableBalancePending = useAppSelector(selectStableBalancePending)
    const selectedCurrency = useAppSelector(selectCurrency)
    const currencyLocale = useAppSelector(selectCurrencyLocale)

    const refreshBalance = useCallback(() => {
        dispatch(
            refreshActiveStabilityPool({
                fedimint,
            }),
        )
    }, [dispatch])

    // Refreshes the active stability pool when the navigator
    // finishes transitioning onto the current screen
    useEffect(() => {
        const unsubscribe = navigation.addListener('transitionEnd', e => {
            if (!e.data.closing) {
                refreshBalance()
            }
        })

        return unsubscribe
    }, [refreshBalance, navigation])

    const formattedStableBalance = amountUtils.formatFiat(
        stableBalance,
        selectedCurrency,
        { symbolPosition: 'end', locale: currencyLocale },
    )
    const formattedStableBalancePending = amountUtils.formatFiat(
        stableBalancePending,
        selectedCurrency,
        { symbolPosition: 'end', locale: currencyLocale },
    )

    return {
        refreshBalance,
        formattedStableBalance,
        formattedStableBalancePending,
    }
}
