import {
    PayloadAction,
    createAsyncThunk,
    createSelector,
    createSlice,
} from '@reduxjs/toolkit'
import { TFunction } from 'i18next'

import type { CommonState } from '.'
import { type FederationMetadata, MSats, SupportedMetaFields } from '../types'
import {
    FaFederationJoinEvent,
    RpcFaAppSetting,
    RpcFaClientStatus,
    RpcFaEligiblePayer,
    RpcFaErrorCode,
    RpcFaFederationMetadataUpdate,
    RpcFaFormationSnapshot,
    RpcFaGuardianTransfer,
    RpcFaGuardianTransferPhase,
    RpcFaLiquidityOperation,
    RpcFaOperationError,
    RpcFaPlanPreference,
    RpcFaReplacementCandidate,
    RpcFaReplacementCandidates,
    RpcFaReplacementCheck,
    RpcFaReplacementPreview,
    RpcFaSeatPhase,
    RpcFaSelectionPreview,
    RpcFaSelectionReauthorizationReason,
    RpcFaStatus,
    RpcFaTransferDestinationPreview,
} from '../types/bindings'
import {
    getFederationIconUrl,
    getFederationWelcomeMessage,
    getMetaField,
} from '../utils/FederationUtils'
import { isDev } from '../utils/environment'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import {
    selectFeatureFlag,
    selectManifoldCreationOverrideEnabled,
} from './environment'
import {
    mergeFederationMeta,
    selectFederationBalance,
    selectIsFederationRecovering,
    selectLoadedFederation,
} from './federation'

const log = makeLog('common/redux/fa')

// presets only, no custom entry: `federation_size` is a plain u16 but each
// manifold guardian advertises which sizes it serves, so an arbitrary number can
// only be validated by a round trip that has no "size unavailable" design
export const WALLET_SERVICE_SIZE_OPTIONS = [7, 10, 13]
export const RECOMMENDED_WALLET_SERVICE_SIZE = 10
export const MIN_WALLET_SERVICE_SIZE = WALLET_SERVICE_SIZE_OPTIONS[0]
export const MAX_WALLET_SERVICE_SIZE =
    WALLET_SERVICE_SIZE_OPTIONS[WALLET_SERVICE_SIZE_OPTIONS.length - 1]

/** Rejected by `guardian_fee_from_rpc` in the bridge above this value. */
export const MAX_GUARDIAN_FEE_PPM = 210_000
/** Enforced FA-side at propose time; the bridge itself has no floor check. */
export const MIN_GUARDIAN_FEE_PPM = 1_500
export const GUARDIAN_FEE_PPM_OPTIONS = [1_500, 5_000, 10_000]
export const DEFAULT_GUARDIAN_FEE_PPM = 5_000

const PPM_DENOMINATOR = 1_000_000

/** Percent → ppm, floored, matching the `ui/common/redux/wallet.ts` convention. */
export const guardianFeePercentToPpm = (percent: number) =>
    Math.floor(percent * (PPM_DENOMINATOR / 100))

export const guardianFeePpmToPercent = (ppm: number) =>
    (ppm / PPM_DENOMINATOR) * 100

/**
 * Guardians that may go offline before consensus breaks: `floor((n-1)/3)`.
 * Client-side product copy, not a bridge value.
 */
export const walletServiceFaultTolerance = (size: number) =>
    Math.floor((size - 1) / 3)

const WALLET_SERVICE_PLAN: RpcFaPlanPreference = 'infiniteBestEffort'

export interface WalletServiceDraft {
    name: string
    size: number
}

/*** Initial State ***/

/**
 * The furthest a formation has been seen to get, so the screen can refuse to
 * go backwards.
 *
 * Formation progress is not monotonic at the source. `milestones` are `all()`
 * predicates over the seats, so one guardian dropping to `replacementRequired`
 * un-sets `ecashSent` for the whole set. Painted raw, a checkmark the user has
 * already been shown is taken away again, which reads as the setup having
 * failed.
 *
 * Keyed by `formationId`: a genuinely new formation starts from nothing, and
 * only a re-report of the same one is held up. The formed federation keeps
 * the formation's id, so the mark also tells that this app watched it form.
 */
type CreationHighWaterMark = {
    formationId: string
    stage: WalletServiceCreationStage
    isComplete: boolean
}

/**
 * A top-up invoice that has not settled yet. One top-up keeps one invoice, so
 * every retry and every reopen pays the same one and cannot fund it twice.
 */
export type WalletServiceTopUpInvoice = {
    bolt11: string
    payerFederationId: string
    amountMsats: MSats
    /** The wallet that was told to pay it, or null for a Lightning deposit. */
    sourceFederationId: string | null
    /** ms since epoch; the bridge reports no expiry, so the sheet derives it. */
    createdAt: number
}

/** The metadata fields the wallet service settings screens read back. */
export type WalletServiceMetadata = {
    name: string | null
    iconUrl: string | null
    description: string | null
    termsUrl: string | null
    /**
     * The auto join spaces exactly as published: a JSON array of invite
     * codes. Held as text so a just-saved list compares with `===`.
     */
    autojoinCommunities: string | null
}

/**
 * The one copy of the published metadata every screen reads, scoped to the
 * formation it was read for. A record for another formation is ignored.
 */
type WalletServiceMetadataRecord = {
    formationId: string | null
    /** `null` until a read succeeds. */
    published: WalletServiceMetadata | null
    /** Saved values that consensus has not reported yet. */
    holds: Partial<WalletServiceMetadata>
    status: 'idle' | 'loading' | 'loaded' | 'failed'
    /** The newest read; an answer to any older one is dropped. */
    latestRequestId: string | null
}

const EMPTY_METADATA: WalletServiceMetadata = {
    name: null,
    iconUrl: null,
    description: null,
    termsUrl: null,
    autojoinCommunities: null,
}

const readPublishedMetadata = (
    previewName: string,
    meta: FederationMetadata,
): WalletServiceMetadata => ({
    name:
        getMetaField(SupportedMetaFields.federation_name, meta) || previewName,
    iconUrl: getFederationIconUrl(meta),
    description: getFederationWelcomeMessage(meta),
    termsUrl: getMetaField(SupportedMetaFields.tos_url, meta),
    autojoinCommunities: getMetaField(
        SupportedMetaFields.autojoin_communities,
        meta,
    ),
})

const applyHolds = (
    consensus: WalletServiceMetadata,
    pending: Partial<WalletServiceMetadata>,
): WalletServiceMetadata => ({
    // `null` means the federation publishes nothing for that field
    name: pending.name ?? consensus.name,
    iconUrl: pending.iconUrl ?? consensus.iconUrl,
    description: pending.description ?? consensus.description,
    termsUrl: pending.termsUrl ?? consensus.termsUrl,
    autojoinCommunities:
        pending.autojoinCommunities ?? consensus.autojoinCommunities,
})

const makeMetadataRecord = (
    formationId: string | null,
): WalletServiceMetadataRecord => ({
    formationId,
    published: null,
    holds: {},
    status: 'idle',
    latestRequestId: null,
})

const initialState = {
    status: null as RpcFaStatus | null,
    clientError: null as RpcFaOperationError | null,
    // process-local: the bridge re-emits the last `faFederationJoin` state on
    // every `faClientStatus` read, so a fresh subscribe or foreground refresh
    // recovers this without needing it to survive rehydration
    federationJoin: null as FaFederationJoinEvent | null,
    // process-local: the bridge re-reports the live formation on every launch,
    // so this rebuilds itself rather than needing to survive a restart
    creationHighWaterMark: null as CreationHighWaterMark | null,
    draft: {
        name: '',
        size: RECOMMENDED_WALLET_SERVICE_SIZE,
    } as WalletServiceDraft,
    // process-local: the bridge invalidates the previewId on restart, so
    // neither survives rehydration and the flow restarts from the draft
    selectionPreview: null as RpcFaSelectionPreview | null,
    // process-local for the same reason as `selectionPreview`
    replacementPreview: null as RpcFaReplacementPreview | null,
    // process-local for the same reason as `selectionPreview`
    transferDestinationPreview: null as RpcFaTransferDestinationPreview | null,
    /**
     * The guardian move from the bridge's stream, where `undefined` is "not
     * heard yet". A finished move stays `completed` until the next start.
     *
     * `null` is the claim that no move is open, which is what unlocks the
     * offer to start one. Collapsing the two would offer a start before the
     * bridge has said, and the bridge answers that with `Busy`.
     */
    guardianTransfer: undefined as RpcFaGuardianTransfer | null | undefined,
    /**
     * The bridge's latest replacement check, from its stream. `null` until a
     * check of the formed service succeeds; then the guardians it flagged.
     */
    replacementCheck: null as RpcFaReplacementCheck | null,
    // process-local: the bridge keeps the receive and claims a late payment
    // after a restart, so a forgotten invoice still lands in the balance
    topUpInvoice: null as WalletServiceTopUpInvoice | null,
    eligiblePayers: null as RpcFaEligiblePayer[] | null,
    // held apart from `operationError`: a failed payer lookup leaves the price
    // intact and must not read as the whole quote having failed
    payerError: null as RpcFaOperationError | null,
    operationError: null as RpcFaOperationError | null,
    /**
     * The Lightning attach, held app-wide rather than by whichever screen is
     * mounted.
     *
     * The operation is durable in the bridge and outlives any screen, so the
     * screen that started it is not the thing that should own watching it.
     * Holding it here is what lets the user walk away, lets a relaunch report
     * the truth, and lets the settings row and its sheet read one value
     * instead of each deriving their own.
     *
     * `hasRead` is not a loading flag for a spinner — it is the difference
     * between "no provider is attached" and "we have not found out yet".
     * Collapsing the two is what made an attached provider read as absent.
     */
    liquidity: {
        operation: null as RpcFaLiquidityOperation | null,
        hasRead: false,
        errorCode: null as RpcFaErrorCode | null,
        /**
         * A `start` whose RPCs have not answered yet.
         *
         * App-wide rather than per hook instance, because the single-flight
         * guard has to hold across hosts: discovery plus start measured ~6.9s,
         * and for that whole window there is no operation for the bridge to
         * report. A per-screen flag let step 5 request one while the settings
         * sheet, seeing no operation, still offered its own Attach button.
         */
        isRequesting: false,
    },
    /**
     * Process-local and app-wide rather than per screen: the screen that saves
     * a value is often unmounted before consensus reports it, and every other
     * screen still has to show the saved value and build on it. One copy also
     * means a read that releases a hold cannot expose another screen's older
     * read.
     */
    walletServiceMetadata: makeMetadataRecord(null),
}

export type FaState = typeof initialState

const getStatusFormationId = (status: RpcFaStatus | null) => {
    if (status?.type === 'formation') return status.formation.formationId
    if (status?.type === 'formed') return status.federation.formationId
    return null
}

/** The metadata record for `formationId`, replacing one for another formation. */
function metadataRecordFor(state: FaState, formationId: string | null) {
    if (state.walletServiceMetadata.formationId !== formationId)
        state.walletServiceMetadata = makeMetadataRecord(formationId)
    return state.walletServiceMetadata
}

/**
 * The record a read answers into, or `null` when a newer read has started or
 * the formation has changed since it was asked.
 */
function getCurrentMetadataRead(state: FaState, requestId: string) {
    const record = state.walletServiceMetadata
    if (record.latestRequestId !== requestId) return null
    if (record.formationId !== getStatusFormationId(state.status)) return null
    return record
}

/** Raises {@link CreationHighWaterMark} to whatever the new status reports. */
function recordCreationHighWaterMark(state: FaState) {
    // A formation that this app watched ends as the same formed federation.
    // Without a mark, a formed federation was not created in this session.
    if (state.status?.type === 'formed') {
        const mark = state.creationHighWaterMark
        state.creationHighWaterMark =
            mark?.formationId === state.status.federation.formationId
                ? { ...mark, stage: 3, isComplete: true }
                : null
        return
    }
    if (state.status?.type !== 'formation') {
        state.creationHighWaterMark = null
        return
    }
    const { formation } = state.status
    const previous =
        state.creationHighWaterMark?.formationId === formation.formationId
            ? state.creationHighWaterMark
            : null
    state.creationHighWaterMark = {
        formationId: formation.formationId,
        stage: Math.max(
            getWalletServiceCreationStage(formation),
            previous?.stage ?? 1,
        ) as WalletServiceCreationStage,
        isComplete: Boolean(previous?.isComplete),
    }
}

/*** Status logging ***/

/**
 * A wallet service has up to 19 seats and the bridge reports every one of them
 * on every update. Logged individually they bury the line that matters, so
 * seats enter the log as a count per phase.
 */
const tallySeatPhases = (seats: RpcFaFormationSnapshot['seats']) =>
    seats.reduce<Record<string, number>>((tally, seat) => {
        tally[seat.phase] = (tally[seat.phase] ?? 0) + 1
        return tally
    }, {})

/**
 * The fields worth logging, and the ones a change is measured against.
 *
 * The intent and the invite code are left out on purpose. The intent never
 * moves after creation, and the invite code is long enough on its own to push
 * the rest of the line past the logger's 1000-character truncation — so the
 * line records only whether one has arrived yet.
 */
const summarizeFaClientStatus = (status: RpcFaClientStatus) => {
    if (status.type === 'failed')
        return {
            state: 'failed' as const,
            errorCode: status.error.code,
            errorMessage: status.error.message,
        }
    if (status.status.type === 'idle') return { state: 'idle' as const }
    if (status.status.type === 'recovery')
        return {
            state: 'recovery' as const,
            errorCode: status.status.error?.code ?? null,
        }
    if (status.status.type === 'formed') {
        const { federation } = status.status
        return {
            state: 'formed' as const,
            formationId: federation.formationId,
            freshness: federation.freshness,
            backupEligible: federation.backupEligible,
            seatCount: federation.seats.length,
        }
    }
    const { formation } = status.status
    return {
        state: 'formation' as const,
        formationId: formation.formationId,
        phase: formation.phase,
        freshness: formation.freshness,
        actionRequired: formation.actionRequired?.type ?? null,
        lastError: formation.lastError,
        paymentOutputsStarted: formation.paymentOutputsStarted,
        hasInviteCode: formation.inviteCode !== null,
        milestones: formation.milestones,
        seats: tallySeatPhases(formation.seats),
    }
}

export type FaClientStatusChange = {
    level: 'info' | 'warn' | 'error'
    message: string
    fields: ReturnType<typeof summarizeFaClientStatus>
}

/**
 * One line per meaningful move of the fa client, or null when the bridge has
 * re-reported a status that says the same thing as the last one.
 *
 * The subscription re-emits far more often than the formation actually moves,
 * so an undeduplicated line per update would make the log unreadable at exactly
 * the moment it is needed. Kept pure and exported so the decision can be tested
 * without capturing log output.
 *
 * `{ type: 'failed' }` is an RPC *success* that carries a failure, so no layer
 * underneath records it: the bridge logs `rpc_error` only for `Err`, and the
 * transport sees a call that resolved. This is the only place it becomes
 * visible, which is why it logs at `error` rather than `warn` — the flow status
 * stays `unknown` and every button stays disabled with nothing on screen.
 */
export function describeFaClientStatusChange(
    previous: RpcFaClientStatus | null,
    next: RpcFaClientStatus,
): FaClientStatusChange | null {
    const fields = summarizeFaClientStatus(next)
    if (
        previous &&
        JSON.stringify(summarizeFaClientStatus(previous)) ===
            JSON.stringify(fields)
    )
        return null
    return {
        level:
            fields.state === 'failed'
                ? 'error'
                : fields.state === 'formation' && fields.lastError !== null
                  ? 'warn'
                  : 'info',
        message: 'fa client status',
        fields,
    }
}

/**
 * Writes whatever {@link describeFaClientStatusChange} decides, and hands back
 * `next` for the caller to hold as the new previous.
 */
export function logFaClientStatusChange(
    previous: RpcFaClientStatus | null,
    next: RpcFaClientStatus,
): RpcFaClientStatus {
    const change = describeFaClientStatusChange(previous, next)
    if (change) log[change.level](change.message, change.fields)
    return next
}

/** The formation a log line belongs to, absent until one exists. */
const faLogContext = (state: CommonState) => {
    const formationId = getStatusFormationId(selectFaStatus(state))
    return formationId ? { formationId } : {}
}

/*** Slice definition ***/

export const faSlice = createSlice({
    name: 'fi',
    initialState,
    reducers: {
        setReplacementCandidates(
            state,
            action: PayloadAction<RpcFaReplacementCandidates>,
        ) {
            // a failed stream says nothing about the guardians, so the last
            // check stays up rather than hiding every Replace
            if (action.payload.type === 'ready')
                state.replacementCheck = action.payload.check
        },
        setGuardianTransfer(
            state,
            action: PayloadAction<RpcFaGuardianTransfer | null>,
        ) {
            state.guardianTransfer = action.payload
        },
        setFaClientStatus(state, action: PayloadAction<RpcFaClientStatus>) {
            if (action.payload.type === 'ready') {
                state.status = action.payload.status
                state.clientError = null
                recordCreationHighWaterMark(state)
            } else {
                state.clientError = action.payload.error
            }
        },
        setFaStatus(state, action: PayloadAction<RpcFaStatus>) {
            state.status = action.payload
            state.clientError = null
            // idle means the client is not mid-join, so a stale failure would
            // otherwise keep showing a terminal screen for a join that is no
            // longer in flight
            if (action.payload.type === 'idle') state.federationJoin = null
            recordCreationHighWaterMark(state)
        },
        /** Records the bridge's last-known state for a federation join. */
        setFaFederationJoin(
            state,
            action: PayloadAction<FaFederationJoinEvent>,
        ) {
            state.federationJoin = action.payload
        },
        setWalletServiceDraft(
            state,
            action: PayloadAction<Partial<WalletServiceDraft>>,
        ) {
            state.draft = { ...state.draft, ...action.payload }
        },
        clearFaOperationError(state) {
            state.operationError = null
        },
        /**
         * Record an operation the bridge reported.
         *
         * Ignores an operation belonging to a different formation. The durable
         * list walk filters by formation, but `faClientLiquidityCurrent` does
         * not carry that guarantee, and a second formation reading the first
         * one's verified attach would show a provider it does not have.
         */
        setFaLiquidityOperation(
            state,
            action: PayloadAction<RpcFaLiquidityOperation>,
        ) {
            const currentFormationId = getStatusFormationId(state.status)
            if (
                currentFormationId &&
                action.payload.formationId !== currentFormationId
            )
                return
            state.liquidity.operation = action.payload
            state.liquidity.hasRead = true
            state.liquidity.errorCode = null
            state.liquidity.isRequesting = false
        },
        /**
         * Record that a read completed and found nothing.
         *
         * Deliberately does **not** clear a known operation. "Found nothing" and
         * "there is nothing" are different claims, and the durable read races
         * the poll: a slow multi-page walk can resolve after `start` has already
         * registered a live operation, and erasing it there would stop the poll
         * and show "Not set" for an attach that is running.
         */
        recordFaLiquidityAbsent(state) {
            state.liquidity.hasRead = true
        },
        setFaLiquidityRequesting(state, action: PayloadAction<boolean>) {
            state.liquidity.isRequesting = action.payload
        },
        /** Forget everything known about the previous formation's attach. */
        clearFaLiquidity(state) {
            state.liquidity.operation = null
            state.liquidity.hasRead = false
            state.liquidity.errorCode = null
            state.liquidity.isRequesting = false
        },
        setFaLiquidityError(state, action: PayloadAction<RpcFaErrorCode>) {
            state.liquidity.errorCode = action.payload
            state.liquidity.hasRead = true
            state.liquidity.isRequesting = false
        },
        clearFaLiquidityError(state) {
            state.liquidity.errorCode = null
        },
        setWalletServiceTopUpInvoice(
            state,
            action: PayloadAction<WalletServiceTopUpInvoice | null>,
        ) {
            state.topUpInvoice = action.payload
        },
        /** Show saved values until consensus reports them. */
        holdWalletServiceMetadata(
            state,
            action: PayloadAction<{
                formationId: string | null
                values: Partial<WalletServiceMetadata>
            }>,
        ) {
            const { formationId, values } = action.payload
            const record = metadataRecordFor(state, formationId)
            record.holds = { ...record.holds, ...values }
        },
        /** A new guardian count invalidates the quoted seats and payers. */
        clearWalletServiceSelectionPreview(state) {
            state.selectionPreview = null
            state.eligiblePayers = null
            state.payerError = null
        },
    },
    extraReducers: builder => {
        builder.addCase(fetchWalletServiceMetadata.pending, (state, action) => {
            const record = metadataRecordFor(
                state,
                getStatusFormationId(state.status),
            )
            record.latestRequestId = action.meta.requestId
            record.status = 'loading'
        })
        builder.addCase(
            fetchWalletServiceMetadata.fulfilled,
            (state, action) => {
                const record = getCurrentMetadataRead(
                    state,
                    action.meta.requestId,
                )
                if (!record) return
                const published = action.payload
                record.published = published
                record.status = 'loaded'
                // once consensus reports a value we asked for, that hold is
                // spent
                for (const key of Object.keys(
                    record.holds,
                ) as (keyof WalletServiceMetadata)[]) {
                    if (record.holds[key] === published[key])
                        delete record.holds[key]
                }
            },
        )
        builder.addCase(
            fetchWalletServiceMetadata.rejected,
            (state, action) => {
                const record = getCurrentMetadataRead(
                    state,
                    action.meta.requestId,
                )
                if (!record) return
                // a failed refresh leaves the last good read on screen
                record.status = record.published ? 'loaded' : 'failed'
            },
        )
        builder.addCase(prepareWalletServicePayment.pending, state => {
            state.operationError = null
            state.payerError = null
        })
        builder.addCase(
            prepareWalletServicePayment.fulfilled,
            (state, action) => {
                state.selectionPreview = action.payload.preview
                state.eligiblePayers = action.payload.payers
                state.payerError = action.payload.payerError
            },
        )
        builder.addCase(
            prepareWalletServicePayment.rejected,
            (state, action) => {
                state.operationError = action.payload ?? null
            },
        )
        builder.addCase(
            refreshWalletServiceEligiblePayers.fulfilled,
            (state, action) => {
                state.eligiblePayers = action.payload.payers
                state.payerError = action.payload.payerError
            },
        )
        builder.addCase(createWalletService.pending, state => {
            state.operationError = null
        })
        builder.addCase(createWalletService.fulfilled, state => {
            state.selectionPreview = null
            state.eligiblePayers = null
            state.payerError = null
            // setup is paid for; a later top-up for the same payer is a new
            // amount and must not reopen this one
            state.topUpInvoice = null
        })
        builder.addCase(createWalletService.rejected, (state, action) => {
            state.operationError = action.payload ?? null
            // the bridge has dropped the sealed selection, so a retry must go
            // back through a fresh preview
            if (
                action.payload?.detail?.type ===
                'selectionReauthorizationRequired'
            ) {
                state.selectionPreview = null
            }
        })
        builder.addCase(authorizeWalletServicePayments.pending, state => {
            state.operationError = null
        })
        builder.addCase(
            authorizeWalletServicePayments.rejected,
            (state, action) => {
                state.operationError = action.payload ?? null
            },
        )
        builder.addCase(previewWalletServiceReplacements.pending, state => {
            state.operationError = null
        })
        builder.addCase(
            previewWalletServiceReplacements.fulfilled,
            (state, action) => {
                state.replacementPreview = action.payload
            },
        )
        builder.addCase(
            previewWalletServiceReplacements.rejected,
            (state, action) => {
                state.replacementPreview = null
                state.operationError = action.payload ?? null
            },
        )
        builder.addCase(applyWalletServiceReplacements.pending, state => {
            state.operationError = null
        })
        builder.addCase(applyWalletServiceReplacements.fulfilled, state => {
            state.replacementPreview = null
        })
        builder.addCase(
            applyWalletServiceReplacements.rejected,
            (state, action) => {
                // the bridge sealed the subset to the exact previewId, so any
                // rejection means re-previewing before another attempt
                state.replacementPreview = null
                state.operationError = action.payload ?? null
            },
        )
        builder.addCase(previewGuardianTransferDestination.pending, state => {
            state.operationError = null
        })
        builder.addCase(
            previewGuardianTransferDestination.fulfilled,
            (state, action) => {
                state.transferDestinationPreview = action.payload
            },
        )
        builder.addCase(
            previewGuardianTransferDestination.rejected,
            (state, action) => {
                state.transferDestinationPreview = null
                state.operationError = action.payload ?? null
            },
        )
        builder.addCase(startGuardianTransfer.pending, state => {
            state.operationError = null
        })
        // the move itself arrives on the transfer stream, which may already
        // be past the phase this start's run ended on
        builder.addCase(startGuardianTransfer.fulfilled, state => {
            // the previewId is spent, so a second start must re-preview
            state.transferDestinationPreview = null
        })
        builder.addCase(startGuardianTransfer.rejected, (state, action) => {
            // `busy` is the bridge declining to start right now, not the
            // preview going stale, so the same one is still good on a retry
            if (action.payload?.code !== 'busy')
                state.transferDestinationPreview = null
            state.operationError = action.payload ?? null
        })
        builder.addCase(resumeWalletService.pending, state => {
            state.operationError = null
        })
        builder.addCase(resumeWalletService.rejected, (state, action) => {
            state.operationError = action.payload ?? null
        })
    },
})

/*** Basic actions ***/

export const {
    setFaClientStatus,
    setFaStatus,
    setFaFederationJoin,
    setReplacementCandidates,
    setGuardianTransfer,
    setWalletServiceDraft,
    clearFaOperationError,
    clearWalletServiceSelectionPreview,
    setWalletServiceTopUpInvoice,
    setFaLiquidityOperation,
    setFaLiquidityError,
    clearFaLiquidityError,
    recordFaLiquidityAbsent,
    clearFaLiquidity,
    setFaLiquidityRequesting,
    holdWalletServiceMetadata,
} = faSlice.actions

/*** Async thunk actions ***/

export const refreshFaStatus = createAsyncThunk<
    void,
    { fedimint: FedimintBridge },
    { state: CommonState }
>('fi/refreshFaStatus', async ({ fedimint }, { dispatch }) => {
    const clientStatus = await fedimint.faClientStatus()
    // no previous to compare against: a refresh runs once per subscribe, so
    // this is a deliberate one line rather than a repeat
    logFaClientStatusChange(null, clientStatus)
    dispatch(setFaClientStatus(clientStatus))
})

/**
 * The two calls answer different questions, so they fail independently.
 *
 * The preview is the price, and without it the payment screen has nothing to
 * show — a failure there rejects. The payer lookup only says which of the
 * user's wallets may pay. `faClientEligiblePayers` returns an *error*, not an
 * empty list, when the trusted setup payment set cannot be authenticated, so
 * rejecting on it would hide the price from anyone who has joined no such
 * federation — the exact dead end this flow is meant to remove.
 */
export const prepareWalletServicePayment = createAsyncThunk<
    {
        preview: RpcFaSelectionPreview
        payers: RpcFaEligiblePayer[]
        payerError: RpcFaOperationError | null
    },
    { fedimint: FedimintBridge },
    { state: CommonState; rejectValue: RpcFaOperationError }
>(
    'fi/prepareWalletServicePayment',
    async ({ fedimint }, { getState, rejectWithValue }) => {
        const { size } = selectWalletServiceDraft(getState())
        log.info('prepareWalletServicePayment requested', {
            federationSize: size,
        })
        const [previewResult, payersResult] = await Promise.all([
            fedimint.faClientPreviewSelection({
                federationSize: size,
                plan: WALLET_SERVICE_PLAN,
            }),
            fedimint.faClientEligiblePayers(),
        ])
        if (previewResult.type === 'error') {
            log.error(
                'prepareWalletServicePayment preview',
                { federationSize: size },
                previewResult.error,
            )
            return rejectWithValue(previewResult.error)
        }
        if (payersResult.type === 'error') {
            log.warn(
                'prepareWalletServicePayment payers',
                { federationSize: size },
                payersResult.error,
            )
            return {
                preview: previewResult.preview,
                payers: [],
                payerError: payersResult.error,
            }
        }
        return {
            preview: previewResult.preview,
            payers: payersResult.payers,
            payerError: null,
        }
    },
)

/**
 * The payer half of `prepareWalletServicePayment`, on its own.
 *
 * A wallet is only an eligible payer once it has finished loading, so the
 * answer to "which of my wallets may pay" changes on its own, without anything
 * about the price changing. Re-running the full preparation to find that out
 * would spend `faClientPreviewSelection` — 30-60s of real guardian dialling —
 * on a question it was not asked, and hand back a new quote nobody wanted.
 *
 * Failure is deliberately quiet. This runs on a poll rather than on a press,
 * so a failed attempt is not a user action that failed; the next attempt is
 * already coming, and the caller's existing state is still the best answer.
 */
export const refreshWalletServiceEligiblePayers = createAsyncThunk<
    { payers: RpcFaEligiblePayer[]; payerError: RpcFaOperationError | null },
    { fedimint: FedimintBridge }
>('fi/refreshWalletServiceEligiblePayers', async ({ fedimint }) => {
    const payersResult = await fedimint.faClientEligiblePayers()
    if (payersResult.type === 'error') {
        log.warn('refreshWalletServiceEligiblePayers', payersResult.error)
        return { payers: [], payerError: payersResult.error }
    }
    return { payers: payersResult.payers, payerError: null }
})

// paymentFederationId comes from the screen so the wallet that pays is the
// wallet the user was shown, never a fresher default from state
export const createWalletService = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; paymentFederationId: string },
    { state: CommonState; rejectValue: RpcFaOperationError }
>(
    'fi/createWalletService',
    async (
        { fedimint, paymentFederationId },
        { getState, rejectWithValue },
    ) => {
        const { name, size } = selectWalletServiceDraft(getState())
        const preview = selectWalletServiceSelectionPreview(getState())
        if (!preview) {
            return rejectWithValue({
                code: 'selection',
                message: 'no selection preview to pay for',
                detail: null,
            })
        }
        log.info('createWalletService requested', {
            ...faLogContext(getState()),
            previewId: preview.previewId,
            federationSize: size,
            hasName: Boolean(name),
            paymentFederationId,
            totalAdvertisedMsats: preview.totalAdvertisedMsats,
        })
        // the spending limit the user approved is the advertised total;
        // quotes above it park as a reauthorization instead of paying
        const result = await fedimint.faClientPayAndCreate(
            preview.previewId,
            {
                federationName: name || null,
                federationSize: size,
                plan: WALLET_SERVICE_PLAN,
            },
            paymentFederationId,
            preview.totalAdvertisedMsats,
        )
        if (result.type === 'error') {
            log.error(
                'createWalletService',
                { previewId: preview.previewId, paymentFederationId },
                result.error,
            )
            return rejectWithValue(result.error)
        }
    },
)

// authorizationId must be the id that was rendered to the user; the bridge
// rejects stale ids and re-parks the replacement set in actionRequired
export const authorizeWalletServicePayments = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; authorizationId: string },
    { state: CommonState; rejectValue: RpcFaOperationError }
>(
    'fi/authorizeWalletServicePayments',
    async ({ fedimint, authorizationId }, { getState, rejectWithValue }) => {
        log.info('authorizeWalletServicePayments requested', {
            ...faLogContext(getState()),
            authorizationId,
        })
        const result =
            await fedimint.faClientAuthorizeReplacementPayments(authorizationId)
        if (result.type === 'error') {
            log.error(
                'authorizeWalletServicePayments',
                { authorizationId },
                result.error,
            )
            return rejectWithValue(result.error)
        }
    },
)

export const setWalletServiceGuardianFee = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; guardianFeePpm: number },
    { state: CommonState; rejectValue: RpcFaOperationError }
>(
    'fi/setWalletServiceGuardianFee',
    async ({ fedimint, guardianFeePpm }, { rejectWithValue }) => {
        const result = await fedimint.faClientSetGuardianFee(guardianFeePpm)
        if (result.type === 'error') {
            log.error('setWalletServiceGuardianFee', result.error)
            return rejectWithValue(result.error)
        }
    },
)

/**
 * The consensus meta key each editable field lands under. Manifold writes the
 * name bare and the rest `fedi:`-prefixed (`FEDERATION_NAME_META_FIELD_KEY`
 * and siblings in its `service-manifold-guardian` types).
 */
const METADATA_UPDATE_META_KEYS = {
    name: 'federation_name',
    iconUrl: 'fedi:federation_icon_url',
    welcomeMessage: 'fedi:welcome_message',
    termsOfService: 'fedi:tos_url',
} as const

export const APP_SETTING_META_KEYS = {
    autojoinCommunities: 'fedi:autojoin_communities',
    defaultGroupChats: 'fedi:default_group_chats',
    pinnedMessage: 'fedi:pinned_message',
    defaultCurrency: 'fedi:default_currency',
    stabilityPoolDisabled: 'fedi:stability_pool_disabled',
    multispendDisabled: 'fedi:multispend_disabled',
    inviteCodesDisabled: 'fedi:invite_codes_disabled',
    newMembersDisabled: 'fedi:new_members_disabled',
    offlineWalletDisabled: 'fedi:offline_wallet_disabled',
    onchainDepositsDisabled: 'fedi:onchain_deposits_disabled',
    maxBalanceMsats: 'fedi:max_balance_msats',
    maxInvoiceMsats: 'fedi:max_invoice_msats',
    maxStableBalanceMsats: 'fedi:max_stable_balance_msats',
} as const satisfies Record<RpcFaAppSetting, string>

/**
 * Reads the name, icon, description, terms and auto join spaces the wallet
 * service federation publishes, into the one record every screen reads.
 */
export const fetchWalletServiceMetadata = createAsyncThunk<
    WalletServiceMetadata,
    { fedimint: FedimintBridge },
    { state: CommonState }
>(
    'fi/fetchWalletServiceMetadata',
    async ({ fedimint }, { getState }) => {
        const inviteCode = selectFaInviteCode(getState())
        if (!inviteCode) throw new Error('no wallet service invite code')
        try {
            const preview = await fedimint.federationPreview(inviteCode)
            return readPublishedMetadata(preview.name, preview.meta)
        } catch (error) {
            log.warn('federationPreview for wallet service metadata', error)
            throw error
        }
    },
    {
        // with no invite code there is nothing to read, and a read that never
        // ran must not report a failure
        condition: (_, { getState }) => selectFaInviteCode(getState()) !== null,
    },
)

export const updateWalletServiceMetadata = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        update: RpcFaFederationMetadataUpdate
        /**
         * The joined wallet service federation, when known. Its store meta is
         * patched with the saved value so screens reading the federation
         * (the dashboard title, the wallet list) show it at once.
         */
        federationId?: string | null
    },
    { state: CommonState; rejectValue: RpcFaOperationError }
>(
    'fi/updateWalletServiceMetadata',
    async (
        { fedimint, update, federationId },
        { dispatch, rejectWithValue },
    ) => {
        const result = await fedimint.faClientUpdateFederationMetadata(update)
        if (result.type === 'error') {
            log.error('updateWalletServiceMetadata', result.error)
            return rejectWithValue(result.error)
        }
        // Manifold only reports success once the guardians' consensus already
        // holds the value, so this is a read-through, not an optimistic write.
        // The bridge's own meta poll is ten minutes apart, which is where a
        // rename that "did not take" was hiding.
        if (federationId) {
            const key =
                update.type === 'appSetting'
                    ? APP_SETTING_META_KEYS[update.setting]
                    : METADATA_UPDATE_META_KEYS[update.type]
            dispatch(
                mergeFederationMeta({
                    federationId,
                    meta: {
                        [key]: update.value,
                    },
                }),
            )
        }
    },
)

export const previewWalletServiceReplacements = createAsyncThunk<
    RpcFaReplacementPreview,
    { fedimint: FedimintBridge },
    { state: CommonState; rejectValue: RpcFaOperationError }
>(
    'fi/previewWalletServiceReplacements',
    async ({ fedimint }, { rejectWithValue }) => {
        const result = await fedimint.faClientPreviewReplacements()
        if (result.type === 'error') {
            log.error('previewWalletServiceReplacements', result.error)
            return rejectWithValue(result.error)
        }
        return result.preview
    },
)

export const applyWalletServiceReplacements = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        previewId: string
        maxTotalMsats: RpcFaReplacementPreview['totalAdvertisedMsats']
    },
    { state: CommonState; rejectValue: RpcFaOperationError }
>(
    'fi/applyWalletServiceReplacements',
    async (
        { fedimint, previewId, maxTotalMsats },
        { getState, rejectWithValue },
    ) => {
        log.info('applyWalletServiceReplacements requested', {
            ...faLogContext(getState()),
            previewId,
            maxTotalMsats,
        })
        // cap the spend at the exact total the user saw, never a fresher one
        const result = await fedimint.faClientApplyReplacements(
            previewId,
            maxTotalMsats,
        )
        if (result.type === 'error') {
            log.error(
                'applyWalletServiceReplacements',
                { previewId, maxTotalMsats },
                result.error,
            )
            return rejectWithValue(result.error)
        }
    },
)

/**
 * The bridge previews only for a guardian its latest check flagged, and keeps
 * that decision with the preview, so a later check cannot take it back.
 */
export const previewGuardianTransferDestination = createAsyncThunk<
    RpcFaTransferDestinationPreview,
    { fedimint: FedimintBridge; seatIndex: number },
    { state: CommonState; rejectValue: RpcFaOperationError }
>(
    'fi/previewGuardianTransferDestination',
    async ({ fedimint, seatIndex }, { getState, rejectWithValue }) => {
        const result =
            await fedimint.faClientPreviewTransferDestination(seatIndex)
        if (result.type === 'error') {
            log.error(
                'previewGuardianTransferDestination',
                faLogContext(getState()),
                result.error,
            )
            return rejectWithValue(result.error)
        }
        return result.preview
    },
)

/**
 * The spend cap and the previewId both come from the preview in state, so the
 * amount approved is always the price the user is looking at.
 *
 * There is no resume counterpart: the bridge's own loop carries an open move
 * forward, and the transfer stream reports it, including a move that failed
 * part way.
 */
export const startGuardianTransfer = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        paymentFederationId: string
    },
    { state: CommonState; rejectValue: RpcFaOperationError }
>(
    'fi/startGuardianTransfer',
    async (
        { fedimint, paymentFederationId },
        { getState, rejectWithValue },
    ) => {
        const preview = selectTransferDestinationPreview(getState())
        if (!preview) {
            return rejectWithValue({
                code: 'selection',
                message: 'no transfer destination preview to pay for',
                detail: null,
            })
        }
        const { previewId, advertisedPriceMsats } = preview
        log.info('startGuardianTransfer requested', {
            ...faLogContext(getState()),
            previewId,
            paymentFederationId,
            maxMsats: advertisedPriceMsats,
        })
        // the preview names the guardian it was made for
        const result = await fedimint.faClientStartGuardianTransfer(
            previewId,
            paymentFederationId,
            advertisedPriceMsats,
        )
        if (result.type === 'error') {
            log.error(
                'startGuardianTransfer',
                { ...faLogContext(getState()), previewId },
                result.error,
            )
            return rejectWithValue(result.error)
        }
    },
)

export const resumeWalletService = createAsyncThunk<
    void,
    { fedimint: FedimintBridge },
    { state: CommonState; rejectValue: RpcFaOperationError }
>('fi/resumeWalletService', async ({ fedimint }, { rejectWithValue }) => {
    const result = await fedimint.faClientResume()
    if (result.type === 'error') {
        log.error('resumeWalletService', result.error)
        return rejectWithValue(result.error)
    }
})

export const restartWalletServiceDkg = createAsyncThunk<
    void,
    { fedimint: FedimintBridge },
    { state: CommonState; rejectValue: RpcFaOperationError }
>(
    'fi/restartWalletServiceDkg',
    async ({ fedimint }, { getState, rejectWithValue }) => {
        log.info('restartWalletServiceDkg requested', faLogContext(getState()))
        const result = await fedimint.faClientRestartDkg()
        if (result.type === 'error') {
            log.error('restartWalletServiceDkg', result.error)
            return rejectWithValue(result.error)
        }
    },
)

/*** Selectors ***/

/**
 * TODO(wallet-service): DELETE THE `isDev()` FORCE.
 *
 * Dev bridges read remote features from staging
 * (`STAGING_REMOTE_FEATURES_URL`), which is deployed from master and does not
 * yet serve `walletServiceCreation`. The Rust field is `#[serde(default)]`, so
 * an older payload silently resolves it to `false` — the flag flips off a
 * moment after launch, once the fetch lands, and the entry point disappears.
 *
 * Forced on in dev until staging ships the flag. Remove this and read
 * `selectFeatureFlag` directly at that point.
 */
export const selectIsWalletServiceCreationReleased = (s: CommonState) =>
    isDev() || Boolean(selectFeatureFlag(s, 'wallet_service_creation'))

export const selectIsWalletServiceCreationEnabled = (s: CommonState) =>
    selectIsWalletServiceCreationReleased(s) ||
    selectManifoldCreationOverrideEnabled(s)

// Requiring the creation flag here would hide the offer from users who
// unlocked creation with the tap override.
export const selectIsWalletServiceDkgRestartEnabled = (s: CommonState) =>
    Boolean(selectFeatureFlag(s, 'wallet_service_dkg_restart'))

export const selectIsWalletServiceGuardianTransferEnabled = (s: CommonState) =>
    Boolean(selectFeatureFlag(s, 'wallet_service_guardian_transfer'))

export const selectFaStatus = (s: CommonState) => s.fi.status

// Include retryable backup lookup errors carried by an otherwise ready client.
export const selectFaClientError = (s: CommonState) =>
    s.fi.clientError ??
    (s.fi.status?.type === 'recovery' ? s.fi.status.error : null)

/**
 * Whether a recorded join failure is no longer about anything.
 *
 * The bridge retains its last reported join state and re-emits it on every
 * status read, and a restored service never returns to `idle` — so the
 * reducer's idle clear never fires for one. The federation the failure names
 * is what settles it: once it is joined, loaded and done recovering, the join
 * the failure describes has since succeeded.
 */
const isJoinFailureStale = (s: CommonState) => {
    const join = s.fi.federationJoin
    return (
        join !== null && selectIsWalletServiceWalletReady(s, join.federationId)
    )
}

/**
 * A join failure the bridge cannot retry, or `null` while joining, recovering,
 * ready, or unknown. The message is the bridge's own, since nothing on this
 * device can diagnose the cause further than it already has.
 */
export const selectFaFederationJoinFailure = (s: CommonState) => {
    const join = s.fi.federationJoin
    return join?.state.type === 'failed' && !isJoinFailureStale(s)
        ? { message: join.state.message }
        : null
}

export const selectFaOperationError = (s: CommonState) => s.fi.operationError

export const selectWalletServiceDraft = (s: CommonState) => s.fi.draft

export const selectWalletServiceTopUpInvoice = (s: CommonState) =>
    s.fi.topUpInvoice

export const selectWalletServiceSelectionPreview = (s: CommonState) =>
    s.fi.selectionPreview

export const selectWalletServiceEligiblePayers = (s: CommonState) =>
    s.fi.eligiblePayers

// the picker must only offer wallets the bridge admits; an empty list means
// no wallet can pay right now
export const selectWalletServiceEligiblePayerIds = createSelector(
    selectWalletServiceEligiblePayers,
    (payers): string[] => (payers ?? []).map(p => p.federationId),
)

export const selectFaFormation = (s: CommonState) =>
    s.fi.status?.type === 'formation' ? s.fi.status.formation : null

export const selectIsWalletServiceWaitingOnDkg = (s: CommonState) => {
    const formation = selectFaFormation(s)
    return (
        formation !== null &&
        (formation.phase === 'preparingDkg' ||
            formation.phase === 'dkgUnderway') &&
        formation.actionRequired === null &&
        formation.seats.every(seat => seat.guardianCode !== null)
    )
}

export const selectWalletServiceFormationId = (s: CommonState) =>
    getStatusFormationId(selectFaStatus(s))

const NO_METADATA_RECORD = makeMetadataRecord(null)

/** The metadata record for the current formation. */
const selectWalletServiceMetadataRecord = (s: CommonState) => {
    const record = s.fi.walletServiceMetadata
    return record.formationId === selectWalletServiceFormationId(s)
        ? record
        : NO_METADATA_RECORD
}

/** Saved metadata values for the current formation that consensus lags. */
export const selectWalletServiceMetadataHolds = (s: CommonState) =>
    selectWalletServiceMetadataRecord(s).holds

/** The published metadata with any just-saved values over it. */
export const selectWalletServiceMetadata = createSelector(
    (s: CommonState) => selectWalletServiceMetadataRecord(s).published,
    selectWalletServiceMetadataHolds,
    (published, holds) => applyHolds(published ?? EMPTY_METADATA, holds),
)

export const selectWalletServiceMetadataStatus = (s: CommonState) =>
    selectWalletServiceMetadataRecord(s).status

/** False until a read succeeds; every field reads as unset before then. */
export const selectHasWalletServiceMetadataLoaded = (s: CommonState) =>
    selectWalletServiceMetadataRecord(s).published !== null

export const selectWalletServiceGuardianCount = (s: CommonState) => {
    const status = selectFaStatus(s)
    if (status?.type === 'formation')
        return status.formation.intent.federationSize
    if (status?.type === 'formed') return status.federation.seats.length
    return 0
}

export const selectCanSubmitWalletServiceDraft = (s: CommonState) =>
    s.fi.draft.size >= MIN_WALLET_SERVICE_SIZE

// federationId is the wallet the screen has displayed as selected, so the
// wallet that is checked is always the wallet that will be charged.
// eligiblePayers gates admission only; the affordability check reads the live
// federation balance, because the snapshot's balanceMsats is frozen at quote
// time and a top-up that lands after it would never unlock the pay button
// msats cross the bridge as decimal strings to keep u64 range, so compare
// as bigints, never through Number
export const selectCanPayForWalletService = createSelector(
    selectWalletServiceSelectionPreview,
    selectWalletServiceEligiblePayers,
    (_s: CommonState, federationId: string | undefined) => federationId,
    (s: CommonState, federationId: string | undefined) =>
        federationId ? selectFederationBalance(s, federationId) : 0,
    (preview, payers, federationId, balanceMsats): boolean => {
        if (!preview || !payers || !federationId) return false
        const payer = payers.find(p => p.federationId === federationId)
        if (!payer) return false
        return BigInt(balanceMsats) >= BigInt(preview.totalAdvertisedMsats)
    },
)

export const selectWalletServicePayerError = (s: CommonState) => s.fi.payerError

/**
 * Why the payment screen has no wallet to pay with. These are different causes
 * and need different copy: one is a state the user can act on, the other is a
 * fault they cannot.
 *
 * - `unknown`     — no quote has been fetched yet
 * - `available`   — at least one wallet may pay
 * - `noTrustedFederation` — the lookup worked and returned nothing: the user
 *   has joined no trusted setup payment federation
 * - `lookupFailed` — the lookup itself errored, so membership is unknown
 */
export type WalletServicePayerAvailability =
    | 'unknown'
    | 'available'
    | 'noTrustedFederation'
    | 'lookupFailed'

export const selectWalletServicePayerAvailability = createSelector(
    selectWalletServiceEligiblePayers,
    selectWalletServicePayerError,
    (payers, payerError): WalletServicePayerAvailability => {
        if (payerError) return 'lookupFailed'
        if (payers === null) return 'unknown'
        return payers.length > 0 ? 'available' : 'noTrustedFederation'
    },
)

export type WalletServiceCreationStage = 1 | 2 | 3

/**
 * A formed federation that this device restored from a backup. Screens take
 * it through the restore flow: verify, rejoin, restore the balance. A
 * federation formed on this device is not in it.
 */
export const selectIsWalletServiceRestoreFlow = (s: CommonState) => {
    const status = selectFaStatus(s)
    return status?.type === 'formed' && status.federation.origin === 'backup'
}

// stages: 1 ecash sent, 2 guardians confirmed, 3 wallet service created
//
// Reported from the high-water mark rather than the live snapshot, so a seat
// that drops out or a driver run that re-reads the store cannot rewind a
// checkmark the user has already been shown. See {@link CreationHighWaterMark}.
export const selectWalletServiceCreationProgress = createSelector(
    selectFaStatus,
    (s: CommonState) => s.fi.creationHighWaterMark,
    (
        status,
        highWater,
    ): {
        stage: WalletServiceCreationStage
        isComplete: boolean
    } | null => {
        // A formed federation completes the creation that this app watched.
        if (status?.type === 'formed')
            return highWater?.formationId === status.federation.formationId
                ? { stage: 3, isComplete: true }
                : null
        if (status?.type !== 'formation') return null
        const { formation } = status
        // a mark left over from a previous formation says nothing about this one
        const mark =
            highWater?.formationId === formation.formationId ? highWater : null
        // the mark can only raise the live reading, never lower it: a caller
        // holding a formation the reducer has not seen still gets the truth
        return {
            stage: Math.max(
                getWalletServiceCreationStage(formation),
                mark?.stage ?? 0,
            ) as WalletServiceCreationStage,
            isComplete: Boolean(mark?.isComplete),
        }
    },
)

export const getWalletServiceCreationStage = (
    formation: RpcFaFormationSnapshot,
): WalletServiceCreationStage => {
    const { ecashSent, guardiansConfirmed } = formation.milestones
    if (guardiansConfirmed) return 3
    if (ecashSent) return 2
    return 1
}

// lets entry points route back into an in-flight flow; a second create while
// one formation is active is rejected busy by the bridge.
// 'unknown' is the startup window before the first status lands - entry points
// must wait rather than route on it, or they start a duplicate flow
/**
 * How far a running attach has got, for a progress line.
 *
 * `requested` and `allocating` are provider-authored, so they say what the
 * provider claims, never that the provider is usable. Only `ready` — which is
 * `gatewayViewVerified` — means the FA found the gateway in a fresh,
 * threshold-aggregated LNv2 view from the formed federation.
 *
 * `actionRequired` sits outside the ordered sequence deliberately: it is an
 * operator decision point, not a step on the way to `ready`, and rendering it
 * as progress would invite the automatic retry its own contract forbids.
 */
export type WalletServiceLightningStage =
    | 'requested'
    | 'allocating'
    | 'verifying'
    | 'ready'
    | 'actionRequired'

/**
 * Ordered stages a progress line walks. `actionRequired` is not among them.
 *
 * Every entry must be reachable from `toLightningStage`, or the line shows a
 * step that can never light. There is deliberately no provider-complete stage:
 * an item reporting `completed` always carries matching completion evidence,
 * so no state exists between that and `gatewayViewVerified` for one to read.
 */
export const WALLET_SERVICE_LIGHTNING_STAGES = [
    'requested',
    'allocating',
    'verifying',
    'ready',
] as const satisfies ReadonlyArray<WalletServiceLightningStage>

export type WalletServiceLightningStatus =
    /** The durable read has not answered, so nothing may be asserted. */
    | 'unknown'
    /** Asked, and nothing is attached. The only status a tick may produce. */
    | 'idle'
    | 'attaching'
    | 'attached'
    | 'failed'

const findGatewayItem = (operation: RpcFaLiquidityOperation) =>
    (operation.itemStatuses ?? []).find(item => item.target.type === 'gateway')

/**
 * Read the stage out of a durable operation snapshot.
 *
 * A `completed` gateway item maps to `verifying`, not to a stage of its own:
 * verification is the FA's work, not the provider's, so a provider reporting
 * itself complete still leaves the user waiting. That wait is where the time
 * actually goes, so it gets the stage.
 *
 * A snapshot without item statuses still has a stage — the request exists.
 * Throwing here would take the whole read down, and a caller would render that
 * as "no provider attached".
 */
export function toLightningStage(
    operation: RpcFaLiquidityOperation,
): WalletServiceLightningStage {
    if (operation.gatewayViewVerified) return 'ready'
    const gatewayItem = findGatewayItem(operation)
    if (!gatewayItem) return 'requested'
    if (gatewayItem.phase === 'actionRequired') return 'actionRequired'
    if (gatewayItem.phase === 'completed') return 'verifying'
    if (gatewayItem.phase === 'running') return 'allocating'
    return 'requested'
}

/**
 * Defaulted rather than read straight off the slice: a state persisted by a
 * build older than this key rehydrates without it, and a preloaded state in a
 * test need not spell out every slice. Reading through a default turns both
 * into "we have not found out yet", which is the honest answer, instead of a
 * crash inside a selector.
 */
const NO_LIQUIDITY_READ = {
    operation: null,
    hasRead: false,
    errorCode: null,
    isRequesting: false,
} as const

const selectFaLiquidity = (s: CommonState) =>
    s.fi.liquidity ?? NO_LIQUIDITY_READ

export const selectFaLiquidityOperation = createSelector(
    selectFaLiquidity,
    liquidity => liquidity.operation,
)

/**
 * The one answer every Lightning surface reads.
 *
 * `unknown` outranks everything: before the durable read lands, the honest
 * report is that we do not know, and no host may offer to change a thing it
 * has not established.
 */
export const selectWalletServiceLightningStatus = createSelector(
    selectFaLiquidity,
    (liquidity): WalletServiceLightningStatus => {
        if (!liquidity.hasRead) return 'unknown'
        if (liquidity.errorCode) return 'failed'
        if (!liquidity.operation) return 'idle'
        if (liquidity.operation.phase === 'rejected') return 'failed'
        return liquidity.operation.gatewayViewVerified
            ? 'attached'
            : 'attaching'
    },
)

/** A start whose RPCs are still in flight, shared by every host. */
export const selectIsFaLiquidityRequesting = createSelector(
    selectFaLiquidity,
    liquidity => liquidity.isRequesting,
)

export const selectFaLiquidityErrorCode = createSelector(
    selectFaLiquidity,
    liquidity => liquidity.errorCode,
)

export const selectWalletServiceLightningStage = createSelector(
    selectFaLiquidityOperation,
    operation => (operation ? toLightningStage(operation) : null),
)

/**
 * Whether the bridge still has work in flight for this attach.
 *
 * This is the poll's own stop condition, and it is the bridge's contract
 * rather than a timer: a terminal operation stops being reported, so watching
 * ends because there is nothing left to watch. No budget, and so no elapsed
 * time that could be wrong.
 */
export const selectIsWalletServiceLightningRunning = createSelector(
    selectWalletServiceLightningStatus,
    status => status === 'attaching',
)

export const selectWalletServiceFlowStatus = createSelector(
    selectFaStatus,
    // the raw event, not `selectFaFederationJoinFailure`: that one builds a
    // fresh object on every read, which would defeat this selector's memo
    (s: CommonState) => s.fi.federationJoin,
    // the same staleness rule, as a boolean for the same reason
    isJoinFailureStale,
    (
        status,
        join,
        isStaleFailure,
    ): 'unknown' | 'none' | 'inProgress' | 'formed' => {
        if (!status) return 'unknown'
        // Backup lookup has not established whether a formation exists yet.
        if (status.type === 'recovery') return 'unknown'
        if (status.type === 'formed') {
            const { freshness, backupEligible, origin } = status.federation
            // A failed rejoin of a restored service has to be reachable. Its
            // terminal screen lives on WalletServiceProgress, so routing a
            // `backupEligible` service straight to the dashboard would strand
            // the failure off-screen — with the dashboard showing an empty
            // balance and no explanation. This check comes before the `formed`
            // decision for that reason. A service created on this device shows
            // its join failure on the dashboard instead.
            if (
                origin === 'backup' &&
                join?.state.type === 'failed' &&
                !isStaleFailure
            )
                return 'inProgress'
            // verified on this device before: treat like a created service and let
            // the guardian-line skeleton carry the caveat. Never verified: hold the loader.
            return freshness === 'fresh' || backupEligible
                ? 'formed'
                : 'inProgress'
        }
        if (status.type !== 'formation') return 'none'
        return 'inProgress'
    },
)

/**
 * Not "a formation exists": `pay_and_create` writes its record before it pays,
 * and a payment that fails on funds is wiped back to idle.
 * `paymentOutputsStarted` is the bridge's own commitment boundary.
 */
export const selectHasWalletServiceCommitted = createSelector(
    selectFaStatus,
    status => {
        // a formed service was paid for, on this device or another
        if (status?.type === 'formed') return true
        if (status?.type !== 'formation') return false
        const { formation } = status
        return (
            formation.paymentOutputsStarted || formation.actionRequired !== null
        )
    },
)

// both action types carry the same requirements and are satisfied by the
// same authorize rpc, so they merge into one prompt
export const selectFaPaymentRequirements = createSelector(
    selectFaFormation,
    formation =>
        formation?.actionRequired?.type === 'authorizePayments' ||
        formation?.actionRequired?.type === 'authorizeReplacementPayments'
            ? formation.actionRequired.requirements
            : null,
)

export const selectFaReplacementRequirements = createSelector(
    selectFaFormation,
    formation =>
        formation?.actionRequired?.type === 'replaceGuardians'
            ? formation.actionRequired.requirements
            : null,
)

export const selectWalletServiceReplacementPreview = (s: CommonState) =>
    s.fi.replacementPreview

/*** Guardian transfer ***/

/** The guardian move, `null` for none and `undefined` for not heard yet. */
export const selectGuardianTransfer = (s: CommonState) => s.fi.guardianTransfer

export const selectTransferDestinationPreview = (s: CommonState) =>
    s.fi.transferDestinationPreview

/**
 * The guardians the latest check flagged that still hold their seat, so a
 * guardian already replaced stops being offered before the next check.
 */
export const selectReplacementCandidates = createSelector(
    (s: CommonState) => s.fi.replacementCheck,
    selectFaStatus,
    (check, status): RpcFaReplacementCandidate[] => {
        if (!check) return []
        // the same seat indexes as `selectGuardianTransferSeats`
        const seatMgId = (index: number) =>
            status?.type === 'formed'
                ? status.federation.seats[index]?.mgId
                : undefined
        return check.candidates.filter(
            candidate => seatMgId(candidate.seatIndex) === candidate.mgId,
        )
    },
)

/** When the latest replacement check finished; null before the first one. */
export const selectReplacementCheckedAt = (s: CommonState) =>
    s.fi.replacementCheck?.checkedAt ?? null

// Follow the last replacement check until its normal refresh clears the blocker.
export const selectGuardianReplacementBlocker = (s: CommonState) =>
    s.fi.replacementCheck?.blockingLiquidityOperation
        ? ('feature.wallet-service.transfer-error-liquidity-pending' as const)
        : null

/** A move that has not finished blocks a second move and liquidity requests. */
export const selectIsGuardianTransferOpen = (s: CommonState) => {
    const transfer = selectGuardianTransfer(s)
    return !!transfer && transfer.phase !== 'completed'
}

/**
 * The guardians a move can pick from. The formed federation lists its seats
 * in seat order, which is the index the move takes.
 */
export const selectGuardianTransferSeats = createSelector(
    selectFaStatus,
    (status): { index: number; name: string | null }[] => {
        if (status?.type !== 'formed') return []
        return status.federation.seats.map((seat, index) => ({
            index,
            name: seat.mgName,
        }))
    },
)

/** The steps of a move, in order. `completed` is the end, not a step. */
export const GUARDIAN_TRANSFER_STEPS = [
    'buyingSeat',
    'awaitingSource',
    'publishingBinding',
    'removingSource',
] as const satisfies RpcFaGuardianTransferPhase[]

/**
 * Where a move has got to, as a step list position.
 *
 * `current` is the 0-based index of the step underway, and the step count
 * once the move is done, so every step reads as behind it.
 */
export const getGuardianTransferProgress = (
    phase: RpcFaGuardianTransferPhase,
) =>
    phase === 'completed'
        ? {
              current: GUARDIAN_TRANSFER_STEPS.length,
              total: GUARDIAN_TRANSFER_STEPS.length,
              isCompleted: true,
          }
        : {
              current: GUARDIAN_TRANSFER_STEPS.indexOf(phase),
              total: GUARDIAN_TRANSFER_STEPS.length,
              isCompleted: false,
          }

// a full Record so a reason the bridge adds is a compile error here rather
// than one vague "the selection changed" standing in for all of them. Each
// reason is a different thing for the user to do about it.
const TRANSFER_REAUTHORIZATION_MESSAGE_KEYS = {
    previewExpired: 'feature.wallet-service.transfer-error-preview-expired',
    advertisementEstimateExceedsLimit:
        'feature.wallet-service.transfer-error-advertised-price-changed',
    selectedMgUnavailable:
        'feature.wallet-service.transfer-error-host-unavailable',
    quoteTotalExceedsLimit:
        'feature.wallet-service.transfer-error-quote-price-changed',
    quoteTermsChanged: 'feature.wallet-service.transfer-error-terms-changed',
    selectedPayerUnavailable:
        'feature.wallet-service.transfer-error-payer-unavailable',
    selectedPayerInsufficientFunds:
        'feature.wallet-service.transfer-error-payer-insufficient-funds',
    verifierEnvironmentChanged:
        'feature.wallet-service.transfer-error-verifier-changed',
    paymentFederationRequired:
        'feature.wallet-service.transfer-error-payment-federation-required',
} as const satisfies Record<RpcFaSelectionReauthorizationReason, string>

/**
 * Two codes need more than {@link getWalletServiceErrorKey} can say here.
 * Only the reauthorization reason says whether the user picks again, tops up,
 * or waits. `busy` is worth retrying shortly, which the setup-wide wording
 * does not offer.
 */
export const getGuardianTransferErrorKey = (
    error: RpcFaOperationError | null | undefined,
) => {
    if (error?.detail?.type === 'liquidityOperationExists')
        return 'feature.wallet-service.transfer-error-liquidity-pending' as const
    if (error?.detail?.type === 'selectionReauthorizationRequired')
        return TRANSFER_REAUTHORIZATION_MESSAGE_KEYS[error.detail.reason]
    if (error?.code === 'busy')
        return 'feature.wallet-service.transfer-error-busy' as const
    if (error?.code === 'replacementNotEligible')
        return 'feature.wallet-service.transfer-error-not-eligible' as const
    // the setup wording for this detail suggests a smaller size, which a move
    // does not have
    if (error?.detail?.type === 'insufficientMgSeats')
        return 'feature.wallet-service.transfer-error-no-free-host' as const
    return getWalletServiceErrorKey(error?.code)
}

// a full Record so a seat phase the bridge adds is a compile error here
// rather than a silent miscount in "{confirmed} of {total}"
const SEAT_PHASE_COUNTS_AS_CONFIRMED = {
    selected: false,
    replacementRequired: false,
    quoteReady: false,
    acquiring: false,
    created: false,
    guardianCodeReady: true,
    dkgUnderway: true,
    running: true,
} as const satisfies Record<RpcFaSeatPhase, boolean>

/** Seats confirmed so far, for the stage detail's "{confirmed} of {total}". */
export const selectWalletServiceGuardianProgress = createSelector(
    selectFaFormation,
    (formation): { confirmed: number; total: number } | null => {
        if (!formation || formation.seats.length === 0) return null
        const confirmed = formation.seats.filter(
            seat => SEAT_PHASE_COUNTS_AS_CONFIRMED[seat.phase],
        ).length
        return { confirmed, total: formation.seats.length }
    },
)

/**
 * What the parked payment authorization still needs beyond the payer wallets'
 * live balances, so the approve prompt can gate proactively (the confirm
 * screen's pattern) instead of letting an authorize attempt fail.
 *
 * Requirements name a payer per seat; sums group by payer so a single top-up
 * target can be surfaced per wallet. Balances are the live event-driven ones,
 * never a snapshot.
 */
type WalletServicePaymentShortfall = {
    federationId: string
    shortfallMsats: bigint
    requiredMsats: bigint
}

// size-1 memo keyed on the authorization and the balances it reads, because
// a `createSelector` over the whole state would hand consumers a fresh object
// on every dispatched action and re-render them for unrelated events
let lastShortfallKey: string | null = null
let lastShortfallResult: WalletServicePaymentShortfall | null = null

export const selectWalletServicePaymentShortfall = (
    s: CommonState,
): WalletServicePaymentShortfall | null => {
    const requirements = selectFaPaymentRequirements(s)
    if (!requirements) return null
    const requiredByPayer = new Map<string, bigint>()
    for (const seat of requirements.seats) {
        requiredByPayer.set(
            seat.paymentFederationId,
            (requiredByPayer.get(seat.paymentFederationId) ?? BigInt(0)) +
                BigInt(seat.amountMsats),
        )
    }
    const payers = Array.from(requiredByPayer.entries())
    const key = [
        requirements.authorizationId,
        requirements.totalMsats,
        ...payers.map(
            ([federationId]) =>
                `${federationId}:${selectFederationBalance(s, federationId)}`,
        ),
    ].join('|')
    if (key === lastShortfallKey) return lastShortfallResult
    lastShortfallKey = key
    lastShortfallResult = null
    for (const [federationId, requiredMsats] of payers) {
        const balance = BigInt(selectFederationBalance(s, federationId))
        if (balance < requiredMsats) {
            lastShortfallResult = {
                federationId,
                shortfallMsats: requiredMsats - balance,
                requiredMsats,
            }
            break
        }
    }
    return lastShortfallResult
}

/**
 * Codes retrying cannot fix: the request itself is wrong, so the driver's
 * auto-resume will fail identically. The screen must not offer "retry" here.
 */
const TERMINAL_FA_ERROR_CODES: RpcFaErrorCode[] = [
    'invalidIntent',
    'invalidOptions',
    'abandonUnavailable',
]

export const isTerminalWalletServiceError = (
    code: RpcFaErrorCode | null | undefined,
) => (code ? TERMINAL_FA_ERROR_CODES.includes(code) : false)

export const selectFaInviteCode = (s: CommonState) => {
    const status = selectFaStatus(s)
    if (status?.type === 'formation') return status.formation.inviteCode
    if (status?.type === 'formed') return status.federation.federationInvite
    return null
}

export const selectFaFormationName = (s: CommonState) => {
    const status = selectFaStatus(s)
    if (status?.type === 'formation')
        return status.formation.intent.federationName
    if (status?.type === 'formed') return status.federation.federationName
    return null
}

export const selectFaLastErrorCode = (s: CommonState) =>
    selectFaFormation(s)?.lastError ?? null

export const selectFaIsUnsynced = (s: CommonState) => {
    const status = selectFaStatus(s)
    if (status?.type === 'formation')
        return status.formation.freshness === 'unsynced'
    if (status?.type === 'formed')
        return status.federation.freshness === 'unsynced'
    return false
}

// typed as a full Record so a code the bridge adds is a compile error here
// rather than an "unknown error" on screen; codes with nothing useful to say
// map to the generic message explicitly
const FA_ERROR_MESSAGE_KEYS = {
    abandonUnavailable: 'feature.wallet-service.error-abandon-unavailable',
    busy: 'feature.wallet-service.error-busy',
    capabilityUnavailable:
        'feature.wallet-service.error-capability-unavailable',
    manifoldGuardian: 'feature.wallet-service.error-fleet-manager',
    identity: 'feature.wallet-service.error-generic',
    invalidManifoldGuardians:
        'feature.wallet-service.error-invalid-fleet-managers',
    invalidIntent: 'feature.wallet-service.error-invalid-intent',
    invalidOptions: 'feature.wallet-service.error-invalid-options',
    liquidity: 'feature.wallet-service.error-liquidity',
    maintenanceConsensusInvalid:
        'feature.wallet-service.error-maintenance-invalid',
    maintenanceConsensusTooLarge:
        'feature.wallet-service.error-maintenance-too-large',
    maintenanceConvergence: 'feature.wallet-service.error-maintenance-timeout',
    maintenanceRejected: 'feature.wallet-service.error-maintenance-rejected',
    maintenanceWrongState:
        'feature.wallet-service.error-maintenance-wrong-state',
    noActiveFormation: 'feature.wallet-service.error-no-active-formation',
    payment: 'feature.wallet-service.error-payment',
    pushNotifications: 'feature.wallet-service.error-push-notifications',
    registry: 'feature.wallet-service.error-registry',
    selection: 'feature.wallet-service.error-selection',
    selectionReauthorizationRequired:
        'feature.wallet-service.error-selection-changed',
    storage: 'feature.wallet-service.error-generic',
    timeout: 'feature.wallet-service.error-timeout',
    replacementNotEligible:
        'feature.wallet-service.transfer-error-not-eligible',
} as const satisfies Record<RpcFaErrorCode, string>

// error codes are the stable bridge contract; never branch on message strings
/**
 * The message for a bridge error code.
 *
 * Codes without a designed message fall back to one catch-all rather than a
 * bespoke screen each. The fallback is wallet-service-specific: the shared
 * `errors.unknown-error` is reached from across the app, so it cannot say
 * anything about setup, and every caller of this function pairs the message
 * with the return-home exit so no error state is a dead end.
 */
export const getWalletServiceErrorKey = (
    code: RpcFaErrorCode | null | undefined,
) =>
    code && code in FA_ERROR_MESSAGE_KEYS
        ? FA_ERROR_MESSAGE_KEYS[code as keyof typeof FA_ERROR_MESSAGE_KEYS]
        : ('feature.wallet-service.error-generic' as const)

/**
 * The message for a failed federation metadata save.
 *
 * `maintenanceUnsupported` arrives as a detail on a `maintenanceRejected`
 * code: too few guardians run a release that knows the setting. The code alone
 * reads as a refusal, when what the operator needs to do is ask them to update.
 */
export const getWalletServiceMaintenanceErrorKey = (
    error: RpcFaOperationError | null | undefined,
) =>
    error?.detail?.type === 'maintenanceUnsupported'
        ? ('feature.wallet-service.error-guardians-need-update' as const)
        : getWalletServiceErrorKey(error?.code)

/**
 * The error, followed by the invitation to repeat the action that failed.
 *
 * The two are separate strings because whether the user can act is a property
 * of the screen, not of the error code. The same `manifoldGuardian` failure is
 * answerable on the confirm screen, where the pay button is still there, and
 * unanswerable on the progress screen, where the driver retries on its own and
 * there is nothing to press. One string cannot be right in both places.
 *
 * Use this wherever the failed action is still on screen. Where it is not, use
 * {@link getWalletServiceErrorKey} alone and say what happens instead.
 */
export const getWalletServiceRetryableError = (
    t: TFunction,
    code: RpcFaErrorCode | null | undefined,
) =>
    `${t(getWalletServiceErrorKey(code))} ${t(
        'feature.wallet-service.try-again-hint',
    )}`

// no selector for the guardian fee: `intent.guardianFeePpm` is the
// creation-time intent and is always 0, because the app sends no fee at
// creation and `set_guardian_fee` never writes back to the intent. Reading it
// is what made the settings row say "Not set" after a save that worked. The
// applied rate comes from federation consensus metadata — see
// `useAppliedGuardianFeePpm` in `ui/common/hooks/fa.ts`.

// the spend cap the user approved, which is what screen 04 must surface
export const selectWalletServiceMaxTotalMsats = (s: CommonState) =>
    selectFaFormation(s)?.intent.maxTotalMsats ?? null

/**
 * The federation exists, and this device has checked it at least once.
 *
 * The bridge keeps `formed` across a relaunch and reports the launch recheck
 * through `freshness` alone. A federation from a backup that this device never
 * checked waits for its first check. A save attempted mid-recheck is still
 * rejected, so screens that submit maintenance calls gate the action on
 * {@link selectIsWalletServiceMaintenanceReady} and use this only for
 * progress, routing, and settled visuals.
 */
export const selectIsWalletServiceFormed = (s: CommonState) => {
    const status = selectFaStatus(s)
    return (
        status?.type === 'formed' &&
        (status.federation.freshness === 'fresh' ||
            status.federation.backupEligible)
    )
}

/**
 * Ready for a maintenance call like `set_guardian_fee` right now.
 *
 * `formed` alone is not enough: on launch the bridge rechecks a formed service
 * and reports `unsynced` until that finishes, which is exactly the window in
 * which it rejects maintenance calls. The status stream pushes the flip to
 * `fresh`, so a gated button enables without polling or a restart.
 */
export const selectIsWalletServiceMaintenanceReady = (s: CommonState) => {
    const status = selectFaStatus(s)
    return status?.type === 'formed' && status.federation.freshness === 'fresh'
}

export type WalletServiceRecoveryStage =
    | 'found'
    | 'verifying'
    | 'rejoining'
    | 'restoringBalance'
    | 'ready'

export const WALLET_SERVICE_RECOVERY_STAGES = [
    'found',
    'verifying',
    'rejoining',
    'restoringBalance',
    'ready',
] as const satisfies readonly WalletServiceRecoveryStage[]

/**
 * The Wallet Service can be shown and acted on. Three facts from two
 * subsystems: the FA snapshot is fresh (FA/Manifold), and the federation the
 * invite resolves to is loaded and not mid-recovery (Fedimint). Every consumer
 * that used `selectIsFaRecoveryComplete` as "usable" wants this.
 *
 * This is the *exit condition of the recovery checklist*, not a display gate:
 * it waits for the FA snapshot on purpose, because the checklist claims the
 * whole service has been verified on this device. A surface that only needs
 * the wallet — balance, withdraw — wants
 * {@link selectIsWalletServiceWalletReady} instead.
 */
export const selectIsWalletServiceUsable = (
    s: CommonState,
    federationId: string | null,
) =>
    selectIsWalletServiceMaintenanceReady(s) &&
    Boolean(federationId) &&
    Boolean(selectLoadedFederation(s, federationId ?? '')) &&
    !selectIsFederationRecovering(s, federationId ?? '')

/**
 * The wallet behind the service can be read and spent from.
 *
 * Two facts, both owned by the *Fedimint federation* subsystem: the federation
 * is loaded, and it is not mid-recovery. No FA term — balance, guardian status
 * and withdraw all come from Fedimint, and a merely `unsynced` FA snapshot says
 * nothing about them. Including FA freshness here is what made a created,
 * fully-joined service show the recovery loader instead of its balance while
 * its snapshot re-reconciled at launch. FA freshness gates maintenance
 * separately, through {@link selectIsWalletServiceMaintenanceReady}, and the
 * guardian line carries its own `selectFaIsUnsynced` skeleton.
 */
export const selectIsWalletServiceWalletReady = (
    s: CommonState,
    federationId: string | null,
) =>
    Boolean(federationId) &&
    Boolean(selectLoadedFederation(s, federationId ?? '')) &&
    !selectIsFederationRecovering(s, federationId ?? '')

/** Which checklist row is live, derived on every read — never tallied. */
export const selectWalletServiceRecoveryStage = (
    s: CommonState,
    federationId: string | null,
): WalletServiceRecoveryStage => {
    if (!selectIsWalletServiceMaintenanceReady(s)) return 'verifying'
    if (!federationId || !selectLoadedFederation(s, federationId))
        return 'rejoining'
    if (selectIsFederationRecovering(s, federationId)) return 'restoringBalance'
    return 'ready'
}
