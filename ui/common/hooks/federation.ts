import { TFunction } from 'i18next'
import { useCallback, useEffect, useState } from 'react'

import { makeLog } from '@fedi/common/utils/log'

import {
    joinFederation,
    rateFederation,
    selectActiveFederation,
    selectFederationIds,
    selectFederationMetadata,
    selectFederations,
    selectOnchainDepositsEnabled,
    selectPaymentFederation,
    selectStableBalance,
    selectStableBalanceEnabled,
    setActiveFederationId,
    setPublicFederations,
    supportsSafeOnchainDeposit,
} from '../redux'
import { FederationMetadata, JoinPreview, SupportedMetaFields } from '../types'
import dateUtils from '../utils/DateUtils'
import {
    fetchPublicFederations,
    getFederationPopupInfo,
    getMetaField,
    previewInvite,
    shouldEnableOnchainDeposits,
    shouldEnableStabilityPool,
    shouldShowInviteCode,
    shouldShowOfflineWallet,
    shouldShowSocialRecovery,
} from '../utils/FederationUtils'
import { FedimintBridge } from '../utils/fedimint'
import { useCommonDispatch, useCommonSelector } from './redux'
import { useToast } from './toast'

const log = makeLog('common/hooks/federation')

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
    if (!activeFederation || !activeFederation.hasWallet) return false
    if (!activeFederation.clientConfig) return false

    const { modules } = activeFederation.clientConfig
    for (const key in modules) {
        // TODO: add better typing for this
        const fmModule = modules[key] as Partial<{ kind: string }>
        if (
            fmModule.kind === 'stability_pool' ||
            fmModule.kind === 'multi_sig_stability_pool'
        ) {
            return true
        }
    }
    return false
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

// Onchain deposits can be enabled/disabled via federation metadata
// Even if enabled in federation metadata, if the federation doesn't support
// safe onchain deposits, it will be disabled
// Onchain deposits can also be enabled via Developer Settings which will
// override all of the above
export function useIsOnchainDepositSupported(fedimint: FedimintBridge) {
    const activeFederation = useCommonSelector(selectActiveFederation)
    const userEnabledOnchainDeposits = useCommonSelector(
        selectOnchainDepositsEnabled,
    )
    const [hasSafeOnchainDeposits, setHasSafeOnchainDeposits] = useState(false)
    const dispatch = useCommonDispatch()

    useEffect(() => {
        const checkOnchainSupport = async () => {
            if (!activeFederation) return

            try {
                const result = await dispatch(
                    supportsSafeOnchainDeposit({ fedimint }),
                ).unwrap()
                log.debug('supportsSafeOnchainDeposits result', result)
                setHasSafeOnchainDeposits(result)
            } catch (error) {
                log.error(
                    `supportsSafeOnchainDeposit failed for ${activeFederation.name}`,
                    error,
                )
                setHasSafeOnchainDeposits(false)
            }
        }

        // Reset to false since federation could have changed
        setHasSafeOnchainDeposits(false)
        checkOnchainSupport()
    }, [activeFederation, dispatch, fedimint])

    if (!activeFederation) return false

    // Check if onchain deposits are explicitly enabled in metadata
    const onchainDepositsDisabled = getMetaField(
        SupportedMetaFields.onchain_deposits_disabled,
        activeFederation.meta,
    )
    const isExplicitlyEnabledInMeta = onchainDepositsDisabled === 'false'

    log.debug(
        `checking onchain deposit support for ${activeFederation.name}\n`,
        `dev setting enabled: ${userEnabledOnchainDeposits}\n`,
        `metadata explicitly enabled: ${isExplicitlyEnabledInMeta}\n`,
        `metadata enabled: ${shouldEnableOnchainDeposits(activeFederation.meta)}\n`,
        `supports safe onchain deposits: ${hasSafeOnchainDeposits}`,
    )

    return (
        userEnabledOnchainDeposits ||
        isExplicitlyEnabledInMeta ||
        (shouldEnableOnchainDeposits(activeFederation.meta) &&
            hasSafeOnchainDeposits)
    )
}

export function usePopupFederationInfo(metadata?: FederationMetadata) {
    const activeFederationMetadata = useCommonSelector(selectFederationMetadata)
    const meta = metadata || activeFederationMetadata

    const [secondsLeft, setTimeLeft] = useState(0)
    const [endsInText, setShutdownTime] = useState('')

    const popupInfo = getFederationPopupInfo(meta)

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

export function useFederationPreview(
    t: TFunction,
    fedimint: FedimintBridge,
    invite: string,
) {
    const toast = useToast()
    const dispatch = useCommonDispatch()
    const federationIds = useCommonSelector(selectFederationIds)
    const [isJoining, setIsJoining] = useState<boolean>(false)
    const [isFetchingPreview, setIsFetchingPreview] = useState(!!invite)
    const [federationPreview, setFederationPreview] = useState<JoinPreview>()

    const handleCode = useCallback(
        async (code: string, onSuccess?: () => void) => {
            setIsFetchingPreview(true)
            try {
                const preview = await previewInvite(fedimint, code)
                if (federationIds.includes(preview.id)) {
                    dispatch(setActiveFederationId(preview.id))
                    toast.show({
                        content: t('errors.you-have-already-joined'),
                        status: 'error',
                    })
                    onSuccess && onSuccess()
                } else {
                    setFederationPreview(preview)
                }
            } catch (err) {
                log.error('handleCode', err)
                toast.error(t, err, 'errors.invalid-federation-code')
            }
            setIsFetchingPreview(false)
        },
        [fedimint, federationIds, dispatch, toast, t],
    )

    const handleJoin = useCallback(
        async (onSuccess?: () => void, recoverFromScratch = false) => {
            setIsJoining(true)
            try {
                if (!federationPreview) throw new Error()
                await dispatch(
                    joinFederation({
                        fedimint,
                        code: federationPreview.inviteCode,
                        recoverFromScratch,
                    }),
                ).unwrap()
                onSuccess && onSuccess()
            } catch (err) {
                // TODO: Expect an error code from bridge that maps to
                // a localized error message
                log.error('handleJoin', err)
                const typedError = err as Error
                // This catches specific errors caused by:
                // 1. leaving a federation immediately before... After
                // force-quitting, joining again is successful so advise
                // the user here
                // 2. scanning a federation code after you already joined
                if (
                    typedError?.message?.includes('No record locks available')
                ) {
                    toast.show({
                        content: t('errors.please-force-quit-the-app'),
                        status: 'error',
                    })
                } else {
                    toast.error(
                        t,
                        typedError,
                        'errors.failed-to-join-federation',
                    )
                }
                setIsJoining(false)
            }
        },
        [dispatch, federationPreview, fedimint, t, toast],
    )

    return {
        isJoining,
        isFetchingPreview,
        federationPreview,
        setFederationPreview,
        handleCode,
        handleJoin,
    }
}

export function useFederationMembership(
    t: TFunction,
    fedimint: FedimintBridge,
    federationId: string,
    inviteCode: string,
) {
    const { handleCode, ...rest } = useFederationPreview(
        t,
        fedimint,
        inviteCode,
    )
    const federations = useCommonSelector(selectFederations)

    const isMember = federations.some(
        f => f.init_state === 'ready' && f.id === federationId,
    )

    useEffect(() => {
        if (isMember) return

        handleCode(inviteCode)
    }, [isMember, inviteCode, handleCode])

    return { isMember, ...rest }
}

export function useFederationRating(fedimint: FedimintBridge) {
    // federation ratings are shown after making a payment so we assume the correct
    // federation is selected as paymentFederation which is the one we should be rating
    const federationToRate = useCommonSelector(selectPaymentFederation)
    const [rating, setRating] = useState<number | null>(null)
    const dispatch = useCommonDispatch()

    const handleSubmitRating = useCallback(
        async (onSuccess?: () => void) => {
            if (!federationToRate) return
            if (typeof rating !== 'number') return
            // enforce 0 - 4 range
            if (rating < 0 || rating > 4) return

            try {
                await dispatch(
                    rateFederation({
                        fedimint,
                        rating: rating + 1,
                        federationId: federationToRate.id,
                    }),
                ).unwrap()
                onSuccess && onSuccess()
            } catch (error) {
                log.error('handleSubmitRating', error)
            }
        },
        [rating, federationToRate, dispatch, fedimint],
    )

    return {
        rating,
        setRating,
        federationToRate,
        handleSubmitRating,
    }
}
