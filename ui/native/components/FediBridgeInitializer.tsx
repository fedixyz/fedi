import notifee from '@notifee/react-native'
import { ThemeProvider } from '@rneui/themed'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import RNFS from 'react-native-fs'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import SplashScreen from 'react-native-splash-screen'

import {
    initializeDeviceId,
    selectDeviceId,
    selectFederations,
} from '@fedi/common/redux'
import { selectHasLoadedFromStorage } from '@fedi/common/redux/storage'
import { TransactionDirection, TransactionEvent } from '@fedi/common/types'
import { LogEvent, PanicEvent } from '@fedi/common/types/bindings'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint, initializeBridge } from '../bridge'
import { ErrorScreen } from '../screens/ErrorScreen'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { store } from '../state/store'
import theme from '../styles/theme'
import { generateDeviceId } from '../utils/device-info'

const log = makeLog('FediBridgeInitializer')

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

    // Initialize device ID
    useEffect(() => {
        const handleDeviceId = async () => {
            await dispatch(
                initializeDeviceId({ getDeviceId: generateDeviceId }),
            ).unwrap()
        }
        if (!deviceId && hasLoadedStorage) handleDeviceId()
    }, [deviceId, dispatch, hasLoadedStorage])

    // Initialize redux store and bridge
    useEffect(() => {
        async function onInitializeBridge() {
            if (!deviceId) return
            log.info(
                'initializing connection to federation',
                RNFS.DocumentDirectoryPath,
            )
            const start = Date.now()
            try {
                await initializeBridge(RNFS.DocumentDirectoryPath, deviceId)
            } catch (err) {
                log.error('bridge failed to initialize', err)
                setBridgeError(err)
                SplashScreen.hide()
                return
            }
            setBridgeIsReady(true)
            const stop = Date.now()
            log.info('initialized:', stop - start, 'ms OS:', Platform.OS)
        }

        onInitializeBridge()
    }, [deviceId])

    useEffect(() => {
        // Initialize logger
        const unsubscribeLog = fedimint.addListener(
            'log',
            (event: LogEvent) => {
                // Strip escape characters
                const stripped = event.log.replace('\\', '')
                log.info('OS:', Platform.OS, `": log" -> "${stripped}"`)
            },
        )

        // Initialize push notification sender
        const unsubscribeTransaction = fedimint.addListener(
            'transaction',
            async (event: TransactionEvent) => {
                // Create a channel (required for Android)
                const channelId = await notifee.createChannel({
                    id: 'transactions',
                    name: 'Transactions Channel',
                })

                // Display notifications only for incoming transactions
                if (
                    event.transaction.direction === TransactionDirection.receive
                ) {
                    const { amount, onchainState, oobState } = event.transaction
                    // dont show notification for onchain txn until it is claimed
                    if (onchainState && onchainState.type !== 'claimed') return
                    // dont show notification for ecash txn until it is done
                    if (oobState && oobState.type !== 'done') return

                    const federations = selectFederations(store.getState())
                    const federation = federations.find(
                        f => f.id === event.federationId,
                    )
                    await notifee.displayNotification({
                        title: federation
                            ? `${federation.name}: ${t(
                                  'phrases.transaction-received',
                              )}`
                            : t('phrases.transaction-received'),
                        body: `${amountUtils.formatNumber(
                            amountUtils.msatToSat(amount),
                        )} ${t('words.sats')}`,
                        android: {
                            channelId,
                            // pressAction is needed if you want the notification to open the app when pressed
                            pressAction: {
                                id: 'transactions',
                            },
                        },
                    })
                }
            },
        )

        // Initialize panic listener
        const unsubscribePanic = fedimint.addListener(
            'panic',
            (event: PanicEvent) => {
                log.error('bridge panic', event)
                setBridgeError(event)
                SplashScreen.hide()
            },
        )

        return () => {
            unsubscribeLog()
            unsubscribeTransaction()
            unsubscribePanic()
        }
    }, [t])

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
