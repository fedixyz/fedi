import { ThemeProvider } from '@rneui/themed'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import SplashScreen from 'react-native-splash-screen'

import { FedimintProvider } from '@fedi/common/components/FedimintProvider'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import {
    refreshOnboardingStatus,
    selectEventListenersReady,
    setAppFlavor,
    setPlatform,
    setShouldLockDevice,
    tryRejoinFederationsPendingScratchRejoin,
} from '@fedi/common/redux'
import { selectStorageIsReady } from '@fedi/common/redux/storage'
import { TransactionEvent } from '@fedi/common/types'
import {
    DeviceRegistrationEvent,
    LogEvent,
    PanicEvent,
} from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint, getAppFlavor, initializeBridge } from '../bridge'
import { ErrorScreen } from '../screens/ErrorScreen'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import theme from '../styles/theme'
import { generateDeviceId } from '../utils/device-info'
import { useAppIsInForeground } from '../utils/hooks/notifications'
import { formatBridgeFfiLog } from '../utils/log'
import { displayPaymentReceivedNotification } from '../utils/notifications'

const log = makeLog('FediBridgeInitializer')
const ffiLog = makeLog('ffi')

interface Props {
    children: React.ReactNode
}

export const FediBridgeInitializer: React.FC<Props> = ({ children }) => {
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const [bridgeIsReady, setBridgeIsReady] = useState<boolean>(false)
    const [bridgeError, setBridgeError] = useState<unknown>()
    const hasLoadedStorage = useAppSelector(selectStorageIsReady)
    const eventListenersReady = useAppSelector(selectEventListenersReady)
    const dispatchRef = useUpdatingRef(dispatch)
    const isForeground = useAppIsInForeground()

    // Initialize redux store and bridge
    useEffect(() => {
        if (!hasLoadedStorage || !eventListenersReady) return

        const initialize = async () => {
            const start = Date.now()
            try {
                // Get the device ID, guaranteed to be unique and consistent on the same device
                const deviceId = await generateDeviceId()
                log.info('initializing bridge with deviceId', deviceId)
                const appFlavor = getAppFlavor()
                dispatchRef.current(setAppFlavor(appFlavor))
                dispatchRef.current(
                    setPlatform(Platform.OS === 'ios' ? 'ios' : 'android'),
                )
                await initializeBridge(deviceId, appFlavor)

                const stop = Date.now()
                log.info('initialized:', stop - start, 'ms OS:', Platform.OS)
                await dispatchRef
                    .current(refreshOnboardingStatus(fedimint))
                    .unwrap()

                // One-shot startup sweep: rejoin any federation a previous run
                // left pending a from-scratch rejoin — the same repair the
                // nonce-reuse listener triggers mid-session. It runs here
                // rather than in `initializeCommonStore`, which executes before
                // the bridge exists, where the RPC could only ever reject.
                //
                // Not awaited into the ready path: the rejoins are background
                // repair, and a slow or failing one must not hold the splash
                // screen up. Its rejection is logged rather than swallowed.
                dispatchRef
                    .current(
                        tryRejoinFederationsPendingScratchRejoin({ fedimint }),
                    )
                    .unwrap()
                    .catch(err => log.warn('pending-rejoin sweep failed', err))

                setBridgeIsReady(true)
            } catch (err) {
                log.error(
                    `bridge failed to initialize after ${Date.now() - start}ms`,
                    err,
                )
                setBridgeError(err)
            } finally {
                // Hide splash screen once we're ready
                // to show a screen
                SplashScreen.hide()
            }
        }

        initialize()
    }, [hasLoadedStorage, eventListenersReady, dispatchRef])

    useEffect(() => {
        // Initialize push notification sender
        const unsubscribeTransaction = fedimint.addListener(
            'transaction',
            async (event: TransactionEvent) => {
                if (isForeground)
                    return log.info(
                        'Payment received (foreground - no notification)',
                    )

                log.info(
                    'Payment received (background - delivering notification)',
                )
                await displayPaymentReceivedNotification(event, t)
            },
        )

        return () => unsubscribeTransaction()
    }, [t, isForeground])

    useEffect(() => {
        // Initialize logger
        const unsubscribeLog = fedimint.addListener(
            'log',
            (event: LogEvent) => {
                const formattedLog = formatBridgeFfiLog(event)
                if (formattedLog) {
                    ffiLog.info(formattedLog)
                }
            },
        )

        // Initialize panic listener
        const unsubscribePanic = fedimint.addListener(
            'panic',
            (event: PanicEvent) => {
                log.error('bridge panic', event)
                setBridgeError(event)
                // Hide splash screen so the initializer
                // ErrorScreen can be shown
                SplashScreen.hide()
            },
        )

        // Initialize locked device listener
        const unsubscribeDeviceRegistration = fedimint.addListener(
            'deviceRegistration',
            (event: DeviceRegistrationEvent) => {
                log.info('DeviceRegistrationEvent', event)
                if (event.state === 'conflict') {
                    dispatchRef.current(setShouldLockDevice(true))
                }
            },
        )

        return () => {
            unsubscribeLog()
            unsubscribePanic()
            unsubscribeDeviceRegistration()
        }
    }, [dispatchRef, t])

    if (bridgeIsReady && !bridgeError) {
        return (
            <FedimintProvider fedimint={fedimint}>{children}</FedimintProvider>
        )
    }

    if (bridgeError) {
        return (
            <SafeAreaProvider>
                <ThemeProvider theme={theme}>
                    <ErrorScreen error={bridgeError} />
                </ThemeProvider>
            </SafeAreaProvider>
        )
    }

    return null
}

export default FediBridgeInitializer
