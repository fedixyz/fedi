import notifee from '@notifee/react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'

import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../bridge'

const log = makeLog('Notifications')

/**
 * Hook to track whether the app is in the foreground.
 * ref: https://reactnative.dev/docs/appstate.html#addeventlistener
 *
 * @returns true if app is running in the foreground
 * @returns false if user is in another app or on the home screen
 */
export const useAppIsInForeground = () => {
    const appState = useRef(AppState.currentState)
    const [isActive, setIsActive] = useState<boolean>(
        appState.current === 'active',
    )

    useEffect(() => {
        const subscription = AppState.addEventListener(
            'change',
            nextAppState => {
                if (appState.current === nextAppState) return
                setIsActive(nextAppState === 'active')

                // Handles foreground tasks in the bridge
                // (e.g. refetching community meta)
                if (nextAppState === 'active') fedimint.onAppForeground()

                appState.current = nextAppState
            },
        )
        return () => subscription.remove()
    }, [])

    // True if
    return isActive
}

/**
 *  Dismisses IOS notifications on focus
 */
export const useDismissIosNotifications = () => {
    const dismiss = useCallback(() => {
        notifee.setBadgeCount(0)
        log.info('Reset IOS Badge count to 0')
    }, [])
    useFocusEffect(dismiss)
}
