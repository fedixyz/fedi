import { ThemeProvider } from '@rneui/themed'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import SplashScreen from 'react-native-splash-screen'

import { useObserveMatrixSyncStatus } from '@fedi/common/hooks/matrix'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import {
    fetchRegisteredDevices,
    fetchSocialRecovery,
    initializeFedimintVersion,
    initializeNostrKeys,
    previewAllDefaultChats,
    refreshFederations,
    selectMatrixStarted,
    setDeviceIndexRequired,
    setShouldLockDevice,
    setShouldMigrateSeed,
    startMatrixClient,
} from '@fedi/common/redux'
import { selectHasLoadedFromStorage } from '@fedi/common/redux/storage'
import { TransactionEvent } from '@fedi/common/types'
import {
    DeviceRegistrationEvent,
    LogEvent,
    PanicEvent,
} from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint, initializeBridge } from '../bridge'
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
    const started = useAppSelector(selectMatrixStarted)
    const [bridgeError, setBridgeError] = useState<unknown>()
    const hasLoadedStorage = useAppSelector(selectHasLoadedFromStorage)
    const dispatchRef = useUpdatingRef(dispatch)
    const isForeground = useAppIsInForeground()

    useObserveMatrixSyncStatus(started)

    // Initialize redux store and bridge
    useEffect(() => {
        if (!hasLoadedStorage) return

        const initialize = async () => {
            const start = Date.now()
            try {
                // Get the device ID, guaranteed to be unique and consistent on the same device
                const deviceId = await generateDeviceId()
                log.info('initializing bridge with deviceId', deviceId)
                await initializeBridge(deviceId)

                const stop = Date.now()
                log.info('initialized:', stop - start, 'ms OS:', Platform.OS)

                const status = await fedimint.bridgeStatus()
                log.info('bridgeStatus', status)

                // These all happen in parallel after bridge is initialized
                await Promise.all([
                    dispatchRef.current(fetchSocialRecovery(fedimint)),
                    dispatchRef.current(initializeNostrKeys({ fedimint })),
                    // this happens when the user entered seed words but quit the app
                    // before completing device index selection so we fetch devices
                    // again since that typically gets fetched from recoverFromMnemonic
                    ...(status?.deviceIndexAssignmentStatus === 'unassigned'
                        ? [
                              dispatchRef.current(setDeviceIndexRequired(true)),
                              dispatchRef.current(
                                  // TODO: make sure this is offline-friendly? should it be?
                                  fetchRegisteredDevices(fedimint),
                              ),
                          ]
                        : []),
                    // if there is no matrix session yet we will start the matrix
                    // client either during recovery or during onboarding after a
                    // display name is entered
                    ...(status?.matrixSetup
                        ? [dispatchRef.current(startMatrixClient({ fedimint }))]
                        : []),
                ])

                // This means the user has migrated their seed to a new device via device/app
                // cloning so we need to prompt them to reinstall and do a device transfer
                // so exit early without proceeding with further initialization
                if (
                    status?.bridgeFullInitError &&
                    status.bridgeFullInitError.type === 'v2IdentifierMismatch'
                ) {
                    dispatchRef.current(setShouldMigrateSeed(true))
                    setBridgeIsReady(true)
                    return
                }

                // wait until after the matrix client is started to refresh federations because
                // the latest metadata may include new default chats that require
                // matrix to fetch the room previews
                await dispatchRef.current(refreshFederations(fedimint)).unwrap()

                setBridgeIsReady(true)
                // preview chats after matrix client has finished initializing
                dispatchRef.current(previewAllDefaultChats())
                dispatchRef.current(initializeFedimintVersion({ fedimint }))
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
    }, [hasLoadedStorage, dispatchRef])

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
                ffiLog.info(formattedLog)
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
        return <>{children}</>
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
