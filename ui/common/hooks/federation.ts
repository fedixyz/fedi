import { useCallback, useEffect, useState } from 'react'

import {
    selectActiveFederation,
    selectFederationMetadata,
    selectOnchainDepositsEnabled,
    selectStableBalance,
    selectStableBalanceEnabled,
    setPublicFederations,
} from '../redux'
import { Federation } from '../types'
import dateUtils from '../utils/DateUtils'
import {
    shouldShowOfflineWallet,
    shouldShowSocialRecovery,
    shouldShowInviteCode,
    shouldEnableOnchainDeposits,
    shouldEnableNostr,
    getFederationChatServerDomain,
    getFederationPopupInfo,
    shouldEnableStabilityPool,
    shouldEnableFediInternalInjection,
    fetchPublicFederations,
} from '../utils/FederationUtils'
import { useCommonDispatch, useCommonSelector } from './redux'

export function useIsChatSupported(federation?: Pick<Federation, 'meta'>) {
    const activeFederation = useCommonSelector(selectActiveFederation)
    const meta = federation ? federation.meta : activeFederation?.meta
    if (!meta) return false
    return !!getFederationChatServerDomain(meta)
}

export function useIsInviteSupported() {
    const activeFederation = useCommonSelector(selectActiveFederation)
    if (!activeFederation) return false
    return shouldShowInviteCode(activeFederation.meta)
}

export function useIsSocialRecoverySupported() {
    const activeFederation = useCommonSelector(selectActiveFederation)
    if (!activeFederation) return false
    return shouldShowSocialRecovery(activeFederation)
}

export function useIsStabilityPoolSupported() {
    const activeFederation = useCommonSelector(selectActiveFederation)
    if (!activeFederation) return false
    let supported = false
    if (activeFederation.clientConfig) {
        const { modules } = activeFederation.clientConfig
        for (const key in modules) {
            // TODO: add better typing for this
            const fmModule = modules[key] as Partial<{ kind: string }>
            if (fmModule.kind === 'stability_pool') {
                supported = true
            }
        }
    }
    return supported
}

export function useIsStabilityPoolEnabledByFederation() {
    const activeFederation = useCommonSelector(selectActiveFederation)
    if (!activeFederation) return false
    return shouldEnableStabilityPool(activeFederation.meta)
}

export function useShouldShowStabilityPool() {
    const stabilityPoolSupported = useIsStabilityPoolSupported()
    const stabilityPoolEnabledByUser = useCommonSelector(
        selectStableBalanceEnabled,
    )
    const stabilityPoolEnabledByFederation =
        useIsStabilityPoolEnabledByFederation()
    const stableBalance = useCommonSelector(selectStableBalance)
    return (
        stabilityPoolSupported &&
        // Always show if there's a balance
        (stableBalance > 0 ||
            // Otherwise, show if the user or federation has enabled it
            stabilityPoolEnabledByUser ||
            stabilityPoolEnabledByFederation)
    )
}

export function useIsOfflineWalletSupported() {
    const activeFederation = useCommonSelector(selectActiveFederation)
    if (!activeFederation) return false
    return shouldShowOfflineWallet(activeFederation.meta)
}

// Onchain deposits can be enabled via Developer Settings
// and ignores federation metadata if enabled (v1+ feds only)
export function useIsOnchainDepositSupported() {
    const activeFederation = useCommonSelector(selectActiveFederation)
    const userEnabledOnchainDeposits = useCommonSelector(
        selectOnchainDepositsEnabled,
    )
    if (!activeFederation) return false

    if (activeFederation.version < 1) return false

    return (
        userEnabledOnchainDeposits ||
        shouldEnableOnchainDeposits(activeFederation.meta)
    )
}

export function useIsNostrEnabled() {
    const activeFederation = useCommonSelector(selectActiveFederation)
    if (!activeFederation) return false
    return shouldEnableNostr(activeFederation)
}

export function useIsFediInternalInjectionEnabled() {
    const activeFederation = useCommonSelector(selectActiveFederation)
    if (!activeFederation) return false
    return shouldEnableFediInternalInjection(activeFederation.meta)
}

export function usePopupFederationInfo() {
    const activeFederationMetadata = useCommonSelector(selectFederationMetadata)
    const [secondsLeft, setTimeLeft] = useState(0)
    const [endsInText, setShutdownTime] = useState('')

    const popupInfo = getFederationPopupInfo(activeFederationMetadata)

    const countdownMessage = popupInfo?.countdownMessage
    const endedMessage = popupInfo?.endedMessage

    // Uncomment me to test popup federations
    // const [rawTimestamp] = useState((1686584896.205).toString())

    const rawTimestamp = popupInfo?.endTimestamp
    const endTimestamp = rawTimestamp ? parseInt(rawTimestamp, 10) : null

    // Generate and re-generate formatted time for when the federation ends at.
    // Don't refactor this into a dateUtils function, because we need to handle
    // a setTimeout to re-run to update the time.
    useEffect(() => {
        if (!endTimestamp) return

        let timeout: ReturnType<typeof setTimeout>

        const updateTimeLeft = () => {
            const secsLeft = endTimestamp - Date.now() / 1000
            let msUntilChange: number

            // Over 100h - show days, update time at the next hour
            if (secsLeft > 100 * 60 * 60) {
                setShutdownTime(`${Math.floor(secsLeft / (24 * 60 * 60))}d`)
                msUntilChange = 60 * 60 * 1000
            }
            // Over 48h - show hours, update time every minute
            else if (secsLeft > 48 * 60 * 60) {
                setShutdownTime(`${Math.floor(secsLeft / (60 * 60))}h`)
                msUntilChange = 60 * 1000
            }
            // Over 12h - show hours & minutes, update time every minute
            else if (secsLeft > 12 * 60 * 60) {
                const hours = Math.floor(secsLeft / (60 * 60))
                const minutes = Math.floor((secsLeft - hours * 60 * 60) / 60)
                setShutdownTime(`${hours}h ${minutes}m`)
                msUntilChange = 60 * 1000
            }
            // Show hours & minutes & seconds, update time every second
            else {
                const hours = Math.floor(secsLeft / (60 * 60))
                const minutes = Math.floor((secsLeft - hours * 60 * 60) / 60)
                const seconds = Math.floor(
                    secsLeft - hours * 60 * 60 - minutes * 60,
                )
                setShutdownTime(`${hours}h ${minutes}m ${seconds}s`)
                msUntilChange = 1 * 1000
            }

            setTimeLeft(secsLeft)
            timeout = setTimeout(updateTimeLeft, msUntilChange)
        }
        updateTimeLeft()

        return () => clearTimeout(timeout)
    }, [endTimestamp])

    if (!endTimestamp) return null

    return {
        countdownMessage,
        endedMessage,
        endTimestamp,
        secondsLeft,
        endsInText,
        endsAtText:
            dateUtils.formatPopupFederationEndsAtTimestamp(endTimestamp),
        endsSoon: secondsLeft > 0 && secondsLeft <= 12 * 60 * 60,
        ended: secondsLeft < 0,
    }
}

// Only v2+ federations use secrets derived from single seed
export function useFederationSupportsSingleSeed() {
    const activeFederation = useCommonSelector(selectActiveFederation)
    if (!activeFederation) return false
    return activeFederation.version >= 2
}

export function useLatestPublicFederations() {
    const publicFederations = useCommonSelector(
        s => s.federation.publicFederations,
    )
    const dispatch = useCommonDispatch()
    const [isFetching, setIsFetching] = useState(false)

    const findPublicFederations = useCallback(async () => {
        setIsFetching(true)
        const federations = await fetchPublicFederations()
        setIsFetching(false)
        dispatch(setPublicFederations(federations))
    }, [dispatch])

    useEffect(() => {
        findPublicFederations()
    }, [findPublicFederations])

    return {
        publicFederations,
        findPublicFederations,
        isFetchingPublicFederations: isFetching,
    }
}
