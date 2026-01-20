import { TFunction } from 'i18next'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { makeLog } from '@fedi/common/utils/log'

import { COMMUNITY_TOOL_URL } from '../constants/fedimods'
import { theme } from '../constants/theme'
import {
    joinFederation,
    rateFederation,
    selectFederationIds,
    selectFederations,
    selectOnchainDepositsEnabled,
    selectPaymentFederation,
    selectStableBalance,
    selectStableBalanceEnabled,
    setPublicCommunities,
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
    selectIsInternetUnreachable,
    createGuardianitoBot,
    selectGuardianitoBot,
    setGuardianitoBot,
    selectCommunity,
} from '../redux'
import {
    CommunityPreview,
    SupportedMetaFields,
    FederationMetadata,
    InviteCodeType,
    Federation,
    LoadedFederation,
} from '../types'
import { RpcCommunity, RpcFederationPreview } from '../types/bindings'
import dateUtils from '../utils/DateUtils'
import {
    detectInviteCodeType,
    fetchPublicCommunities,
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
import { BridgeError } from '../utils/errors'
import { useFedimint } from './fedimint'
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
export function useIsOnchainDepositSupported(federationId: Federation['id']) {
    const fedimint = useFedimint()
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

export function useLatestPublicCommunities() {
    const publicCommunities = useCommonSelector(
        s => s.federation.publicCommunities,
    )
    const dispatch = useCommonDispatch()
    const [isFetching, setIsFetching] = useState(false)

    const findPublicCommunities = useCallback(async () => {
        setIsFetching(true)
        const communities = await fetchPublicCommunities()
        dispatch(setPublicCommunities(communities))
        setIsFetching(false)
    }, [dispatch])

    useEffect(() => {
        findPublicCommunities()
    }, [findPublicCommunities])

    return {
        publicCommunities,
        findPublicCommunities,
        isFetchingPublicCommunities: isFetching,
    }
}

export function useCreatedCommunities(communityId?: string) {
    const fedimint = useFedimint()
    const [createdCommunities, setCreatedCommunities] = useState<
        RpcCommunity[]
    >([])
    const community = useCommonSelector(s =>
        selectCommunity(s, communityId ?? ''),
    )

    useEffect(() => {
        fedimint
            .listCreatedCommunities()
            .then(result => {
                setCreatedCommunities(result)
            })
            .catch(err => {
                log.error('Failed to fetch created communities', err)
                // Silently fail and keep empty array
            })
    }, [fedimint])

    const canEditCommunity = useMemo(() => {
        if (!communityId) return false
        return createdCommunities.some(
            c =>
                c.communityInvite.invite_code_str === communityId &&
                c.communityInvite.type === 'nostr',
        )
    }, [createdCommunities, communityId])

    const editCommunityUrl = useMemo(() => {
        if (!community || community.communityInvite.type === 'legacy') return

        const url = new URL(COMMUNITY_TOOL_URL)

        url.searchParams.set(
            'editing',
            community.communityInvite.community_uuid_hex,
        )

        return url
    }, [community])

    return { createdCommunities, canEditCommunity, editCommunityUrl }
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
        dispatch(setPublicFederations(federations))
        setIsFetching(false)
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

export function useFederationPreview(t: TFunction, invite: string) {
    const fedimint = useFedimint()
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

    const handleJoinFederation = useCallback(
        async (inviteCode: string, recoverFromScratch = false) => {
            try {
                setIsJoining(true)
                const joinedFederation = await dispatch(
                    joinFederation({
                        fedimint,
                        code: inviteCode,
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
            } catch (err) {
                // TODO: Expect an error code from bridge that maps to a localized error message
                log.error('handleJoinFederation', err)
                const typedError = err as Error
                // This catches specific errors caused by:
                // 1. leaving a federation immediately before... After
                // force-quitting, joining again is successful so advise
                // the user here
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
        [dispatch, fedimint, toast, t],
    )

    const handleJoinCommunity = useCallback(
        async (inviteCode: string) => {
            try {
                setIsJoining(true)
                const joinedCommunity = await dispatch(
                    joinCommunity({
                        fedimint,
                        code: inviteCode,
                    }),
                ).unwrap()
                // when joining a new community, always set it to selected
                dispatch(setLastSelectedCommunityId(joinedCommunity.id))
                // refresh all communities after joining a new one to keep all metadata fresh
                dispatch(refreshCommunities(fedimint))
            } catch (err) {
                // TODO: Expect an error code from bridge that maps to a localized error message
                log.error('handleJoinCommunity', err)
                const typedError = err as Error
                toast.error(t, typedError, 'errors.failed-to-join-community')
            } finally {
                setIsJoining(false)
            }
        },
        [dispatch, fedimint, toast, t],
    )

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

                if (
                    err instanceof BridgeError &&
                    err.error.includes('Failed to connect to peer')
                ) {
                    toast.show({
                        content: t('errors.network-connection-failed'),
                        status: 'error',
                    })
                } else {
                    toast.error(t, err, 'errors.invalid-federation-code')
                }
            } finally {
                setIsFetchingPreview(false)
            }
        },
        [fedimint, federationIds, communityIds, dispatch, toast, t],
    )

    const handleJoin = useCallback(
        async (onSuccess?: () => void, recoverFromScratch = false) => {
            try {
                if (previewCodeType === 'federation') {
                    if (!federationPreview) throw new Error()
                    await handleJoinFederation(
                        federationPreview.inviteCode,
                        recoverFromScratch,
                    )
                } else {
                    if (!communityPreview) throw new Error()
                    await handleJoinCommunity(
                        communityPreview.communityInvite.invite_code_str,
                    )
                }
                onSuccess && onSuccess()
            } catch (err) {
                log.error('handleJoin', err)
            }
        },
        [
            communityPreview,
            federationPreview,
            handleJoinCommunity,
            handleJoinFederation,
            previewCodeType,
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
        handleJoinFederation,
        handleJoinCommunity,
        previewCodeType,
    }
}

export function useFederationMembership(
    t: TFunction,
    federationId: string,
    inviteCode: string,
) {
    const { handleCode, ...rest } = useFederationPreview(t, inviteCode)
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

export function useFederationRating() {
    // federation ratings are shown after making a payment so we assume the correct
    // federation is selected as paymentFederation which is the one we should be rating
    const federationToRate = useCommonSelector(selectPaymentFederation)
    const fedimint = useFedimint()
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

export function useFederationInviteCode(t: TFunction, inviteCode: string) {
    const fedimint = useFedimint()
    const dispatch = useCommonDispatch()
    const { isJoining, handleJoinFederation } = useFederationPreview(
        t,
        inviteCode,
    )
    const [isChecking, setIsChecking] = useState(false)
    const [isError, setIsError] = useState(false)
    const checkedRef = useRef(false)
    const [previewResult, setPreviewResult] = useState<{
        preview: RpcFederationPreview
        isMember: boolean
    } | null>(null)

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
        handleJoin: () => handleJoinFederation(inviteCode),
    }
}

export function useCommunityInviteCode(inviteCode: string) {
    const fedimint = useFedimint()
    const dispatch = useCommonDispatch()
    const communityIds = useCommonSelector(selectCommunityIds)

    const [isJoining, setIsJoining] = useState(false)
    const [isFetching, setIsFetching] = useState(false)
    const [joined, setJoined] = useState(false)
    const [preview, setPreview] = useState<CommunityPreview>()

    const handleJoin = async () => {
        if (!preview) return

        setIsJoining(true)
        const joinedCommunity = await dispatch(
            joinCommunity({
                fedimint,
                code: preview.communityInvite.invite_code_str,
            }),
        ).unwrap()

        dispatch(setLastSelectedCommunityId(joinedCommunity.id))
        dispatch(refreshCommunities(fedimint))

        setIsJoining(false)
    }

    useEffect(() => {
        const init = async () => {
            setIsFetching(true)
            setJoined(communityIds.includes(inviteCode))
            const communityPreview = await getCommunityPreview(
                inviteCode,
                fedimint,
            )
            setPreview(communityPreview)
            setIsFetching(false)
        }

        init()
    }, [communityIds, fedimint, inviteCode])

    return {
        isJoining,
        isFetching,
        joined,
        handleJoin,
        preview,
    }
}

export function useFederationStatus<I>({
    federationId,
    t,
    statusIconMap,
}: {
    t: TFunction
    federationId: string
    statusIconMap: Record<LoadedFederation['status'], I>
}) {
    const federation = useCommonSelector(s =>
        selectLoadedFederation(s, federationId),
    )

    const status = federation?.status ?? 'offline'
    const isInternetUnreachable = useCommonSelector(selectIsInternetUnreachable)
    const popupInfo = usePopupFederationInfo(federation?.meta ?? {})

    let statusMessage = t('feature.federations.connection-status-offline')
    let statusIconColor = theme.colors.red
    let statusWord = t('words.offline')
    let statusText = t('words.status')

    if (status === 'online') {
        statusIconColor = theme.colors.success
        statusWord = t('words.online')
        statusMessage = t('feature.federations.connection-status-online')
    } else if (status === 'unstable') {
        statusIconColor = theme.colors.lightOrange
        statusWord = t('words.unstable')
        statusMessage = t('feature.federations.connection-status-unstable')
    }

    if (popupInfo?.ended) {
        statusWord = t('words.expired')
        statusIconColor = theme.colors.red
        if (popupInfo?.endedMessage) {
            statusMessage = popupInfo?.endedMessage
        }
    }

    if (isInternetUnreachable) {
        statusMessage = t('feature.federations.please-reconnect')
        statusText = t('feature.federations.last-known-status')
    }

    return {
        status,
        statusText,
        statusMessage,
        statusIcon: statusIconMap[status],
        statusIconColor,
        statusWord,
    }
}

export function useGuardianito(t: TFunction) {
    const fedimint = useFedimint()
    const toast = useToast()
    const dispatch = useCommonDispatch()
    const myGuardianitoBot = useCommonSelector(selectGuardianitoBot)
    const [isLoading, setIsLoading] = useState(false)
    const [isStillLoading, setIsStillLoading] = useState(false)

    // Track if operation is taking longer than 7 seconds
    useEffect(() => {
        if (!isLoading) {
            setIsStillLoading(false)
            return
        }

        const timeout = setTimeout(() => {
            setIsStillLoading(true)
            // set an empty guardianito bot to show the "Go to Chat" button
            // if the user comes back to the Create Federation screen
            dispatch(setGuardianitoBot({ bot_user_id: '', bot_room_id: '' }))
        }, 7000)

        return () => clearTimeout(timeout)
    }, [dispatch, isLoading])

    useEffect(() => {
        if (!isStillLoading) return
        toast.show({
            content: t('feature.federation.create-still-loading'),
            status: 'info',
        })
    }, [isStillLoading, toast, t])

    const beginBotCreation = useCallback(async () => {
        setIsLoading(true)
        try {
            const bot = await dispatch(
                createGuardianitoBot({ fedimint }),
            ).unwrap()
            return bot
        } catch (error) {
            log.error('Error creating guardianito bot', error)
        } finally {
            setIsLoading(false)
        }
    }, [dispatch, fedimint])

    return {
        beginBotCreation,
        isLoading,
        myGuardianitoBot,
        showGoToChatButton:
            isStillLoading || myGuardianitoBot?.bot_room_id === '',
    }
}
