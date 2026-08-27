import { useCallback, useEffect, useRef, useState } from 'react'

import {
    type WalletServiceLightningStage,
    type WalletServiceLightningStatus,
    clearFiLiquidity,
    clearFiLiquidityError,
    logFiClientStatusChange,
    refreshFiStatus,
    selectFederationIds,
    selectFiFormation,
    selectFiInviteCode,
    selectFiLiquidityErrorCode,
    selectFiLiquidityOperation,
    selectIsFiLiquidityRequesting,
    selectIsWalletServiceLightningRunning,
    selectWalletServiceLightningStage,
    selectWalletServiceLightningStatus,
    selectIsWalletServiceCreationEnabled,
    selectLoadedFederation,
    selectOnboardingCompleted,
    setFiClientStatus,
    recordFiLiquidityAbsent,
    setFiLiquidityError,
    setFiLiquidityOperation,
    setFiLiquidityRequesting,
} from '../redux'
import type {
    RpcBitcoinNetwork,
    RpcFiClientStatus,
    RpcFiErrorCode,
    RpcFiLiquidityNetwork,
    RpcFiLiquidityOperation,
    RpcFiLiquidityRequestIntent,
} from '../types/bindings'
import { type FederationMetadata, SupportedMetaFields } from '../types/fedimint'
import {
    getFederationIconUrl,
    getFederationWelcomeMessage,
    getMetaField,
} from '../utils/FederationUtils'
import { makeLog } from '../utils/log'
import { useFedimint } from './fedimint'
import { useCommonDispatch, useCommonSelector } from './redux'

const log = makeLog('common/hooks/fi')

/**
 * One app-wide subscription (mounted by WalletServiceMonitor); screens read
 * the snapshot through selectors, never by opening their own stream.
 */
export function useMonitorFiClient() {
    const dispatch = useCommonDispatch()
    const fedimint = useFedimint()
    const isEnabled = useCommonSelector(selectIsWalletServiceCreationEnabled)
    // fiClient* RPCs are rejected until the bridge leaves its onboarding
    // state, so subscribing earlier would fail once and never retry
    const isOnboarded = useCommonSelector(selectOnboardingCompleted)
    // the last status written to the log, so a re-report of the same thing
    // stays quiet
    const lastLoggedStatus = useRef<RpcFiClientStatus | null>(null)

    useEffect(() => {
        if (!isEnabled || !isOnboarded) {
            // a closed gate produces no fi lines at all, which reads exactly
            // like a subscription that went quiet — so say which one it is
            log.info('fi client monitor not subscribing', {
                isEnabled,
                isOnboarded,
            })
            return
        }
        log.info('fi client monitor subscribing')
        dispatch(refreshFiStatus({ fedimint }))
        const unsubscribe = fedimint.fiClientSubscribe({
            callback: status => {
                lastLoggedStatus.current = logFiClientStatusChange(
                    lastLoggedStatus.current,
                    status,
                )
                dispatch(setFiClientStatus(status))
            },
        })
        return () => {
            log.info('fi client monitor unsubscribing')
            unsubscribe()
        }
    }, [dispatch, fedimint, isEnabled, isOnboarded])
}

/**
 * The guardian fee the federation actually applies, in ppm.
 *
 * `fiClientSetGuardianFee` is a setter with no getter, and
 * `RpcFiResolvedFormationIntent.guardianFeePpm` is the *creation-time* intent —
 * always 0, since the app sends no fee at creation. Reading that field is why
 * the settings row said "Not set" straight after a save that worked.
 *
 * The applied rate is not write-only, though. `propose_guardian_fees` publishes
 * it to the federation's consensus metadata and re-reads it to confirm it won
 * consensus, under `fedi:guardian_fee_send_ppm`. `federationPreview` returns
 * that metadata from an invite code alone, with no join, so the value survives
 * a restart, a reinstall, and a fee set from another device.
 *
 * `markApplied` holds a just-saved rate on screen until a fetch agrees with it:
 * consensus takes a moment to settle, and re-reading too early would otherwise
 * flip the row back to the old value right after a successful save.
 */
export const GUARDIAN_FEE_SEND_PPM_META_KEY = 'fedi:guardian_fee_send_ppm'

/**
 * The federation publishes the rate as a decimal string. Absent, empty, or
 * unparseable all mean "no published rate" — but a published `"0"` is a real
 * rate, not an absence, so this cannot lean on `Number()` alone: `Number('')`
 * is 0, which would invent a zero-fee policy out of a blank field.
 */
const parseGuardianFeePpm = (raw: string | undefined): number | null => {
    if (raw === undefined || raw.trim() === '') return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function useAppliedGuardianFeePpm() {
    const fedimint = useFedimint()
    const inviteCode = useCommonSelector(selectFiInviteCode)

    const [consensusPpm, setConsensusPpm] = useState<number | null>(null)
    const [pendingPpm, setPendingPpm] = useState<number | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const refresh = useCallback(async () => {
        if (!inviteCode) return
        setIsLoading(true)
        try {
            const preview = await fedimint.federationPreview(inviteCode)
            setConsensusPpm(
                parseGuardianFeePpm(
                    preview.meta[GUARDIAN_FEE_SEND_PPM_META_KEY],
                ),
            )
        } catch (error) {
            // a metadata read that fails leaves the last known value alone
            // rather than reporting the fee as unset
            log.warn('federationPreview for guardian fee', error)
        } finally {
            setIsLoading(false)
        }
    }, [fedimint, inviteCode])

    // `refresh` never rejects — it catches its own failure
    useEffect(() => {
        refresh()
    }, [refresh])

    // once consensus reports the rate we asked for, the local hold is spent
    useEffect(() => {
        if (pendingPpm !== null && consensusPpm === pendingPpm)
            setPendingPpm(null)
    }, [pendingPpm, consensusPpm])

    const markApplied = useCallback((ppm: number) => setPendingPpm(ppm), [])

    return {
        // `null` means the federation publishes no rate. Zero is a *rate* —
        // guardians set it to stop new accrual — so callers must compare
        // against null, never test falsiness.
        feePpm: pendingPpm ?? consensusPpm,
        isLoading,
        refresh,
        markApplied,
    }
}

/**
 * The wallet service's own federation id, derived from its invite code.
 *
 * The formation snapshot does not carry the id. The bridge auto-joins this
 * federation once formation reaches `formed`, so the invite code is the only
 * handle the client has to it until then.
 *
 * Returns null until the code parses, which callers should treat as "not ready
 * yet" rather than "no federation".
 */
export function useWalletServiceFederationId(): string | null {
    const fedimint = useFedimint()
    const inviteCode = useCommonSelector(selectFiInviteCode)
    const [federationId, setFederationId] = useState<string | null>(null)

    useEffect(() => {
        if (!inviteCode) return
        let isMounted = true
        fedimint
            .parseInviteCode(inviteCode)
            .then(({ federationId: id }) => {
                if (isMounted) setFederationId(id)
            })
            .catch(() => {
                // invite code isn't parseable yet (e.g. stale snapshot) —
                // leave it unset so callers keep their loading state
            })
        return () => {
            isMounted = false
        }
    }, [inviteCode, fedimint])

    return federationId
}

/**
 * The gateway envelope every Wallet Service is attached with.
 *
 * `fiClientLiquidityDiscover` and `fiClientLiquidityStart` both demand exact
 * sats bounds, and the design deliberately asks the operator for none: story 08
 * settled on Lightning only, sane defaults, no amount input. So the figures live
 * here, in one place, rather than being invented per call site.
 *
 * The stability pool is separately authorized administrative work and is never
 * part of formation, which is what a zero minimum and no maximum say.
 */
export const DEFAULT_LIGHTNING_ATTACH_INTENT: RpcFiLiquidityRequestIntent = {
    amounts: {
        gatewayMinSats: 100_000,
        gatewayMaxSats: 1_000_000,
        stabilityMinSats: 0,
        stabilityMaxSats: null,
    },
    // an empty allowlist means any provider Manifold admits, which is exactly
    // what "PeerBadge Verified" means here
    approvedProviderPubkeys: [],
}

/**
 * How often the durable operation is re-read while the attach runs.
 *
 * The bridge's own liquidity driver does the reconciliation — it re-arms after
 * every mutation and resumes until the gateway view verifies — so this is a
 * read of a local projection, not a retry loop. Nothing here starts work.
 */
const LIQUIDITY_POLL_INTERVAL_MS = 5_000

/**
 * Consecutive failed status reads before the attach is reported as failed.
 *
 * Not a reinstated budget: it counts *failures*, not elapsed time, so a slow
 * attach is never cut off — only one the bridge has stopped answering for.
 * Without it a permanently unreadable operation (an offboarded formation, say)
 * leaves the app polling every 5s for the process lifetime while every surface
 * claims the attach is still running.
 */
const LIQUIDITY_POLL_MAX_CONSECUTIVE_ERRORS = 12

/**
 * The liquidity network the federation actually runs on.
 *
 * Hard-coding `bitcoin` is what discarded the live staging provider, which
 * advertises `signet`: the discovery filter matches a provider's networks
 * against this value, so a wrong constant silently finds nothing. `testnet4`
 * and `unknown` have no liquidity counterpart, and null there means "cannot
 * attach yet" rather than a guess.
 */
const toLiquidityNetwork = (
    network: RpcBitcoinNetwork | null | undefined,
): RpcFiLiquidityNetwork | null =>
    network === 'bitcoin' ||
    network === 'testnet' ||
    network === 'signet' ||
    network === 'regtest'
        ? network
        : null

/**
 * Error codes that no amount of pressing Try again can move.
 *
 * Split here rather than in `getWalletServiceRetryableError`, which only
 * appends the try-again hint and classifies nothing. A retry offered against a
 * malformed intent or an absent capability is a button that cannot work.
 */
const TERMINAL_LIQUIDITY_ERROR_CODES: ReadonlySet<string> =
    new Set<RpcFiErrorCode>([
        'capabilityUnavailable',
        'identity',
        'invalidFleetManagers',
        'invalidIntent',
        'invalidOptions',
        'noActiveFormation',
    ])

export type WalletServiceLightningAttach = {
    status: WalletServiceLightningStatus
    /** Set only while `status` is `failed`. */
    errorCode: RpcFiErrorCode | null
    /** Whether a failure is worth offering Try again against. */
    isRetryable: boolean
    /** Whether the preconditions for a request are met right now. */
    canAttach: boolean
    /** Latest stage of the running attach, or null when none is running. */
    stage: WalletServiceLightningStage | null
    /**
     * A `start` whose RPCs have not answered yet.
     *
     * Held locally because it is not durable: until `fiClientLiquidityStart`
     * returns there is no operation for the bridge to report, and discovery
     * plus start measured ~6.9s on staging. Without it the CTA would sit inert
     * for that whole window, which is the press-it-again shape.
     */
    isRequesting: boolean
    /** Request the provider. Idempotent while one is already running. */
    start: () => void
}

/**
 * Find the attach the bridge already knows about, without starting one.
 *
 * `current` alone is not enough. Its contract is the *live* operation, and it
 * returns nothing once the request is terminal — so a successful attach becomes
 * invisible the moment it succeeds, and every later read would report a
 * verified provider as "nothing here". The durable list is the only source that
 * still remembers.
 *
 * Walked to exhaustion rather than to a page bound: a truncated search reports
 * "no provider attached" in exactly the same words as a completed one, and that
 * is the failure this read exists to fix.
 */
async function readDurableLiquidity(
    fedimint: ReturnType<typeof useFedimint>,
    formationId: string,
    isCancelled: () => boolean,
): Promise<RpcFiLiquidityOperation | null> {
    const current = await fedimint.fiClientLiquidityCurrent()
    if (isCancelled()) return null
    // `current` is scoped to the active formation by contract, but it does not
    // carry the id for us to check, so it is only trusted when it agrees
    if (
        current.type === 'current' &&
        current.operation &&
        current.operation.formationId === formationId
    )
        return current.operation

    let after: string | null = null
    const seenCursors = new Set<string>()
    for (;;) {
        const page = await fedimint.fiClientLiquidityList(after)
        if (isCancelled()) return null
        if (page.type !== 'page') {
            log.warn('fiClientLiquidityList', page.error)
            return null
        }
        const match = page.page.operations.find(
            operation =>
                operation.formationId === formationId &&
                operation.gatewayViewVerified,
        )
        if (match) return match
        after = page.page.nextAfter
        // a missing cursor means enumeration is complete
        if (!after) return null
        // an unbounded walk trusts the cursor to advance. A repeat would spin
        // this loop forever against the bridge, so it stops and says so rather
        // than becoming an invisible RPC storm.
        if (seenCursors.has(after)) {
            log.warn('liquidity list cursor repeated; stopping the walk', {
                formationId,
                cursor: after,
            })
            return null
        }
        seenCursors.add(after)
    }
}

/**
 * Watch the Lightning attach for the whole app, not for one screen.
 *
 * Mounted once by `WalletServiceMonitor`, exactly as `useMonitorFiClient` is
 * and for the same reason. The operation is durable in the bridge and outlives
 * any screen, so the screen that started it is the wrong owner: while the poll
 * lived in the step screen, leaving killed it, which is why the screen had to
 * hold the user there and why a relaunch lost the state entirely.
 *
 * There is no poll budget. A budget only ever answered "how long may a screen
 * hold someone?", and nothing holds anyone now. The stop condition is the
 * bridge's own contract instead — a terminal operation stops being reported as
 * live — so watching ends because there is nothing left to watch, rather than
 * because a guessed number elapsed.
 */
export function useMonitorWalletServiceLiquidity() {
    const dispatch = useCommonDispatch()
    const fedimint = useFedimint()
    const formationId =
        useCommonSelector(selectFiFormation)?.formationId ?? null
    const operation = useCommonSelector(selectFiLiquidityOperation)
    const isRunning = useCommonSelector(selectIsWalletServiceLightningRunning)
    const operationId = operation?.operationId ?? null

    // a different formation knows nothing about the previous one's attach, so
    // its state is dropped rather than left to be read as this one's
    const lastFormationId = useRef<string | null>(null)
    useEffect(() => {
        if (lastFormationId.current === formationId) return
        if (lastFormationId.current !== null) dispatch(clearFiLiquidity())
        lastFormationId.current = formationId
    }, [formationId, dispatch])

    // the durable read, once per formation: this is what makes a relaunch
    // report the truth before any screen asks
    useEffect(() => {
        if (!formationId) return
        let cancelled = false
        readDurableLiquidity(fedimint, formationId, () => cancelled)
            .then(found => {
                if (cancelled) return
                // a positive finding is recorded; "found nothing" only records
                // that the read happened, so a slow walk resolving after a
                // freshly started attach cannot erase it
                dispatch(
                    found
                        ? setFiLiquidityOperation(found)
                        : recordFiLiquidityAbsent(),
                )
            })
            .catch(error => {
                log.warn('liquidity durable read', error)
                // an unreadable bridge is not an absent provider, but the app
                // cannot stay silent either — mark the read done and let the
                // next mount ask again
                if (!cancelled) dispatch(recordFiLiquidityAbsent())
            })
        return () => {
            cancelled = true
        }
    }, [fedimint, dispatch, formationId])

    useEffect(() => {
        if (!operationId || !isRunning) return
        let cancelled = false

        let consecutiveErrors = 0

        const onReadFailed = (code: RpcFiErrorCode) => {
            consecutiveErrors += 1
            if (consecutiveErrors < LIQUIDITY_POLL_MAX_CONSECUTIVE_ERRORS)
                return
            log.warn(
                'liquidity status unreadable; reporting the attach failed',
                {
                    operationId,
                    consecutiveErrors,
                },
            )
            dispatch(setFiLiquidityError(code))
        }

        const read = async () => {
            try {
                const result =
                    await fedimint.fiClientLiquidityStatus(operationId)
                if (cancelled) return
                if (result.type === 'error') {
                    // one failed projection read says nothing about the
                    // operation, so the next tick asks again — but a run of
                    // them means nobody is going to answer
                    log.warn('liquidity status read failed', result.error)
                    onReadFailed(result.error.code)
                    return
                }
                consecutiveErrors = 0
                dispatch(setFiLiquidityOperation(result.operation))
            } catch (error) {
                log.warn('fiClientLiquidityStatus', error)
                if (!cancelled) onReadFailed('liquidity')
            }
        }

        read()
        const timer = setInterval(read, LIQUIDITY_POLL_INTERVAL_MS)
        return () => {
            cancelled = true
            clearInterval(timer)
        }
    }, [fedimint, dispatch, operationId, isRunning])
}

/**
 * Read the Lightning attach, and ask for one.
 *
 * A reader over app-wide state plus the one mutation. Every host — the creation
 * step, the settings row, its sheet — reads the same value, so there is no
 * "make the sheet aware" step: there is nothing separate to make aware.
 *
 * Nothing here runs on its own. `start` is the user pressing Continue.
 *
 * Order is not a preference: `formed_liquidity_context` refuses the request
 * unless the live formation is both `formed` and `fresh`, so this can only run
 * after the creation milestones, never alongside them. The high-water-mark
 * selectors are deliberately not used for that gate — the bridge checks the
 * live snapshot, so the gate has to ask the same question.
 *
 * `attached` means `gatewayViewVerified`, which is the FI having found the
 * completed FLIP gateway in a fresh, threshold-aggregated LNv2 view from the
 * formed federation. Provider-authored completion evidence alone is not proof
 * and must never present the provider as ready.
 *
 * At most one live operation may exist per federation, and Manifold commits the
 * semantic operation before its first provider mutation — so an existing
 * operation is adopted, and even a failed start is followed by a re-read rather
 * than a second request.
 */
export function useWalletServiceLightningAttach(): WalletServiceLightningAttach {
    const dispatch = useCommonDispatch()
    const fedimint = useFedimint()
    const formation = useCommonSelector(selectFiFormation)
    const walletServiceFederationId = useWalletServiceFederationId()
    const network = useCommonSelector(s =>
        walletServiceFederationId
            ? (selectLoadedFederation(s, walletServiceFederationId)?.network ??
              null)
            : null,
    )

    const status = useCommonSelector(selectWalletServiceLightningStatus)
    const stage = useCommonSelector(selectWalletServiceLightningStage)
    const errorCode = useCommonSelector(selectFiLiquidityErrorCode)

    const formationId = formation?.formationId ?? null
    const isFormedAndFresh =
        formation?.phase === 'formed' && formation.freshness === 'fresh'
    const liquidityNetwork = toLiquidityNetwork(network)
    const canAttach = Boolean(
        isFormedAndFresh && formationId && liquidityNetwork,
    )

    // Two presses in the same tick cannot both get through: the ref settles a
    // race React state would lose, and the shared flag settles the same race
    // across hosts, since a second screen has its own ref.
    const isStarting = useRef(false)
    const isRequesting = useCommonSelector(selectIsFiLiquidityRequesting)

    const start = useCallback(() => {
        if (isStarting.current || isRequesting) return
        if (!formationId || !liquidityNetwork || !isFormedAndFresh) {
            dispatch(setFiLiquidityError('noActiveFormation'))
            return
        }
        isStarting.current = true
        dispatch(setFiLiquidityRequesting(true))
        dispatch(clearFiLiquidityError())

        const attach = async () => {
            // a lost response is recoverable, never permission to create a
            // second request
            const current = await fedimint.fiClientLiquidityCurrent()
            if (current.type === 'current' && current.operation) {
                log.info('adopting existing liquidity operation', {
                    operationId: current.operation.operationId,
                })
                dispatch(setFiLiquidityOperation(current.operation))
                return
            }

            const discovery = await fedimint.fiClientLiquidityDiscover(
                DEFAULT_LIGHTNING_ATTACH_INTENT,
                liquidityNetwork,
            )
            if (discovery.type === 'error') {
                log.warn('liquidity discovery failed', discovery.error)
                dispatch(setFiLiquidityError(discovery.error.code))
                return
            }
            // the flow needs a gateway on this federation's network, so a
            // provider offering neither cannot serve the request
            const [provider] = discovery.providers.filter(
                candidate =>
                    candidate.supportedSources.includes('gateway') &&
                    candidate.supportedNetworks.includes(liquidityNetwork),
            )
            if (!provider) {
                log.warn('no liquidity provider for network', {
                    network: liquidityNetwork,
                    rejected: discovery.rejected,
                })
                dispatch(setFiLiquidityError('liquidity'))
                return
            }

            const started = await fedimint.fiClientLiquidityStart(
                formationId,
                provider.providerPubkey,
                DEFAULT_LIGHTNING_ATTACH_INTENT,
            )
            if (started.type === 'operation') {
                dispatch(setFiLiquidityOperation(started.operation))
                return
            }
            // a returned error can follow a durable checkpoint, so the
            // canonical operation is read back rather than assumed absent
            log.warn('liquidity start reported an error', started.error)
            const recovered = await fedimint.fiClientLiquidityCurrent()
            if (recovered.type === 'current' && recovered.operation) {
                dispatch(setFiLiquidityOperation(recovered.operation))
                return
            }
            dispatch(setFiLiquidityError(started.error.code))
        }

        attach()
            .catch(error => {
                log.error('wallet service lightning attach', error)
                dispatch(setFiLiquidityError('liquidity'))
            })
            .finally(() => {
                isStarting.current = false
                dispatch(setFiLiquidityRequesting(false))
            })
    }, [
        fedimint,
        dispatch,
        formationId,
        isFormedAndFresh,
        isRequesting,
        liquidityNetwork,
    ])

    return {
        status,
        errorCode,
        isRetryable:
            status === 'failed' &&
            !(errorCode && TERMINAL_LIQUIDITY_ERROR_CODES.has(errorCode)),
        canAttach,
        stage,
        isRequesting,
        start,
    }
}

/** The metadata fields the wallet service settings screen reads back. */
export type WalletServiceMetadata = {
    iconUrl: string | null
    description: string | null
    termsUrl: string | null
}

const EMPTY_METADATA: WalletServiceMetadata = {
    iconUrl: null,
    description: null,
    termsUrl: null,
}

/**
 * The icon, description and terms the federation actually publishes.
 *
 * `fiClientUpdateFederationMetadata` is a setter with no getter, and
 * `RpcFiResolvedFormationIntent` carries only the creation-time intent — no
 * metadata field at all. So none of these three rows could show their own
 * value: an edit was visible until the screen remounted and then vanished.
 *
 * They are not write-only, though. Manifold publishes each one to the
 * federation's consensus metadata under `fedi:federation_icon_url`,
 * `fedi:welcome_message` and `fedi:tos_url`, and `federationPreview` returns
 * that metadata from an invite code alone, with no join. Reading it here means
 * the values survive a restart, a reinstall, and an edit from another device.
 *
 * The reads go through the shared `FederationUtils` getters rather than raw key
 * lookups, because those already try the `fedi:` prefix before the bare key,
 * which is the form Manifold writes.
 *
 * `markApplied` holds just-saved values on screen until a fetch agrees with
 * them: every write is a guardian consensus vote and takes a moment to settle,
 * so re-reading too early would flip a row back to its old value right after a
 * save that worked.
 */
export function useWalletServiceMetadata() {
    const fedimint = useFedimint()
    const inviteCode = useCommonSelector(selectFiInviteCode)

    const [consensus, setConsensus] =
        useState<WalletServiceMetadata>(EMPTY_METADATA)
    const [pending, setPending] = useState<Partial<WalletServiceMetadata>>({})
    const [isLoading, setIsLoading] = useState(false)

    const refresh = useCallback(async () => {
        if (!inviteCode) return
        setIsLoading(true)
        try {
            const preview = await fedimint.federationPreview(inviteCode)
            setConsensus({
                iconUrl: getFederationIconUrl(preview.meta),
                description: getFederationWelcomeMessage(preview.meta),
                termsUrl: getMetaField(
                    SupportedMetaFields.tos_url,
                    preview.meta,
                ),
            })
        } catch (error) {
            // a metadata read that fails leaves the last known values alone
            // rather than reporting every field as unset
            log.warn('federationPreview for wallet service metadata', error)
        } finally {
            setIsLoading(false)
        }
    }, [fedimint, inviteCode])

    // `refresh` never rejects — it catches its own failure
    useEffect(() => {
        refresh()
    }, [refresh])

    // once consensus reports a value we asked for, that local hold is spent
    useEffect(() => {
        setPending(held => {
            const spent = Object.keys(held).filter(
                key =>
                    held[key as keyof WalletServiceMetadata] ===
                    consensus[key as keyof WalletServiceMetadata],
            )
            if (spent.length === 0) return held
            const next = { ...held }
            for (const key of spent)
                delete next[key as keyof WalletServiceMetadata]
            return next
        })
    }, [consensus])

    const markApplied = useCallback(
        (applied: Partial<WalletServiceMetadata>) =>
            setPending(held => ({ ...held, ...applied })),
        [],
    )

    return {
        // `null` means the federation publishes nothing for that field
        iconUrl: pending.iconUrl ?? consensus.iconUrl,
        description: pending.description ?? consensus.description,
        termsUrl: pending.termsUrl ?? consensus.termsUrl,
        isLoading,
        refresh,
        markApplied,
    }
}

/** An eligible Wallet Service the user could join in order to pay for setup. */
export interface JoinableWalletService {
    id: string
    name: string
    /**
     * Carries the icon and the welcome preview the join sheet renders.
     *
     * Deliberately the concrete metadata type, not `Federation['meta']`: that
     * indexes a union whose loading and failed variants declare `meta?: never`,
     * so it widens to include `undefined`. A row only exists once its preview
     * resolved, so its metadata is always present.
     */
    meta: FederationMetadata
    inviteCode: string
}

/**
 * Turn admitted members into rows the sheet can render.
 *
 * The bridge knows an unjoined member only as an id and an invite, so the name
 * and icon come from previewing the invite. A member whose preview fails is
 * dropped rather than shown under its raw id: an unreachable federation cannot
 * be joined now anyway, and a row of hex helps nobody choose.
 */
async function resolveJoinableWalletServices(
    fedimint: ReturnType<typeof useFedimint>,
    members: { federationId: string; inviteCode: string }[],
): Promise<JoinableWalletService[]> {
    const previews = await Promise.all(
        members.map(member =>
            fedimint
                .federationPreview(member.inviteCode)
                .then(preview => ({
                    id: member.federationId,
                    name: preview.name,
                    meta: preview.meta,
                    inviteCode: member.inviteCode,
                }))
                .catch(error => {
                    log.warn(
                        'preview failed for admitted setup-payment federation',
                        member.federationId,
                        error,
                    )
                    return null
                }),
        ),
    )
    return previews.filter((p): p is JoinableWalletService => p !== null)
}

/**
 * `loaded` with no services means the lookup ran and admits nothing joinable.
 * `error` means it did not run, so the list may not be empty.
 *
 * These must not collapse into one another. Reporting a failed lookup as an
 * empty one tells the user "no wallet can pay for setup" — a permanent-sounding
 * verdict — on the strength of a relay timeout.
 */
export type JoinableWalletServicesStatus = 'loading' | 'loaded' | 'error'

/**
 * Trusted setup federations the user is not in yet, looked up on mount.
 *
 * Mounted by the join sheet rather than by the screen behind it, so opening the
 * sheet is what runs the lookup and closing it discards the answer. That makes
 * reopening the sheet a retry, and it keeps the screen free of a verdict it
 * would otherwise be stuck with for its whole life.
 *
 * Only a federation in Manifold's signed setup-payment set can pay an FMan for
 * guardian setup, so only that set may be offered here. The bridge returns it
 * with the signed invite each member was admitted under, which is what makes a
 * join possible: the derived federation id cannot be turned back into one.
 *
 * The public federation directory is deliberately not consulted. Membership of
 * it says nothing about whether an FMan will take that federation's ecash, so
 * offering it invites the user to join, top up, and only then discover they
 * still cannot pay.
 */
export function useJoinableWalletServices(): {
    services: JoinableWalletService[]
    status: JoinableWalletServicesStatus
} {
    const fedimint = useFedimint()
    // every fiClient* RPC is rejected before the bridge leaves onboarding, and
    // that rejection never retries, so asking earlier costs the whole session
    const isOnboarded = useCommonSelector(selectOnboardingCompleted)
    const joinedIds = useCommonSelector(selectFederationIds)
    const [services, setServices] = useState<JoinableWalletService[]>([])
    // never `loaded` before the lookup has run: an initial `loaded` with no
    // services renders the "nothing to join" verdict for a frame
    const [status, setStatus] =
        useState<JoinableWalletServicesStatus>('loading')

    // `joinedIds` is a dependency on purpose: joining one member must drop it
    // from the offer, and the bridge is the thing that knows it is joined now.
    useEffect(() => {
        // the lookup cannot run and will not be retried, so this is settled
        // emptiness rather than a pending answer
        if (!isOnboarded) {
            setServices([])
            setStatus('loaded')
            return
        }
        let cancelled = false
        setStatus('loading')
        fedimint
            .fiClientSetupPaymentFederations()
            .then(async result => {
                if (cancelled) return
                if (result.type === 'error') {
                    log.warn(
                        'setup-payment federations lookup failed',
                        result.error,
                    )
                    setStatus('error')
                    return
                }
                const resolved = await resolveJoinableWalletServices(
                    fedimint,
                    result.federations.filter(f => !f.joined),
                )
                if (cancelled) return
                setServices(resolved)
                setStatus('loaded')
            })
            .catch(error => {
                if (cancelled) return
                log.warn('setup-payment federations lookup threw', error)
                setStatus('error')
            })
        return () => {
            cancelled = true
        }
    }, [fedimint, isOnboarded, joinedIds])

    return { services, status }
}
