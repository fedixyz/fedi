import { ThemeProvider } from '@rneui/themed'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import SplashScreen from 'react-native-splash-screen'

import { useUpdatingRef } from '@fedi/common/hooks/util'
import {
    fetchRegisteredDevices,
    fetchSocialRecovery,
    initializeDeviceId,
    initializeFedimintVersion,
    initializeNostrKeys,
    previewAllDefaultChats,
    refreshFederations,
    selectDeviceId,
    setDeviceIndexRequired,
    setShouldLockDevice,
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

import { fedimint, initializeBridge, subscribeToBridgeEvents } from '../bridge'
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
    const deviceId = useAppSelector(selectDeviceId)
    const hasLoadedStorage = useAppSelector(selectHasLoadedFromStorage)
    const dispatchRef = useUpdatingRef(dispatch)
    const isForeground = useAppIsInForeground()

    // Initialize device ID
    useEffect(() => {
        const handleDeviceId = async () => {
            await dispatch(
                initializeDeviceId({ getDeviceId: generateDeviceId }),
            ).unwrap()
        }
        if (!deviceId && hasLoadedStorage) handleDeviceId()
    }, [deviceId, dispatch, hasLoadedStorage])

    // Initialize Native Event Listeners
    useEffect(() => {
        const subscribe = async () => {
            const subscriptions = await subscribeToBridgeEvents()
            log.info('initialized bridge listeners')
            return subscriptions
        }
        const listeners = subscribe()

        // Cleanup native event listeners
        return () => {
            listeners.then(subs => subs.map(s => s.remove()))
        }
    }, [])

    // Initialize redux store and bridge
    useEffect(() => {
        if (!deviceId) return
        const start = Date.now()
        initializeBridge(deviceId)
            .then(() => {
                const stop = Date.now()
                log.info('initialized:', stop - start, 'ms OS:', Platform.OS)
                return fedimint.bridgeStatus()
            })
            .then(status => {
                log.info('bridgeStatus', status)
                // These all happen in parallel after bridge is initialized
                // Only throw (via unwrap) for refreshFederations.
                return Promise.all([
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
            })
            .then(() => {
                // wait until after the matrix client is started to refresh federations because
                // the latest metadata may include new default chats that require
                // matrix to fetch the room previews
                return dispatchRef
                    .current(refreshFederations(fedimint))
                    .unwrap()
            })
            .then(() => {
                setBridgeIsReady(true)
                // preview chats after matrix client has finished initializing
                dispatchRef.current(previewAllDefaultChats())
                dispatchRef.current(initializeFedimintVersion({ fedimint }))
            })
            .catch(err => {
                log.error(
                    `bridge failed to initialize after ${Date.now() - start}ms`,
                    err,
                )
                setBridgeError(err)
            })
            .finally(() => {
                // Hide splash screen once we're ready
                // to show a screen
                SplashScreen.hide()
            })
    }, [deviceId, dispatchRef])

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
