import { TFunction } from 'i18next'
import { useCallback, useEffect, useRef, useState } from 'react'

import { makeLog } from '@fedi/common/utils/log'

import {
    joinFederation,
    rateFederation,
    selectFederationIds,
    selectFederations,
    selectOnchainDepositsEnabled,
    selectPaymentFederation,
    selectStableBalance,
    selectStableBalanceEnabled,
    setPublicFederations,
    setSeenFederationRating,
    supportsSafeOnchainDeposit,
    selectCommunityIds,
    setLastSelectedCommunityId,
    joinCommunity,
    selectFederationClientConfig,
    selectLoadedFederation,
    refreshCommunities,
    checkFederationForAutojoinCommunities,
    refreshFederations,
    checkFederationPreview,
} from '../redux'
import {
    CommunityPreview,
    SupportedMetaFields,
    FederationMetadata,
    InviteCodeType,
    Federation,
} from '../types'
import { RpcFederationPreview } from '../types/bindings'
import dateUtils from '../utils/DateUtils'
import {
    detectInviteCodeType,
    fetchPublicFederations,
    getCommunityPreview,
    getFederationPopupInfo,
    getFederationPreview,
    getMetaField,
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

export function useIsInviteSupported(federationId: Federation['id']) {
    const federation = useCommonSelector(s =>
        selectLoadedFederation(s, federationId),
    )
    if (!federation) return false
    return shouldShowInviteCode(federation.meta)
}

export function useIsSocialRecoverySupported(federationId: Federation['id']) {
    const federation = useCommonSelector(s =>
        selectLoadedFederation(s, federationId),
    )
    if (!federation) return false
    return shouldShowSocialRecovery(federation)
}

export function useIsStabilityPoolSupported(federationId: Federation['id']) {
    const federationConfig = useCommonSelector(s =>
        selectFederationClientConfig(s, federationId),
    )
    if (!federationConfig) return false

    const { modules } = federationConfig
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

export function useIsStabilityPoolEnabledByFederation(
    federationId: Federation['id'],
) {
    const federation = useCommonSelector(s =>
        selectLoadedFederation(s, federationId),
    )
    if (!federation) return false
    return shouldEnableStabilityPool(federation.meta)
}

export function useShouldShowStabilityPool(federationId: Federation['id']) {
    const stabilityPoolSupported = useIsStabilityPoolSupported(federationId)
    const stabilityPoolEnabledByUser = useCommonSelector(
        selectStableBalanceEnabled,
    )
    const stabilityPoolEnabledByFederation =
        useIsStabilityPoolEnabledByFederation(federationId)
    const stableBalance = useCommonSelector(s =>
        selectStableBalance(s, federationId),
    )
    return (
        stabilityPoolSupported &&
        // Always show if there's a balance
        (stableBalance > 0 ||
            // Otherwise, show if the user or federation has enabled it
            stabilityPoolEnabledByUser ||
            stabilityPoolEnabledByFederation)
    )
}

export function useIsOfflineWalletSupported(federationId: Federation['id']) {
    const federation = useCommonSelector(s =>
        selectLoadedFederation(s, federationId),
    )
    if (!federation) return false
    return shouldShowOfflineWallet(federation.meta)
}

// Onchain deposits can be enabled/disabled via federation metadata
// Even if enabled in federation metadata, if the federation doesn't support
// safe onchain deposits, it will be disabled
// Onchain deposits can also be enabled via Developer Settings which will
// override all of the above
export function useIsOnchainDepositSupported(
    fedimint: FedimintBridge,
    federationId: Federation['id'],
) {
    const federation = useCommonSelector(s =>
        selectLoadedFederation(s, federationId),
    )
    const userEnabledOnchainDeposits = useCommonSelector(
        selectOnchainDepositsEnabled,
    )
    const [hasSafeOnchainDeposits, setHasSafeOnchainDeposits] = useState(false)
    const dispatch = useCommonDispatch()

    useEffect(() => {
        const checkOnchainSupport = async () => {
            if (!federation) return

            try {
                const result = await dispatch(
                    supportsSafeOnchainDeposit({ fedimint, federationId }),
                ).unwrap()
                log.debug('supportsSafeOnchainDeposits result', result)
                setHasSafeOnchainDeposits(result)
            } catch (error) {
                log.error(
                    `supportsSafeOnchainDeposit failed for ${federation.name}`,
                    error,
                )
                setHasSafeOnchainDeposits(false)
            }
        }

        // Reset to false since federation could have changed
        setHasSafeOnchainDeposits(false)
        checkOnchainSupport()
    }, [federation, dispatch, fedimint, federationId])

    if (!federation) return false

    // Check if onchain deposits are explicitly enabled in metadata
    const onchainDepositsDisabled = getMetaField(
        SupportedMetaFields.onchain_deposits_disabled,
        federation.meta,
    )
    const isExplicitlyEnabledInMeta = onchainDepositsDisabled === 'false'

    log.debug(
        `checking onchain deposit support for ${federation.name}\n`,
        `dev setting enabled: ${userEnabledOnchainDeposits}\n`,
        `metadata explicitly enabled: ${isExplicitlyEnabledInMeta}\n`,
        `metadata enabled: ${shouldEnableOnchainDeposits(federation.meta)}\n`,
        `supports safe onchain deposits: ${hasSafeOnchainDeposits}`,
    )

    return (
        userEnabledOnchainDeposits ||
        isExplicitlyEnabledInMeta ||
        (shouldEnableOnchainDeposits(federation.meta) && hasSafeOnchainDeposits)
    )
}

export function usePopupFederationInfo(metadata: FederationMetadata) {
    const meta = metadata

    const [secondsLeft, setTimeLeft] = useState(0)
    const [endsInText, setShutdownTime] = useState('')

    const popupInfo = getFederationPopupInfo(meta)

    const endedMessage = popupInfo?.endedMessage
    const countdownMessage = popupInfo?.countdownMessage

    // Uncomment me to test popup federations
    // const [rawTimestamp] = useState((Date.now() / 1000 + 30).toString())

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
            const oneHourSeconds = 60 * 60
            const oneDaySeconds = 24 * oneHourSeconds

            let msUntilChange: number

            // Over 24h - show days & hours & minutes, update time every minute
            if (secsLeft > 24 * 60 * 60) {
                const days = Math.floor(secsLeft / oneDaySeconds)
                const hours = Math.floor(
                    (secsLeft % oneDaySeconds) / oneHourSeconds,
                )
                const minutes = Math.floor((secsLeft % oneHourSeconds) / 60)

                setShutdownTime(`${days}d ${hours}h ${minutes}m`)
                msUntilChange = 60 * 1000
            }
            // Show hours & minutes & seconds, update time every second
            else {
                const hours = Math.floor(secsLeft / oneHourSeconds)
                const minutes = Math.floor(
                    (secsLeft - hours * oneHourSeconds) / 60,
                )
                const seconds = Math.floor(
                    secsLeft - hours * oneHourSeconds - minutes * 60,
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
        endedMessage,
        endsInText,
        endsAtText:
            dateUtils.formatPopupFederationEndsAtTimestamp(endTimestamp),
        ended: secondsLeft < 0,
        countdownMessage,
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
    const communityIds = useCommonSelector(selectCommunityIds)
    const [isJoining, setIsJoining] = useState<boolean>(false)
    const [isFetchingPreview, setIsFetchingPreview] = useState(!!invite)
    const [previewCodeType, setPreviewCodeType] =
        useState<InviteCodeType | null>(null)
    const [federationPreview, setFederationPreview] =
        useState<RpcFederationPreview>()
    const [communityPreview, setCommunityPreview] = useState<CommunityPreview>()

    const handleCode = useCallback(
        async (code: string, onSuccess?: () => void) => {
            try {
                setIsFetchingPreview(true)
                const codeType = detectInviteCodeType(code)
                setPreviewCodeType(codeType)

                if (codeType === 'federation') {
                    const federationPreviewResult = await getFederationPreview(
                        code,
                        fedimint,
                    )
                    if (federationIds.includes(federationPreviewResult.id)) {
                        toast.show({
                            content: t('errors.you-have-already-joined'),
                            status: 'error',
                        })
                        onSuccess && onSuccess()
                    } else {
                        setFederationPreview(federationPreviewResult)
                    }
                } else {
                    const communityPreviewResult = await getCommunityPreview(
                        code,
                        fedimint,
                    )
                    if (communityIds.includes(communityPreviewResult.id)) {
                        dispatch(
                            setLastSelectedCommunityId(
                                communityPreviewResult.id,
                            ),
                        )
                        toast.show({
                            content: t('errors.you-have-already-joined'),
                            status: 'error',
                        })
                        onSuccess && onSuccess()
                    } else {
                        setCommunityPreview(communityPreviewResult)
                    }
                }
            } catch (err) {
                log.error('handleCode', err)
                toast.error(t, err, 'errors.invalid-federation-code')
            } finally {
                setIsFetchingPreview(false)
            }
        },
        [fedimint, federationIds, communityIds, dispatch, toast, t],
    )

    const handleJoin = useCallback(
        async (onSuccess?: () => void, recoverFromScratch = false) => {
            setIsJoining(true)
            try {
                if (previewCodeType === 'federation') {
                    if (!federationPreview) throw new Error()
                    const joinedFederation = await dispatch(
                        joinFederation({
                            fedimint,
                            code: federationPreview.inviteCode,
                            recoverFromScratch,
                        }),
                    ).unwrap()
                    // check if there are any communities to autojoin
                    // this function will check, autojoin, AND select the community
                    // to bring more attention to the autojoin
                    await dispatch(
                        checkFederationForAutojoinCommunities({
                            fedimint,
                            federation: joinedFederation,
                            setAsSelected: true,
                        }),
                    )
                    // refresh all federations after joining a new one to keep all metadata fresh
                    dispatch(refreshFederations(fedimint))
                } else {
                    if (!communityPreview) throw new Error()
                    const joinedCommunity = await dispatch(
                        joinCommunity({
                            fedimint,
                            code: communityPreview.inviteCode,
                        }),
                    ).unwrap()
                    // when joining a new community, always set it to selected
                    dispatch(setLastSelectedCommunityId(joinedCommunity.id))
                    // refresh all communities after joining a new one to keep all metadata fresh
                    dispatch(refreshCommunities(fedimint))
                }

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
            } finally {
                setIsJoining(false)
            }
        },
        [
            communityPreview,
            dispatch,
            federationPreview,
            fedimint,
            previewCodeType,
            t,
            toast,
        ],
    )

    return {
        isJoining,
        setIsJoining,
        isFetchingPreview,
        federationPreview,
        setFederationPreview,
        communityPreview,
        setCommunityPreview,
        handleCode,
        handleJoin,
        previewCodeType,
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

    const handleDismissRating = useCallback(() => {
        if (!federationToRate) return

        dispatch(setSeenFederationRating({ federationId: federationToRate.id }))
    }, [dispatch, federationToRate])

    return {
        rating,
        setRating,
        federationToRate,
        handleSubmitRating,
        handleDismissRating,
    }
}

export function useFederationInviteCode(
    fedimint: FedimintBridge,
    inviteCode: string,
) {
    const dispatch = useCommonDispatch()
    const [isJoining, setIsJoining] = useState(false)
    const [isChecking, setIsChecking] = useState(false)
    const [isError, setIsError] = useState(false)
    const checkedRef = useRef(false)
    const [previewResult, setPreviewResult] = useState<{
        preview: RpcFederationPreview
        isMember: boolean
    } | null>(null)

    const handleJoin = useCallback(async () => {
        setIsJoining(true)
        try {
            await dispatch(
                joinFederation({
                    fedimint,
                    code: inviteCode,
                }),
            ).unwrap()
        } catch (e) {
            log.error('Error joining federation', e)
        } finally {
            setIsJoining(false)
        }
    }, [dispatch, fedimint, inviteCode])

    useEffect(() => {
        if (checkedRef.current) return
        checkedRef.current = true
        setIsChecking(true)
        dispatch(checkFederationPreview({ inviteCode, fedimint }))
            .unwrap()
            .then(result => setPreviewResult(result))
            .catch(() => setIsError(true))
            .finally(() => setIsChecking(false))
    }, [inviteCode, dispatch, fedimint])

    return {
        isJoining,
        isChecking,
        isError,
        previewResult,
        handleJoin,
    }
}
