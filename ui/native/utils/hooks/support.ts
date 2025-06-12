import { useNavigation } from '@react-navigation/native'
import { useCallback, useEffect, useRef } from 'react'
import * as Zendesk from 'react-native-zendesk-messaging'
import { useSelector } from 'react-redux'

import { selectNostrNpub } from '@fedi/common/redux'
import {
    selectSupportPermissionGranted,
    selectZendeskInitialized,
    setZendeskInitialized,
    updateZendeskUnreadMessageCount,
} from '@fedi/common/redux/support'
import { makeLog } from '@fedi/common/utils/log'

import { useAppDispatch } from '../../state/hooks'
import { NavigationHook } from '../../types/navigation'
import {
    useDisplayName,
    zendeskInitialize,
    zendeskOpenMessagingView,
} from '../support'

const log = makeLog('native/utils/hooks/support')

/**
 * Hook to update the unread message count from Zendesk and Redux.
 * Runs every 20 seconds.
 */
export const useUpdateZendeskNotificationCount = () => {
    const dispatch = useAppDispatch()
    const supportPermissionGranted = useSelector(selectSupportPermissionGranted)
    const zendeskInitialized = useSelector(selectZendeskInitialized)
    const nostrNpub = useSelector(selectNostrNpub)
    const displayName = useDisplayName()
    const zendeskRefreshTime = 8_000 // 8 seconds
    const intervalRef = useRef<NodeJS.Timeout | null>(null) // Stores interval reference

    const fetchUnreadMessageCount = useCallback(async () => {
        if (!zendeskInitialized) {
            await zendeskInitialize(
                nostrNpub ?? null,
                displayName,
                isInitialized => dispatch(setZendeskInitialized(isInitialized)),
                error => {
                    log.error('Zendesk initialization failed', error)
                },
            )
            log.info('Zendesk successfully initialized.')
        }

        try {
            const count = await Zendesk.getUnreadMessageCount()
            dispatch(updateZendeskUnreadMessageCount(count))
            log.info(`Updated unread Zendesk messages count: ${count}`)
        } catch (error) {
            log.error('Failed to fetch unread Zendesk messages', error)
        }
    }, [dispatch, zendeskInitialized, nostrNpub, displayName])

    useEffect(() => {
        if (!supportPermissionGranted) {
            log.info(
                'Support permission not granted. Will not fetch unread messages.',
            )
            return
        }

        if (intervalRef.current) {
            clearInterval(intervalRef.current) // Ensure no duplicate timers
        }

        intervalRef.current = setInterval(() => {
            fetchUnreadMessageCount()
        }, zendeskRefreshTime)

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
        }
    }, [fetchUnreadMessageCount, supportPermissionGranted])

    return null // Hook does not return anything
}

export function useLaunchZendesk() {
    const dispatch = useAppDispatch()
    const navigation = useNavigation<NavigationHook>()

    const nostrNpub = useSelector(selectNostrNpub)
    const displayName = useDisplayName()
    const supportPermissionGranted = useSelector(selectSupportPermissionGranted)
    const zendeskInitialized = useSelector(selectZendeskInitialized)

    const onError = useCallback((error: Error) => {
        log.error('Zendesk initialization failed', error)
    }, [])

    const launchZendesk = useCallback(
        async (newlyGranted = false) => {
            if (!supportPermissionGranted && !newlyGranted) {
                return navigation.navigate('HelpCentre', {
                    fromOnboarding: false,
                })
            }

            if (!zendeskInitialized) {
                await zendeskInitialize(
                    nostrNpub ?? null,
                    displayName,
                    (isInitialized: boolean) =>
                        dispatch(setZendeskInitialized(isInitialized)),
                    onError,
                )
            }

            await zendeskOpenMessagingView({ onError })
        },
        [
            zendeskInitialized,
            supportPermissionGranted,
            nostrNpub,
            displayName,
            dispatch,
            navigation,
            onError,
        ],
    )

    return { launchZendesk }
}
