import {
    PayloadAction,
    createAsyncThunk,
    createSelector,
    createSlice,
} from '@reduxjs/toolkit'
import { TFunction } from 'i18next'

import type { CommonState } from '.'
import {
    RpcFiClientStatus,
    RpcFiEligiblePayer,
    RpcFiErrorCode,
    RpcFiFederationMetadataUpdate,
    RpcFiFormationSnapshot,
    RpcFiLiquidityOperation,
    RpcFiOperationError,
    RpcFiPlanPreference,
    RpcFiReplacementPreview,
    RpcFiSeatPhase,
    RpcFiSelectionPreview,
    RpcFiStatus,
} from '../types/bindings'
import { isDev } from '../utils/environment'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import { selectFeatureFlag } from './environment'
import { selectFederationBalance } from './federation'

const log = makeLog('common/redux/fi')

// presets only, no custom entry: `federation_size` is a plain u16 but each
// fleet manager advertises which sizes it serves, so an arbitrary number can
// only be validated by a round trip that has no "size unavailable" design
export const WALLET_SERVICE_SIZE_OPTIONS = [7, 10, 13, 16, 19]
export const RECOMMENDED_WALLET_SERVICE_SIZE = 10
export const MIN_WALLET_SERVICE_SIZE = WALLET_SERVICE_SIZE_OPTIONS[0]
export const MAX_WALLET_SERVICE_SIZE =
    WALLET_SERVICE_SIZE_OPTIONS[WALLET_SERVICE_SIZE_OPTIONS.length - 1]
// staging FMans currently advertise only 0.11.1-fedi15 — an exact-match
// version check rejects every ad if this drifts from what guardians run
export const DEFAULT_FEDIMINTD_VERSION = '0.11.1-fedi15'

/** Rejected by `guardian_fee_from_rpc` in the bridge above this value. */
export const MAX_GUARDIAN_FEE_PPM = 210_000
/** Enforced FI-side at propose time; the bridge itself has no floor check. */
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

const WALLET_SERVICE_PLAN: RpcFiPlanPreference = 'infiniteBestEffort'

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
 * un-sets `ecashSent` for the whole set, and `walletServiceCreated` also
 * requires `freshness: fresh` — which every driver run clears while it reloads
 * from the store. Painted raw, a checkmark the user has already been shown is
 * taken away again, which reads as the setup having failed.
 *
 * Keyed by `formationId`: a genuinely new formation starts from nothing, and
 * only a re-report of the same one is held up.
 */
type CreationHighWaterMark = {
    formationId: string
    stage: WalletServiceCreationStage
    isComplete: boolean
    /**
     * Whether `phase` has ever reached `formed` for this formation.
     *
     * Held apart from `isComplete`, which is the looser question: it also
     * accepts the `walletServiceCreated` milestone, and screens that only need
     * to know the work is done are right to use it.
     *
     * The bridge is stricter about what it will *accept*. `set_guardian_fee`
     * is rejected with `maintenanceWrongState` until the federation is actually
     * formed, so the fee screen has to ask the strict question — and asking it
     * of the live phase is not enough, because a driver re-run republishes the
     * snapshot as `unsynced` with the phase back at `publishingSeatBindings`.
     * Read live, that flips a settled screen back into a warning state for
     * something that has already happened.
     */
    hasFormed: boolean
}

const initialState = {
    status: null as RpcFiStatus | null,
    clientError: null as RpcFiOperationError | null,
    // process-local: the bridge re-reports the live formation on every launch,
    // so this rebuilds itself rather than needing to survive a restart
    creationHighWaterMark: null as CreationHighWaterMark | null,
    draft: {
        name: '',
        size: RECOMMENDED_WALLET_SERVICE_SIZE,
    } as WalletServiceDraft,
    // process-local: the bridge invalidates the previewId on restart, so
    // neither survives rehydration and the flow restarts from the draft
    selectionPreview: null as RpcFiSelectionPreview | null,
    // process-local for the same reason as `selectionPreview`
    replacementPreview: null as RpcFiReplacementPreview | null,
    eligiblePayers: null as RpcFiEligiblePayer[] | null,
    // held apart from `operationError`: a failed payer lookup leaves the price
    // intact and must not read as the whole quote having failed
    payerError: null as RpcFiOperationError | null,
    operationError: null as RpcFiOperationError | null,
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
        operation: null as RpcFiLiquidityOperation | null,
        hasRead: false,
        errorCode: null as RpcFiErrorCode | null,
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
}

export type FiState = typeof initialState

/** The one definition of "done", shared by the mark and the selector. */
const formationIsComplete = (formation: RpcFiFormationSnapshot) =>
    formation.phase === 'formed' || formation.milestones.walletServiceCreated

/** Raises {@link CreationHighWaterMark} to whatever the new status reports. */
function recordCreationHighWaterMark(state: FiState) {
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
        isComplete:
            formationIsComplete(formation) || Boolean(previous?.isComplete),
        hasFormed: formation.phase === 'formed' || Boolean(previous?.hasFormed),
    }
}

/*** Status logging ***/

/**
 * A wallet service has up to 19 seats and the bridge reports every one of them
 * on every update. Logged individually they bury the line that matters, so
 * seats enter the log as a count per phase.
 */
const tallySeatPhases = (seats: RpcFiFormationSnapshot['seats']) =>
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
const summarizeFiClientStatus = (status: RpcFiClientStatus) => {
    if (status.type === 'failed')
        return {
            state: 'failed' as const,
            errorCode: status.error.code,
            errorMessage: status.error.message,
        }
    if (status.status.type === 'idle') return { state: 'idle' as const }
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

export type FiClientStatusChange = {
    level: 'info' | 'warn' | 'error'
    message: string
    fields: ReturnType<typeof summarizeFiClientStatus>
}

/**
 * One line per meaningful move of the fi client, or null when the bridge has
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
export function describeFiClientStatusChange(
    previous: RpcFiClientStatus | null,
    next: RpcFiClientStatus,
): FiClientStatusChange | null {
    const fields = summarizeFiClientStatus(next)
    if (
        previous &&
        JSON.stringify(summarizeFiClientStatus(previous)) ===
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
        message: 'fi client status',
        fields,
    }
}

/**
 * Writes whatever {@link describeFiClientStatusChange} decides, and hands back
 * `next` for the caller to hold as the new previous.
 */
export function logFiClientStatusChange(
    previous: RpcFiClientStatus | null,
    next: RpcFiClientStatus,
): RpcFiClientStatus {
    const change = describeFiClientStatusChange(previous, next)
    if (change) log[change.level](change.message, change.fields)
    return next
}

/** The formation a log line belongs to, absent until one exists. */
const fiLogContext = (state: CommonState) => {
    const status = selectFiStatus(state)
    return status?.type === 'formation'
        ? { formationId: status.formation.formationId }
        : {}
}

/*** Slice definition ***/

export const fiSlice = createSlice({
    name: 'fi',
    initialState,
    reducers: {
        setFiClientStatus(state, action: PayloadAction<RpcFiClientStatus>) {
            if (action.payload.type === 'ready') {
                state.status = action.payload.status
                state.clientError = null
                recordCreationHighWaterMark(state)
            } else {
                state.clientError = action.payload.error
            }
        },
        setFiStatus(state, action: PayloadAction<RpcFiStatus>) {
            state.status = action.payload
            state.clientError = null
            recordCreationHighWaterMark(state)
        },
        setWalletServiceDraft(
            state,
            action: PayloadAction<Partial<WalletServiceDraft>>,
        ) {
            state.draft = { ...state.draft, ...action.payload }
        },
        clearFiOperationError(state) {
            state.operationError = null
        },
        /**
         * Record an operation the bridge reported.
         *
         * Ignores an operation belonging to a different formation. The durable
         * list walk filters by formation, but `fiClientLiquidityCurrent` does
         * not carry that guarantee, and a second formation reading the first
         * one's verified attach would show a provider it does not have.
         */
        setFiLiquidityOperation(
            state,
            action: PayloadAction<RpcFiLiquidityOperation>,
        ) {
            const currentFormationId =
                state.status?.type === 'formation'
                    ? state.status.formation.formationId
                    : null
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
        recordFiLiquidityAbsent(state) {
            state.liquidity.hasRead = true
        },
        setFiLiquidityRequesting(state, action: PayloadAction<boolean>) {
            state.liquidity.isRequesting = action.payload
        },
        /** Forget everything known about the previous formation's attach. */
        clearFiLiquidity(state) {
            state.liquidity.operation = null
            state.liquidity.hasRead = false
            state.liquidity.errorCode = null
            state.liquidity.isRequesting = false
        },
        setFiLiquidityError(state, action: PayloadAction<RpcFiErrorCode>) {
            state.liquidity.errorCode = action.payload
            state.liquidity.hasRead = true
            state.liquidity.isRequesting = false
        },
        clearFiLiquidityError(state) {
            state.liquidity.errorCode = null
        },
        /** A new guardian count invalidates the quoted seats and payers. */
        clearWalletServiceSelectionPreview(state) {
            state.selectionPreview = null
            state.eligiblePayers = null
            state.payerError = null
        },
    },
    extraReducers: builder => {
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
    setFiClientStatus,
    setFiStatus,
    setWalletServiceDraft,
    clearFiOperationError,
    clearWalletServiceSelectionPreview,
    setFiLiquidityOperation,
    setFiLiquidityError,
    clearFiLiquidityError,
    recordFiLiquidityAbsent,
    clearFiLiquidity,
    setFiLiquidityRequesting,
} = fiSlice.actions

/*** Async thunk actions ***/

export const refreshFiStatus = createAsyncThunk<
    void,
    { fedimint: FedimintBridge },
    { state: CommonState }
>('fi/refreshFiStatus', async ({ fedimint }, { dispatch }) => {
    const clientStatus = await fedimint.fiClientStatus()
    // no previous to compare against: a refresh runs once per subscribe, so
    // this is a deliberate one line rather than a repeat
    logFiClientStatusChange(null, clientStatus)
    dispatch(setFiClientStatus(clientStatus))
})

/**
 * The two calls answer different questions, so they fail independently.
 *
 * The preview is the price, and without it the payment screen has nothing to
 * show — a failure there rejects. The payer lookup only says which of the
 * user's wallets may pay. `fiClientEligiblePayers` returns an *error*, not an
 * empty list, when the trusted setup payment set cannot be authenticated, so
 * rejecting on it would hide the price from anyone who has joined no such
 * federation — the exact dead end this flow is meant to remove.
 */
export const prepareWalletServicePayment = createAsyncThunk<
    {
        preview: RpcFiSelectionPreview
        payers: RpcFiEligiblePayer[]
        payerError: RpcFiOperationError | null
    },
    { fedimint: FedimintBridge },
    { state: CommonState; rejectValue: RpcFiOperationError }
>(
    'fi/prepareWalletServicePayment',
    async ({ fedimint }, { getState, rejectWithValue }) => {
        const { size } = selectWalletServiceDraft(getState())
        log.info('prepareWalletServicePayment requested', {
            federationSize: size,
        })
        const [previewResult, payersResult] = await Promise.all([
            fedimint.fiClientPreviewSelection({
                federationSize: size,
                plan: WALLET_SERVICE_PLAN,
                fedimintdVersion: DEFAULT_FEDIMINTD_VERSION,
            }),
            fedimint.fiClientEligiblePayers(),
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
 * would spend `fiClientPreviewSelection` — 30-60s of real guardian dialling —
 * on a question it was not asked, and hand back a new quote nobody wanted.
 *
 * Failure is deliberately quiet. This runs on a poll rather than on a press,
 * so a failed attempt is not a user action that failed; the next attempt is
 * already coming, and the caller's existing state is still the best answer.
 */
export const refreshWalletServiceEligiblePayers = createAsyncThunk<
    { payers: RpcFiEligiblePayer[]; payerError: RpcFiOperationError | null },
    { fedimint: FedimintBridge }
>('fi/refreshWalletServiceEligiblePayers', async ({ fedimint }) => {
    const payersResult = await fedimint.fiClientEligiblePayers()
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
    { state: CommonState; rejectValue: RpcFiOperationError }
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
            ...fiLogContext(getState()),
            previewId: preview.previewId,
            federationSize: size,
            hasName: Boolean(name),
            paymentFederationId,
            totalAdvertisedMsats: preview.totalAdvertisedMsats,
        })
        // the spending limit the user approved is the advertised total;
        // quotes above it park as a reauthorization instead of paying
        const result = await fedimint.fiClientPayAndCreate(
            preview.previewId,
            {
                federationName: name || null,
                federationSize: size,
                plan: WALLET_SERVICE_PLAN,
                fedimintdVersion: DEFAULT_FEDIMINTD_VERSION,
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
    { state: CommonState; rejectValue: RpcFiOperationError }
>(
    'fi/authorizeWalletServicePayments',
    async ({ fedimint, authorizationId }, { getState, rejectWithValue }) => {
        log.info('authorizeWalletServicePayments requested', {
            ...fiLogContext(getState()),
            authorizationId,
        })
        const result =
            await fedimint.fiClientAuthorizeReplacementPayments(authorizationId)
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
    { state: CommonState; rejectValue: RpcFiOperationError }
>(
    'fi/setWalletServiceGuardianFee',
    async ({ fedimint, guardianFeePpm }, { rejectWithValue }) => {
        const result = await fedimint.fiClientSetGuardianFee(guardianFeePpm)
        if (result.type === 'error') {
            log.error('setWalletServiceGuardianFee', result.error)
            return rejectWithValue(result.error)
        }
    },
)

export const updateWalletServiceMetadata = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; update: RpcFiFederationMetadataUpdate },
    { state: CommonState; rejectValue: RpcFiOperationError }
>(
    'fi/updateWalletServiceMetadata',
    async ({ fedimint, update }, { rejectWithValue }) => {
        const result = await fedimint.fiClientUpdateFederationMetadata(update)
        if (result.type === 'error') {
            log.error('updateWalletServiceMetadata', result.error)
            return rejectWithValue(result.error)
        }
    },
)

export const previewWalletServiceReplacements = createAsyncThunk<
    RpcFiReplacementPreview,
    { fedimint: FedimintBridge },
    { state: CommonState; rejectValue: RpcFiOperationError }
>(
    'fi/previewWalletServiceReplacements',
    async ({ fedimint }, { rejectWithValue }) => {
        const result = await fedimint.fiClientPreviewReplacements()
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
        maxTotalMsats: RpcFiReplacementPreview['totalAdvertisedMsats']
    },
    { state: CommonState; rejectValue: RpcFiOperationError }
>(
    'fi/applyWalletServiceReplacements',
    async (
        { fedimint, previewId, maxTotalMsats },
        { getState, rejectWithValue },
    ) => {
        log.info('applyWalletServiceReplacements requested', {
            ...fiLogContext(getState()),
            previewId,
            maxTotalMsats,
        })
        // cap the spend at the exact total the user saw, never a fresher one
        const result = await fedimint.fiClientApplyReplacements(
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

export const resumeWalletService = createAsyncThunk<
    void,
    { fedimint: FedimintBridge },
    { state: CommonState; rejectValue: RpcFiOperationError }
>('fi/resumeWalletService', async ({ fedimint }, { rejectWithValue }) => {
    const result = await fedimint.fiClientResume()
    if (result.type === 'error') {
        log.error('resumeWalletService', result.error)
        return rejectWithValue(result.error)
    }
})

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
export const selectIsWalletServiceCreationEnabled = (s: CommonState) =>
    isDev() || Boolean(selectFeatureFlag(s, 'wallet_service_creation'))

export const selectFiStatus = (s: CommonState) => s.fi.status

export const selectFiClientError = (s: CommonState) => s.fi.clientError

export const selectFiOperationError = (s: CommonState) => s.fi.operationError

export const selectWalletServiceDraft = (s: CommonState) => s.fi.draft

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

export const selectFiFormation = (s: CommonState) =>
    s.fi.status?.type === 'formation' ? s.fi.status.formation : null

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

// stages: 1 ecash sent, 2 guardians confirmed, 3 wallet service created
//
// Reported from the high-water mark rather than the live snapshot, so a seat
// that drops out or a driver run that re-reads the store cannot rewind a
// checkmark the user has already been shown. See {@link CreationHighWaterMark}.
export const selectWalletServiceCreationProgress = createSelector(
    selectFiFormation,
    (s: CommonState) => s.fi.creationHighWaterMark,
    (
        formation,
        highWater,
    ): {
        stage: WalletServiceCreationStage
        isComplete: boolean
    } | null => {
        if (!formation) return null
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
            isComplete:
                formationIsComplete(formation) || Boolean(mark?.isComplete),
        }
    },
)

export const getWalletServiceCreationStage = (
    formation: RpcFiFormationSnapshot,
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
 * `gatewayViewVerified` — means the FI found the gateway in a fresh,
 * threshold-aggregated LNv2 view from the formed federation.
 *
 * `actionRequired` sits outside the ordered sequence deliberately: it is an
 * operator decision point, not a step on the way to `ready`, and rendering it
 * as progress would invite the automatic retry its own contract forbids.
 */
export type WalletServiceLightningStage =
    | 'requested'
    | 'allocating'
    | 'providerComplete'
    | 'verifying'
    | 'ready'
    | 'actionRequired'

/** Ordered stages a progress line walks. `actionRequired` is not among them. */
export const WALLET_SERVICE_LIGHTNING_STAGES = [
    'requested',
    'allocating',
    'providerComplete',
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

const findGatewayItem = (operation: RpcFiLiquidityOperation) =>
    (operation.itemStatuses ?? []).find(item => item.target.type === 'gateway')

/**
 * Read the stage out of a durable operation snapshot.
 *
 * Verification is the last and longest step and is the FI's own work, not the
 * provider's, so a provider that reports itself complete still leaves the user
 * waiting. Naming that separately is the point: it is where the wait actually
 * is.
 *
 * A snapshot without item statuses still has a stage — the request exists.
 * Throwing here would take the whole read down, and a caller would render that
 * as "no provider attached".
 */
export function toLightningStage(
    operation: RpcFiLiquidityOperation,
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

const selectFiLiquidity = (s: CommonState) =>
    s.fi.liquidity ?? NO_LIQUIDITY_READ

export const selectFiLiquidityOperation = createSelector(
    selectFiLiquidity,
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
    selectFiLiquidity,
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
export const selectIsFiLiquidityRequesting = createSelector(
    selectFiLiquidity,
    liquidity => liquidity.isRequesting,
)

export const selectFiLiquidityErrorCode = createSelector(
    selectFiLiquidity,
    liquidity => liquidity.errorCode,
)

export const selectWalletServiceLightningStage = createSelector(
    selectFiLiquidityOperation,
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
    selectFiStatus,
    (status): 'unknown' | 'none' | 'inProgress' | 'formed' => {
        if (!status) return 'unknown'
        if (status.type !== 'formation') return 'none'
        if (status.formation.phase === 'formed') return 'formed'
        return 'inProgress'
    },
)

// both action types carry the same requirements and are satisfied by the
// same authorize rpc, so they merge into one prompt
export const selectFiPaymentRequirements = createSelector(
    selectFiFormation,
    formation =>
        formation?.actionRequired?.type === 'authorizePayments' ||
        formation?.actionRequired?.type === 'authorizeReplacementPayments'
            ? formation.actionRequired.requirements
            : null,
)

export const selectFiReplacementRequirements = createSelector(
    selectFiFormation,
    formation =>
        formation?.actionRequired?.type === 'replaceGuardians'
            ? formation.actionRequired.requirements
            : null,
)

export const selectWalletServiceReplacementPreview = (s: CommonState) =>
    s.fi.replacementPreview

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
} as const satisfies Record<RpcFiSeatPhase, boolean>

/** Seats confirmed so far, for the stage detail's "{confirmed} of {total}". */
export const selectWalletServiceGuardianProgress = createSelector(
    selectFiFormation,
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
    const requirements = selectFiPaymentRequirements(s)
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
const TERMINAL_FI_ERROR_CODES: RpcFiErrorCode[] = [
    'invalidIntent',
    'invalidOptions',
    'abandonUnavailable',
]

export const isTerminalWalletServiceError = (
    code: RpcFiErrorCode | null | undefined,
) => (code ? TERMINAL_FI_ERROR_CODES.includes(code) : false)

export const selectFiInviteCode = (s: CommonState) =>
    selectFiFormation(s)?.inviteCode ?? null

export const selectFiFormationName = (s: CommonState) =>
    selectFiFormation(s)?.intent.federationName ?? null

export const selectFiLastErrorCode = (s: CommonState) =>
    selectFiFormation(s)?.lastError ?? null

export const selectFiIsUnsynced = (s: CommonState) =>
    selectFiFormation(s)?.freshness === 'unsynced'

// typed as a full Record so a code the bridge adds is a compile error here
// rather than an "unknown error" on screen; codes with nothing useful to say
// map to the generic message explicitly
const FI_ERROR_MESSAGE_KEYS = {
    abandonUnavailable: 'feature.wallet-service.error-abandon-unavailable',
    busy: 'feature.wallet-service.error-busy',
    capabilityUnavailable:
        'feature.wallet-service.error-capability-unavailable',
    fleetManager: 'feature.wallet-service.error-fleet-manager',
    identity: 'feature.wallet-service.error-generic',
    invalidFleetManagers: 'feature.wallet-service.error-invalid-fleet-managers',
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
} as const satisfies Record<RpcFiErrorCode, string>

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
    code: RpcFiErrorCode | null | undefined,
) =>
    code && code in FI_ERROR_MESSAGE_KEYS
        ? FI_ERROR_MESSAGE_KEYS[code as keyof typeof FI_ERROR_MESSAGE_KEYS]
        : ('feature.wallet-service.error-generic' as const)

/**
 * The error, followed by the invitation to repeat the action that failed.
 *
 * The two are separate strings because whether the user can act is a property
 * of the screen, not of the error code. The same `fleetManager` failure is
 * answerable on the confirm screen, where the pay button is still there, and
 * unanswerable on the progress screen, where the driver retries on its own and
 * there is nothing to press. One string cannot be right in both places.
 *
 * Use this wherever the failed action is still on screen. Where it is not, use
 * {@link getWalletServiceErrorKey} alone and say what happens instead.
 */
export const getWalletServiceRetryableError = (
    t: TFunction,
    code: RpcFiErrorCode | null | undefined,
) =>
    `${t(getWalletServiceErrorKey(code))} ${t(
        'feature.wallet-service.try-again-hint',
    )}`

// no selector for the guardian fee: `intent.guardianFeePpm` is the
// creation-time intent and is always 0, because the app sends no fee at
// creation and `set_guardian_fee` never writes back to the intent. Reading it
// is what made the settings row say "Not set" after a save that worked. The
// applied rate comes from federation consensus metadata — see
// `useAppliedGuardianFeePpm` in `ui/common/hooks/fi.ts`.

// the spend cap the user approved, which is what screen 04 must surface
export const selectWalletServiceMaxTotalMsats = (s: CommonState) =>
    selectFiFormation(s)?.intent.maxTotalMsats ?? null

/**
 * Formed, and staying formed.
 *
 * Reads the high-water mark rather than the live phase, so a driver re-run that
 * republishes the snapshot as `unsynced` with an earlier phase cannot take the
 * answer away again. See {@link CreationHighWaterMark.hasFormed}.
 *
 * The live phase is still the truth for the *bridge* — a save attempted during
 * such a re-run is rejected — but that rejection belongs in a toast against an
 * action the user took, not in a banner over a screen that was already settled.
 */
export const selectIsWalletServiceFormed = (s: CommonState) =>
    selectFiFormation(s)?.phase === 'formed' ||
    Boolean(s.fi.creationHighWaterMark?.hasFormed)
