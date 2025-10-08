import { useEffect, useRef } from 'react'

import {
    refreshStabilityPool,
    selectStabilityPoolState,
    selectStableBalancePending,
    selectStabilityPoolVersion,
    setStabilityPoolState,
} from '../redux'
import { Federation } from '../types'
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
 */
export async function useMonitorStabilityPool(
    fedimint: FedimintBridge,
    federationId: Federation['id'],
) {
    const dispatch = useCommonDispatch()
    const isStabilityPoolSupported = useIsStabilityPoolSupported(
        federationId || '',
    )
    const stabilityVersion = useCommonSelector(s =>
        selectStabilityPoolVersion(s, federationId),
    )
    const idleBalance = useCommonSelector(s =>
        selectStabilityPoolState(s, federationId),
    )?.idleBalance
    const hasWithdrawPending =
        useCommonSelector(s => selectStableBalancePending(s, federationId)) < 0
    const isSweepingIdleBalanceRef = useRef(false)

    useEffect(() => {
        // Can't monitor stabilitypool without a federation id
        if (!federationId) return

        // Can't monitor stabilitypool if not supported
        if (!isStabilityPoolSupported) return

        log.info('Monitoring stabilitypool account info for federation', {
            federationId,
        })

        dispatch(
            refreshStabilityPool({
                fedimint,
                federationId: federationId,
            }),
        )
        // then every 60 seconds after that
        const stabilityPoolMonitor = setInterval(() => {
            dispatch(
                refreshStabilityPool({
                    fedimint,
                    federationId: federationId,
                }),
            )
        }, 60000)

        let unsubscribeSpv2AccountInfo: UnsubscribeFn | undefined

        if (stabilityVersion === 2) {
            unsubscribeSpv2AccountInfo = fedimint.spv2SubscribeAccountInfo({
                federationId: federationId,
                callback(accountInfo) {
                    log.info('stabilityPoolState (v2)', accountInfo)
                    dispatch(
                        setStabilityPoolState({
                            federationId: federationId,
                            stabilityPoolState: accountInfo,
                        }),
                    )
                },
            })
        }

        const unsubscribeDeposits = fedimint.addListener(
            'stabilityPoolDeposit',
            (event: StabilityPoolDepositEvent) => {
                if (event.federationId === federationId) {
                    log.info('StabilityPoolDepositEvent', event.state)
                    if (event.state === 'txAccepted') {
                        dispatch(
                            refreshStabilityPool({
                                fedimint,
                                federationId: federationId,
                            }),
                        )
                    } else if (
                        typeof event.state === 'object' &&
                        'txRejected' in event.state
                    ) {
                        dispatch(
                            refreshStabilityPool({
                                fedimint,
                                federationId: federationId,
                            }),
                        )
                    }
                }
            },
        )
        const unsubscribeWithdrawals = fedimint.addListener(
            'stabilityPoolWithdrawal',
            (event: StabilityPoolWithdrawalEvent) => {
                if (event.federationId === federationId) {
                    if (
                        event.state === 'success' ||
                        event.state === 'cancellationAccepted'
                    ) {
                        dispatch(
                            refreshStabilityPool({
                                fedimint,
                                federationId: federationId,
                            }),
                        )
                    } else if (
                        typeof event.state === 'object' &&
                        'txRejected' in event.state
                    ) {
                        dispatch(
                            refreshStabilityPool({
                                fedimint,
                                federationId: federationId,
                            }),
                        )
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
        federationId,
        dispatch,
        fedimint,
        isStabilityPoolSupported,
        stabilityVersion,
    ])

    // If we see any idle balance, go ahead and sweep it, sometimes the bridge
    // fails to do this for us.
    useEffect(() => {
        if (hasWithdrawPending) {
            return
        }
        if (!idleBalance || !federationId) {
            isSweepingIdleBalanceRef.current = false
            return
        }
        if (isSweepingIdleBalanceRef.current) {
            return
        }
        log.info(`Idle balance of ${idleBalance} seen, sweeping...`)
        isSweepingIdleBalanceRef.current = true
        // Fire and forget, no need to await on this promise. It will get picked
        // up by the event listeners above, and call refreshStabilityPool
        // for us.
        fedimint.stabilityPoolWithdraw(0, idleBalance, federationId)
    }, [
        idleBalance,
        hasWithdrawPending,
        isSweepingIdleBalanceRef,
        federationId,
        fedimint,
    ])
}
