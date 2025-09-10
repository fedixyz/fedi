import { useEffect, useRef } from 'react'

import {
    refreshActiveStabilityPool,
    selectActiveFederationId,
    selectStabilityPoolState,
    selectStabilityPoolVersion,
    selectStableBalancePending,
    setStabilityPoolState,
} from '../redux'
import {
    StabilityPoolDepositEvent,
    StabilityPoolWithdrawalEvent,
} from '../types/bindings'
import { FedimintBridge, UnsubscribeFn } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import { useIsStabilityPoolSupported } from './federation'
import { useCommonDispatch, useCommonSelector } from './redux'

const log = makeLog('common/hooks/stabilitypool')

/**
 * Given an instance of the bridge, monitor the stabilitypool to
 * refresh account info:
 * - every 60 seconds
 * - if a successful deposit event is received
 * - if a rejected deposit event is received
 * - if a successful withdrawal event is received
 * - if a rejected withdrawal event is received
 * TODO: Consider replacing this with a stabilityPoolAccountInfo event listener
 */
export async function useMonitorStabilityPool(fedimint: FedimintBridge) {
    const dispatch = useCommonDispatch()
    const activeFederationId = useCommonSelector(selectActiveFederationId)
    const isStabilityPoolSupported = useIsStabilityPoolSupported()
    const stabilityVersion = useCommonSelector(selectStabilityPoolVersion)
    const idleBalance = useCommonSelector(selectStabilityPoolState)?.idleBalance
    const hasWithdrawPending = useCommonSelector(selectStableBalancePending) < 0
    const isSweepingIdleBalanceRef = useRef(false)

    useEffect(() => {
        if (!activeFederationId || !isStabilityPoolSupported) return

        log.info('Monitoring stabilitypool account info...')

        dispatch(refreshActiveStabilityPool({ fedimint }))
        // then every 60 seconds after that
        const stabilityPoolMonitor = setInterval(() => {
            dispatch(refreshActiveStabilityPool({ fedimint }))
        }, 60000)

        let unsubscribeSpv2AccountInfo: UnsubscribeFn | undefined

        if (stabilityVersion === 2) {
            unsubscribeSpv2AccountInfo = fedimint.spv2SubscribeAccountInfo({
                federationId: activeFederationId,
                callback(accountInfo) {
                    log.info('stabilityPoolState (v2)', accountInfo)
                    dispatch(
                        setStabilityPoolState({
                            federationId: activeFederationId,
                            stabilityPoolState: accountInfo,
                        }),
                    )
                },
            })
        }

        const unsubscribeDeposits = fedimint.addListener(
            'stabilityPoolDeposit',
            (event: StabilityPoolDepositEvent) => {
                if (event.federationId === activeFederationId) {
                    log.info('StabilityPoolDepositEvent', event.state)
                    if (event.state === 'txAccepted') {
                        dispatch(refreshActiveStabilityPool({ fedimint }))
                    } else if (
                        typeof event.state === 'object' &&
                        'txRejected' in event.state
                    ) {
                        dispatch(refreshActiveStabilityPool({ fedimint }))
                    }
                }
            },
        )
        const unsubscribeWithdrawals = fedimint.addListener(
            'stabilityPoolWithdrawal',
            (event: StabilityPoolWithdrawalEvent) => {
                if (event.federationId === activeFederationId) {
                    if (
                        event.state === 'success' ||
                        event.state === 'cancellationAccepted'
                    ) {
                        dispatch(refreshActiveStabilityPool({ fedimint }))
                    } else if (
                        typeof event.state === 'object' &&
                        'txRejected' in event.state
                    ) {
                        dispatch(refreshActiveStabilityPool({ fedimint }))
                    }
                }
            },
        )

        return () => {
            unsubscribeDeposits()
            unsubscribeWithdrawals()
            unsubscribeSpv2AccountInfo?.()
            clearInterval(stabilityPoolMonitor)
        }
    }, [
        activeFederationId,
        dispatch,
        fedimint,
        stabilityVersion,
        isStabilityPoolSupported,
    ])

    // If we see any idle balance, go ahead and sweep it, sometimes the bridge
    // fails to do this for us.
    useEffect(() => {
        if (hasWithdrawPending) {
            return
        }
        if (!idleBalance || !activeFederationId) {
            isSweepingIdleBalanceRef.current = false
            return
        }
        if (isSweepingIdleBalanceRef.current) {
            return
        }
        log.info(`Idle balance of ${idleBalance} seen, sweeping...`)
        isSweepingIdleBalanceRef.current = true
        // Fire and forget, no need to await on this promise. It will get picked
        // up by the event listeners above, and call refreshActiveStabilityPool
        // for us.
        fedimint.stabilityPoolWithdraw(0, idleBalance, activeFederationId)
    }, [
        idleBalance,
        hasWithdrawPending,
        isSweepingIdleBalanceRef,
        activeFederationId,
        fedimint,
    ])
}
