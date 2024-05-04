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
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux'

import { usePublishNotificationToken } from '@fedi/common/hooks/chat'
import {
    ensureHealthyXmppStream,
    selectActiveFederationId,
    refreshActiveStabilityPool,
    selectChatXmppClient,
    selectCurrency,
    selectStableBalance,
    selectStableBalancePending,
    selectActiveFederation,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { fedimint } from '../../bridge'
import { MSats, Sats } from '../../types'
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

export const useBridge = () => {
    const activeFederation = useAppSelector(selectActiveFederation)
    const activeFederationId = activeFederation?.id

    return {
        approveSocialRecoveryRequest: useCallback(
            (recoveryId: string, peerId: number, password: string) => {
                if (!activeFederationId)
                    return Promise.reject(new Error('No active federation'))

                return fedimint.approveSocialRecoveryRequest(
                    recoveryId,
                    peerId,
                    password,
                    activeFederationId,
                )
            },
            [activeFederationId],
        ),
        listFederations: useCallback(() => {
            return fedimint.listFederations()
        }, []),
        leaveFederation: useCallback(() => {
            if (!activeFederationId)
                return Promise.reject(new Error('No active federation'))

            return fedimint.leaveFederation(activeFederationId)
        }, [activeFederationId]),
        generateAddress: useCallback(() => {
            if (!activeFederationId)
                return Promise.reject(new Error('No active federation'))

            return fedimint.generateAddress(activeFederationId)
        }, [activeFederationId]),
        generateEcash: useCallback(
            (amount: MSats) => {
                if (!activeFederationId)
                    return Promise.reject(new Error('No active federation'))

                return fedimint.generateEcash(amount, activeFederationId)
            },
            [activeFederationId],
        ),
        generateInvoice: useCallback(
            (amount: MSats, description: string) => {
                if (!activeFederationId)
                    return Promise.reject(new Error('No active federation'))

                return fedimint.generateInvoice(
                    amount,
                    description,
                    activeFederationId,
                )
            },
            [activeFederationId],
        ),
        listTransactions: useCallback(
            (startTime?: number, limit?: number) => {
                if (!activeFederationId)
                    return Promise.reject(new Error('No active federation'))

                return fedimint.listTransactions(
                    activeFederationId,
                    startTime,
                    limit,
                )
            },
            [activeFederationId],
        ),
        guardianStatus: useCallback(() => {
            if (!activeFederationId)
                return Promise.reject(new Error('No active federation'))

            return fedimint.guardianStatus(activeFederationId)
        }, [activeFederationId]),
        updateTransactionNotes: useCallback(
            (transactionId: string, notes: string) => {
                if (!activeFederationId)
                    return Promise.reject(new Error('No active federation'))

                return fedimint.updateTransactionNotes(
                    transactionId,
                    notes,
                    activeFederationId,
                )
            },
            [activeFederationId],
        ),
        getNostrPubKey: useCallback(() => {
            if (!activeFederationId)
                return Promise.reject(new Error('No active federation'))

            return fedimint.getNostrPubKey(activeFederationId)
        }, [activeFederationId]),
        signNostrEvent: useCallback(
            (eventHash: string) => {
                if (!activeFederationId)
                    return Promise.reject(new Error('No active federation'))

                return fedimint.signNostrEvent(eventHash, activeFederationId)
            },
            [activeFederationId],
        ),
        listGateways: useCallback(() => {
            if (!activeFederationId)
                return Promise.reject(new Error('No active federation'))

            return fedimint.listGateways(activeFederationId)
        }, [activeFederationId]),
        switchGateway: useCallback(
            (nodePubKey: string) => {
                if (!activeFederationId)
                    return Promise.reject(new Error('No active federation'))

                return fedimint.switchGateway(nodePubKey, activeFederationId)
            },
            [activeFederationId],
        ),
        locateRecoveryFile: useCallback(() => {
            return fedimint.locateRecoveryFile()
        }, []),
        payInvoice: useCallback(
            (invoice: string) => {
                if (!activeFederationId)
                    return Promise.reject(new Error('No active federation'))

                return fedimint.payInvoice(invoice, activeFederationId)
            },
            [activeFederationId],
        ),
        payAddress: useCallback(
            (address: string, sats: Sats) => {
                if (!activeFederationId)
                    return Promise.reject(new Error('No active federation'))

                return fedimint.payAddress(address, sats, activeFederationId)
            },
            [activeFederationId],
        ),
        receiveEcash: useCallback(
            (ecash: string) => {
                if (!activeFederationId)
                    return Promise.reject(new Error('No active federation'))

                return fedimint.receiveEcash(ecash, activeFederationId)
            },
            [activeFederationId],
        ),
        socialRecoveryDownloadVerificationDoc: useCallback(
            (recoveryId: string) => {
                if (!activeFederationId)
                    return Promise.reject(new Error('No active federation'))

                return fedimint.socialRecoveryDownloadVerificationDoc(
                    recoveryId,
                    activeFederationId,
                )
            },
            [activeFederationId],
        ),
        validateEcash: useCallback((ecash: string) => {
            return fedimint.validateEcash(ecash)
        }, []),
        uploadBackupFile: useCallback(
            (videoFilePath: string) => {
                if (!activeFederationId)
                    return Promise.reject(new Error('No active federation'))

                return fedimint.uploadBackupFile(
                    videoFilePath,
                    activeFederationId,
                )
            },
            [activeFederationId],
        ),
        getXmppCredentials: useCallback(() => {
            if (!activeFederationId)
                return Promise.reject(new Error('No active federation'))

            return fedimint.getXmppCredentials(activeFederationId)
        }, [activeFederationId]),
        backupXmppUsername: useCallback(
            (username: string) => {
                if (!activeFederationId)
                    return Promise.reject(new Error('No active federation'))

                return fedimint.backupXmppUsername(username, activeFederationId)
            },
            [activeFederationId],
        ),
    }
}

export const useXmppHealthCheck = () => {
    const appStateRef = useRef<AppStateStatus>(
        RNAppState.currentState,
    ) as MutableRefObject<AppStateStatus>
    const dispatch = useAppDispatch()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const xmppClient = useAppSelector(selectChatXmppClient)

    // This logic is needed to help gracefully resume the XMPP websocket stream
    useEffect(() => {
        if (!xmppClient) return

        // Subscribe to changes in AppState to detect when app goes from
        // background to foreground
        const subscription = RNAppState.addEventListener(
            'change',
            nextAppState => {
                if (
                    appStateRef.current.match(/inactive|background/) &&
                    nextAppState === 'active'
                ) {
                    dispatch(
                        ensureHealthyXmppStream({
                            fedimint,
                            federationId: activeFederationId as string,
                        }),
                    )
                }
                appStateRef.current = nextAppState
            },
        )
        return () => subscription.remove()
    }, [activeFederationId, dispatch, xmppClient])
}

// This hook gets the device's FCM token and publishes it
// to the XMPP server if chat is supported
export const useXmppPushNotifications = async () => {
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
        { symbolPosition: 'end' },
    )
    const formattedStableBalancePending = amountUtils.formatFiat(
        stableBalancePending,
        selectedCurrency,
        { symbolPosition: 'end' },
    )

    return {
        refreshBalance,
        formattedStableBalance,
        formattedStableBalancePending,
    }
}
