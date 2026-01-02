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
    selectMatrixAuth,
    setAppFlavor,
    setShouldLockDevice,
} from '@fedi/common/redux'
import { selectStorageIsReady } from '@fedi/common/redux/storage'
import { TransactionEvent } from '@fedi/common/types'
import {
    DeviceRegistrationEvent,
    LogEvent,
    PanicEvent,
} from '@fedi/common/types/bindings'
import { isDev } from '@fedi/common/utils/environment'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint, initializeBridge } from '../bridge'
import { getAppFlavor } from '../bridge/native'
import { ErrorScreen } from '../screens/ErrorScreen'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import theme from '../styles/theme'
import { generateDeviceId, isNightly } from '../utils/device-info'
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
    const matrixAuth = useAppSelector(selectMatrixAuth)
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
                await initializeBridge(deviceId, appFlavor)

                const stop = Date.now()
                log.info('initialized:', stop - start, 'ms OS:', Platform.OS)
                await dispatchRef
                    .current(refreshOnboardingStatus(fedimint))
                    .unwrap()
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

    // this is dev + nightly only logic to force an error if the production homeserver is still being used
    // TODO: remove this after a few months after all nightly users have updated & migrated
    useEffect(() => {
        if ((isNightly() || isDev()) && matrixAuth && matrixAuth.userId) {
            const [, homeserver] = matrixAuth.userId.split(':')
            // eslint-disable-next-line
            if (false && homeserver !== 'staging.m1.8fa.in') {
                setBridgeError(
                    new Error(
                        'This is an expected nightly only error intentionally forced to ensure clean metrics. Please uninstall & recover from seed.\n',
                    ),
                )
            }
        }
    }, [matrixAuth])

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
