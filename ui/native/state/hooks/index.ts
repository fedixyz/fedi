import messaging from '@react-native-firebase/messaging'
import { useNavigation } from '@react-navigation/native'
import {
    MutableRefObject,
    useCallback,
    useEffect,
    useMemo,
    useRef,
} from 'react'
import { AppStateStatus, AppState as RNAppState } from 'react-native'
import DeviceInfo from 'react-native-device-info'
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux'

import { usePublishNotificationToken } from '@fedi/common/hooks/chat'
import {
    ensureHealthyMatrixStream,
    refreshActiveStabilityPool,
    selectCurrency,
    selectCurrencyLocale,
    selectStableBalance,
    selectStableBalancePending,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { fedimint } from '../../bridge'
import { NavigationHook } from '../../types/navigation'
import { useNotificationsPermission } from '../../utils/hooks'
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

export const useMatrixHealthCheck = () => {
    const appStateRef = useRef<AppStateStatus>(
        RNAppState.currentState,
    ) as MutableRefObject<AppStateStatus>
    const dispatch = useAppDispatch()

    useEffect(() => {
        // Subscribe to changes in AppState to detect when app goes from
        // background to foreground
        const subscription = RNAppState.addEventListener(
            'change',
            nextAppState => {
                if (
                    appStateRef.current.match(/inactive|background/) &&
                    nextAppState === 'active'
                ) {
                    dispatch(ensureHealthyMatrixStream())
                }
                appStateRef.current = nextAppState
            },
        )
        return () => subscription.remove()
    }, [dispatch])
}

// This hook gets the device's FCM token and publishes it
// to the Matrix Sygnal server
export const useMatrixPushNotifications = async () => {
    const { notificationsPermission } = useNotificationsPermission()
    const getDeviceToken = useMemo(() => {
        return async () => {
            if (!messaging().isDeviceRegisteredForRemoteMessages) {
                await messaging().registerDeviceForRemoteMessages()
            }
            return messaging().getToken()
        }
    }, [])
    usePublishNotificationToken(
        getDeviceToken,
        notificationsPermission !== 'granted',
        DeviceInfo.getBundleId(),
        DeviceInfo.getApplicationName(),
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
