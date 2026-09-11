import type { LoadedFederation, MSats } from '@fedi/common/types'
import {
    FiFederationJoinEvent,
    GuardianStatus,
    RpcFederation,
    RpcFederationPreview,
    RpcFiClientStatus,
    RpcFiEligiblePayersResult,
    RpcFiErrorCode,
    RpcFiCurrentLiquidityOperationResult,
    RpcFiFederationJoinState,
    RpcFiFormationSnapshot,
    RpcFiLiquidityDiscoveryResult,
    RpcFiLiquidityNetwork,
    RpcFiLiquidityOperation,
    RpcFiLiquidityOperationResult,
    RpcFiLiquidityProvider,
    RpcFiOperationError,
    RpcFiOperationResult,
    RpcFiReplacementPreview,
    RpcFiSelectionPreview,
    RpcFiSelectionPreviewRequest,
    RpcFiSelectionPreviewResult,
    RpcFiSetupPaymentFederationsResult,
    RpcFiStatus,
    RpcParseInviteCodeResult,
} from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'

import {
    MOCK_JOINABLE_WALLET_SERVICES,
    MOCK_PAYER_FEDERATIONS,
    type MockJoinableWalletService,
    makeMockPayerFederation,
} from './mockPayerFederation'
import { FORMATION_PHASES, FormationPhaseName } from './status'
import type { FiWalletServiceJoin } from './steps'
import { FiPayerSource } from './switches'
import type { FiWorld } from './world'

const log = makeLog('native/devtools/fi/simulator')

/** Ceiling enforced by `guardian_fee_from_rpc` in the Rust bridge. */
const MAX_GUARDIAN_FEE_PPM = 210_000

const SATS_TO_MSATS = 1_000

const DEFAULT_SEAT_PRICE_MSATS = 2_100_000
const DEFAULT_ELIGIBLE_FMANS = 30
const DEFAULT_SEEN_FMANS = 42
const DEFAULT_PREVIEW_VALIDITY_SECS = 120

/**
 * Status reads before the gateway view is reported verified. Counted in reads
 * rather than timed, so the wait is the same however fast the device is.
 */
const LIQUIDITY_VERIFY_AFTER_POLLS = 2

/**
 * Where `propose_guardian_fees` publishes the applied rate. Mirrors
 * `GUARDIAN_FEE_SEND_PPM_META_KEY` in `hooks/fi.ts`, which reads it back from
 * `federationPreview`; the simulator publishes it the same way so the fee step
 * and the settings row agree once a fee is set.
 */
const GUARDIAN_FEE_SEND_PPM_META_KEY = 'fedi:guardian_fee_send_ppm'

/**
 * Delivers one `streamUpdate` to the bridge, which routes it to the handler
 * `rpcStream` registered for this id. Sequence numbers start at 0 and must not
 * skip, or the bridge logs a mismatch.
 */
type StreamEmitter = (update: {
    stream_id: number
    sequence: number
    // the real bridge streams the same envelope `fiClientStatus` returns,
    // and `setFiClientStatus` only reads `status` from a `ready` envelope
    data: RpcFiClientStatus
}) => void

/**
 * Delivers a bridge event to the app, the way the native event emitter does.
 * Used for the money rails, which are events rather than RPC replies.
 */
type EventEmitter = (event: string, payload: unknown) => void

/** A deposit invoice handed out against a mock wallet, not yet settled. */
type PendingDeposit = { federationId: string; amountMsats: number }

const nowSecs = () => Math.floor(Date.now() / 1000)

const error = (
    code: RpcFiErrorCode,
    message: string,
    detail: RpcFiOperationError['detail'] = null,
): RpcFiOperationError => ({ code, message, detail })

/**
 * Seat prices are deliberately non-uniform — the contract makes no uniformity
 * promise and `Guardian details` has to render real per-seat variance. The
 * offsets cancel in pairs so the total still lands on `count * base`, which is
 * what the design references quote.
 */
const seatPriceMsats = (index: number, count: number, base: number): number => {
    const isLastOfOddSet = index === count - 1 && count % 2 === 1
    if (isLastOfOddSet) return base
    const offset = 50 * SATS_TO_MSATS
    return index % 2 === 0 ? base + offset : base - offset
}

const FMAN_ADJECTIVES = [
    'amber',
    'brisk',
    'candid',
    'dapper',
    'eager',
    'frugal',
    'genial',
    'humble',
] as const
const FMAN_NOUNS = [
    'alder',
    'basalt',
    'cormorant',
    'dovetail',
    'ember',
    'fathom',
    'granite',
    'harbour',
] as const

/**
 * Two-word display name for an FMan.
 *
 * The bridge derives the name from `fman_id` and treats it as decoration: names
 * can collide and never substitute for the id. Deriving it here the same way
 * names the same seat the same way on every run, and keeps collisions possible
 * rather than papering over them.
 */
const fmanNameFor = (fmanId: string): string => {
    const digest = Array.from(fmanId).reduce(
        (acc, char) => (acc * 33 + char.charCodeAt(0)) >>> 0,
        5381,
    )
    const adjective = FMAN_ADJECTIVES[digest % FMAN_ADJECTIVES.length]
    const noun = FMAN_NOUNS[(digest >>> 8) % FMAN_NOUNS.length]
    return `${adjective} ${noun}`
}

/**
 * In-memory stand-in for the FI half of the bridge.
 *
 * Holds the same state the real client holds and nothing more, so screens and
 * redux cannot tell the two apart. Everything it returns is typed through the
 * generated bindings, so a Rust change that regenerates `bindings.ts` breaks
 * this file at compile time rather than at runtime on a device.
 */
export class FiSimulator implements FiWorld {
    private stubs = new Map<
        string,
        (payload: Record<string, unknown>) => unknown
    >()
    /*** World: values the default answers read, which a script may set ***/
    private seatPriceMsats = DEFAULT_SEAT_PRICE_MSATS
    private fleet = {
        eligible: DEFAULT_ELIGIBLE_FMANS,
        seen: DEFAULT_SEEN_FMANS,
    }
    private previewValiditySecs = DEFAULT_PREVIEW_VALIDITY_SECS
    private joinableWalletServices: MockJoinableWalletService[] =
        MOCK_JOINABLE_WALLET_SERVICES
    private liquidityNetwork: RpcFiLiquidityNetwork = 'signet'
    private status: RpcFiStatus = { type: 'idle' }
    private previews = new Map<string, RpcFiSelectionPreview>()
    private replacementPreviewId: string | null = null
    private streamIds = new Set<number>()
    private sequences = new Map<number, number>()
    private emitStream: StreamEmitter | null = null
    private eventEmitter: EventEmitter | null = null
    private pendingDeposits = new Map<string, PendingDeposit>()
    private joinedFederationIds: string[] = []
    /** Ids admitted via `observeJoinedFederation`, kept across `observeFederations` refreshes. */
    private simulatorJoinedIds = new Set<string>()
    /** The balance each joined federation last reported through `listFederations`. */
    private observedBalances = new Map<string, MSats>()
    private payerSource: FiPayerSource = 'mock'
    private mockPayers: Array<{
        federationId: string
        balanceSats: number
        name?: string
    }> = []
    /**
     * The formed wallet service's own federation, once formation reaches
     * `formed`. The real bridge auto-joins it at that point; nothing in dev
     * can, so the simulator stands it up and announces it the same way.
     */
    private walletServiceFederation: LoadedFederation | null = null
    /**
     * Whether that federation has been joined yet.
     *
     * Both paths know the federation before it is joined — the invite resolves
     * offline — and the app must not see it in its wallet list until the join
     * lands. The bridge runs the same auto-join for a created federation as for
     * a restored one, so the created path waits here too.
     */
    private isWalletServiceJoined = false
    /**
     * Whether that federation is still recovering its ecash.
     *
     * A restored seed joins a federation it has spent from before, so the
     * bridge lists it with `recovering` true until the recovery finishes. The
     * recovery checklist reads exactly that flag for its `restoringBalance`
     * row. A created federation has nothing to recover.
     */
    private isWalletServiceRecovering = false
    /**
     * The last auto-join state reported, mirroring `FiFederationJoinReport`.
     *
     * The app can read the FI client status after the join event was already
     * delivered — a fresh subscribe, a foreground refresh — so the status
     * handler re-delivers this rather than leaving the app with nothing.
     */
    private lastJoinEvent: FiFederationJoinEvent | null = null
    /**
     * The federation a deliberate leave has suppressed the auto-join for,
     * mirroring the bridge's completion marker, which is keyed by federation
     * id. An absent federation that was left on purpose is silence, not a
     * failure; a later formation gets a new id and is not suppressed.
     */
    private suppressedAutoJoinFederationId: string | null = null
    private nextId = 1
    /** The single live liquidity operation, if one exists. */
    private liquidityOperation: RpcFiLiquidityOperation | null = null
    /** Status reads so far, which is what advances the verification. */
    private liquidityPolls = 0
    private replies = new Map<string, unknown>()
    private rpcWaiters = new Map<
        string,
        Array<(payload: Record<string, unknown>) => void>
    >()

    constructor() {
        this.setPayerSource(this.payerSource)
    }

    /**
     * Wire the simulator to the bridge that will deliver its events.
     *
     * `emitStream` carries the FI status stream; `emitEvent` carries the
     * `balance` and `transaction` events the simulated money rails produce, and
     * is optional because only the top-up path needs them.
     */
    attach(emitStream: StreamEmitter, emitEvent?: EventEmitter) {
        this.emitStream = emitStream
        this.eventEmitter = emitEvent ?? null
    }

    /**
     * Choose where the setup payers come from.
     *
     * Re-choosing `mock` reseeds the story 04 set at its full balance, which is
     * how a run that spent from it is refunded.
     */
    setPayerSource(source: FiPayerSource) {
        this.payerSource = source
        this.clearMockPayers()
        if (source === 'mock')
            MOCK_PAYER_FEDERATIONS.forEach(mock =>
                this.addMockPayer(mock.id, mock.balanceSats, mock.name),
            )
    }

    getPayerSource(): FiPayerSource {
        return this.payerSource
    }

    /**
     * Forget everything the dev screen ever seeded: mock payers, mock joined
     * services, the formed wallet service and the formation itself.
     *
     * Redux still holds the announced wallets until the caller drops them;
     * `listMockFederations` is the list to drop. The ids observed from the
     * real `listFederations` are kept, so real wallets stay admitted.
     */
    clearSimulatedState() {
        this.mockPayers = []
        this.reset()
    }

    /*** Scripting host ***/

    setStatus(status: RpcFiStatus) {
        this.status = status
        this.publish()
    }

    setReply(method: string, value: unknown) {
        this.replies.set(method, value)
    }

    onRpc(method: string): Promise<Record<string, unknown>> {
        return new Promise(resolve => {
            const waiters = this.rpcWaiters.get(method) ?? []
            waiters.push(resolve)
            this.rpcWaiters.set(method, waiters)
        })
    }

    formWalletService(join: FiWalletServiceJoin) {
        this.ensureWalletServiceFederation()
        switch (join) {
            case 'ready':
                return this.completeWalletServiceJoin()
            case 'recovering':
                return this.beginWalletServiceRecovery()
            case 'joining':
                return this.emitFederationJoin({ type: 'joining' })
            case 'failed':
                return this.emitFederationJoin({
                    type: 'failed',
                    message: 'simulated: federation join failed',
                })
        }
    }

    /**
     * The wallet service's federation for the current status, created once.
     * A formation names it by intent; a restored backup already carries its
     * invite and, once reconciled, its name.
     */
    private ensureWalletServiceFederation() {
        const status = this.status
        if (status.type === 'idle')
            throw new Error(
                'formWalletService needs a formation or restored status',
            )
        const id = `mock-wallet-service-${status.formation.formationId}`
        if (this.walletServiceFederation?.id === id) return
        if (status.type === 'formation') {
            this.createWalletServiceFederation(status.formation)
            return
        }
        this.walletServiceFederation = {
            ...makeMockPayerFederation({
                id,
                name: status.formation.federationName ?? 'My Wallet Service',
                balanceSats: 21_000,
            }),
            network: 'signet',
            inviteCode: status.formation.federationInvite,
        }
        this.isWalletServiceJoined = false
    }

    nextFormationId(): string {
        return `formation_${this.nextId++}`
    }

    emitEvent(event: string, payload: unknown) {
        this.eventEmitter?.(event, payload)
    }

    get world(): FiWorld {
        return this
    }

    setStub(
        method: string,
        handler: (payload: Record<string, unknown>) => unknown,
    ) {
        this.stubs.set(method, handler)
    }

    setSeatPriceMsats(msats: number) {
        this.seatPriceMsats = msats
    }

    setFleet(fleet: { eligible: number; seen: number }) {
        this.fleet = fleet
    }

    setPreviewValiditySecs(secs: number) {
        this.previewValiditySecs = secs
    }

    setJoinableWalletServices(services: MockJoinableWalletService[]) {
        this.joinableWalletServices = services
    }

    setLiquidityNetwork(network: RpcFiLiquidityNetwork) {
        this.liquidityNetwork = network
    }

    startLiquidity({ verified }: { verified: boolean }) {
        this.liquidityPolls = 0
        this.liquidityOperation = this.makeLiquidityOperation(verified)
    }

    currentLiquidityOperation(): RpcFiLiquidityOperation | null {
        return this.liquidityOperation
    }

    eligiblePayerIds(): string[] {
        const result = this.eligiblePayers()
        return result.type === 'payers'
            ? result.payers.map(p => p.federationId)
            : []
    }

    private isWalletServiceAutoJoinSuppressed(): boolean {
        return (
            this.walletServiceFederation !== null &&
            this.suppressedAutoJoinFederationId ===
                this.walletServiceFederation.id
        )
    }

    /**
     * The `fiFederationJoin` event, on the same channel the `federation` event
     * uses. Without it the app never learns a rejoin failed, and the terminal
     * failure screen cannot be reached in dev.
     *
     * Retained as well as delivered, because the bridge retains it: a status
     * read that happens after the event was delivered re-delivers it.
     */
    private emitFederationJoin(state: RpcFiFederationJoinState) {
        if (
            !this.walletServiceFederation ||
            this.isWalletServiceAutoJoinSuppressed()
        )
            return
        const event: FiFederationJoinEvent = {
            federationId: this.walletServiceFederation.id,
            state,
        }
        this.lastJoinEvent = event
        this.eventEmitter?.('fiFederationJoin', event)
    }

    /** Return to a pristine `idle` client. */
    reset() {
        this.stubs.clear()
        this.seatPriceMsats = DEFAULT_SEAT_PRICE_MSATS
        this.fleet = {
            eligible: DEFAULT_ELIGIBLE_FMANS,
            seen: DEFAULT_SEEN_FMANS,
        }
        this.previewValiditySecs = DEFAULT_PREVIEW_VALIDITY_SECS
        this.joinableWalletServices = MOCK_JOINABLE_WALLET_SERVICES
        this.liquidityNetwork = 'signet'
        this.previews.clear()
        this.pendingDeposits.clear()
        this.liquidityOperation = null
        this.liquidityPolls = 0
        this.walletServiceFederation = null
        this.isWalletServiceJoined = false
        this.isWalletServiceRecovering = false
        this.lastJoinEvent = null
        this.suppressedAutoJoinFederationId = null
        this.replies.clear()
        this.rpcWaiters.clear()
        this.simulatorJoinedIds.clear()
        this.status = { type: 'idle' }
        this.publish()
    }

    /**
     * True when this method belongs to the FI surface the simulator owns.
     *
     * `streamCancel` is shared with every other stream in the app, so it only
     * counts as ours when the id is one we handed out.
     *
     * The money rails are shared with the whole app, so they only count as ours
     * when the wallet named is one the simulator invented: a mock payer has no
     * bridge state, so a real `generateInvoice` against it fails.
     */
    handles(method: string, payload: Record<string, unknown>): boolean {
        if (method === 'streamCancel')
            return this.streamIds.has(payload.streamId as number)
        if (method === 'generateInvoice')
            return this.isMockPayer(payload.federationId as string)
        // paying is ours when the invoice is one we issued, whoever is paying
        if (method === 'payInvoice')
            return (
                this.pendingDeposits.has(payload.invoice as string) ||
                this.isMockPayer(payload.federationId as string)
            )
        // the join branch resolves each trusted invite through a preview and
        // then a join; a mock invite reaching the real bridge is rejected and
        // the candidate filtered out, which kept frames A1-A4 unreachable
        if (method === 'joinFederation')
            return Boolean(this.mockJoinableFor(payload.inviteCode as string))
        // the formed wallet service's invite code is invented, so the real
        // bridge rejects it: the fee, settings and Lightning steps all resolve
        // the federation through these and stall without them
        if (method === 'federationPreview')
            return (
                Boolean(this.mockJoinableFor(payload.inviteCode as string)) ||
                this.isWalletServiceInvite(payload.inviteCode as string)
            )
        if (method === 'parseInviteCode')
            return this.isWalletServiceInvite(payload.inviteCode as string)
        // the join thunk resolves a status for the new wallet through this,
        // and a mock id reaching the real bridge fails the whole join
        if (method === 'getGuardianStatus')
            return (
                this.isMockPayer(payload.federationId as string) ||
                this.isWalletServiceFederation(payload.federationId as string)
            )
        // leaving a wallet the simulator invented cannot reach the real bridge,
        // which has never heard of it; and the retained join state has to go
        // with it, or every later status read re-announces a join that is gone
        if (method === 'leaveFederation')
            return (
                this.isMockPayer(payload.federationId as string) ||
                this.isWalletServiceFederation(payload.federationId as string)
            )
        // This developer action must reach the real bridge so it can write the
        // startup marker outside the simulated FI state.
        return (
            method !== 'fiClientScheduleReset' && method.startsWith('fiClient')
        )
    }

    async handle(method: string, payload: Record<string, unknown>) {
        log.debug('simulated fi rpc', method)
        const waiters = this.rpcWaiters.get(method)
        if (waiters?.length) {
            this.rpcWaiters.delete(method)
            waiters.forEach(resolve => resolve(payload))
        }
        if (this.replies.has(method)) {
            const value = this.replies.get(method)
            this.replies.delete(method)
            return value
        }
        const stub = this.stubs.get(method)
        if (stub) return stub(payload)
        return this.defaultHandle(method, payload)
    }

    async defaultHandle(method: string, payload: Record<string, unknown>) {
        switch (method) {
            case 'generateInvoice':
                return this.generateInvoice(payload)
            case 'payInvoice':
                return this.payInvoice(payload)
            case 'federationPreview':
                return this.isWalletServiceInvite(payload.inviteCode as string)
                    ? this.walletServicePreview()
                    : this.mockFederationPreview(payload)
            case 'parseInviteCode':
                return this.parseWalletServiceInvite()
            case 'joinFederation':
                return this.joinMockFederation(payload)
            case 'getGuardianStatus':
                return this.guardianStatus(payload.federationId as string)
            case 'leaveFederation':
                return this.leaveFederation(payload.federationId as string)
            case 'streamCancel':
                return this.unsubscribe(payload.streamId as number)
            case 'fiClientStatus':
                return this.clientStatus()
            case 'fiClientSubscribe':
                return this.subscribe(payload.streamId as number)
            case 'fiClientEligiblePayers':
                return this.eligiblePayers()
            case 'fiClientSetupPaymentFederations':
                return this.setupPaymentFederations()
            case 'fiClientPreviewSelection':
                return this.previewSelection(
                    payload.request as RpcFiSelectionPreviewRequest,
                )
            case 'fiClientPayAndCreate':
                return this.payAndCreate(payload)
            case 'fiClientResume':
                return this.resume()
            case 'fiClientAbandon':
                return this.abandon()
            case 'fiClientAuthorizeReplacementPayments':
                return this.authorizePayments(payload.authorizationId as string)
            case 'fiClientPreviewReplacements':
                return this.previewReplacements()
            case 'fiClientApplyReplacements':
                return this.applyReplacements(payload.previewId as string)
            case 'fiClientSetGuardianFee':
                return this.setGuardianFee(payload.guardianFeePpm as number)
            case 'fiClientUpdateFederationMetadata':
                return this.updateMetadata()
            case 'fiClientLiquidityDiscover':
                return this.liquidityDiscover(
                    payload.network as RpcFiLiquidityNetwork,
                )
            case 'fiClientLiquidityStart':
                return this.liquidityStart()
            case 'fiClientLiquidityResume':
                return this.liquidityResume()
            case 'fiClientLiquidityStatus':
                return this.liquidityStatus()
            case 'fiClientLiquidityCurrent':
                return this.liquidityCurrent()
            default:
                return this.unsupported(method)
        }
    }

    /*** Queries ***/

    private clientStatus(): RpcFiClientStatus {
        // mirrors `Bridge::fi_client_status`: a status read can happen after
        // the join event was already delivered, so the retained state rides
        // along with it. A formed wallet service seeded before the bridge was
        // attached has no other way to report its join at all.
        if (this.lastJoinEvent)
            this.eventEmitter?.('fiFederationJoin', this.lastJoinEvent)
        return { type: 'ready', status: this.status }
    }

    /**
     * Record the federations the app has actually joined.
     *
     * The payer picker can only offer a wallet the app holds, so invented ids
     * would leave every run stuck on "no wallet can pay". The transport
     * snoops `listFederations` and feeds the real ids and balances in here,
     * which is what the `real` payer source reports.
     *
     * Real ids replace the previous set wholesale, but ids admitted via
     * `observeJoinedFederation` are retained even when absent from this
     * reply — the bridge hasn't caught up to a wallet the simulator just
     * joined mid-flow.
     */
    observeFederations(federations: Array<{ id: string; balance: MSats }>) {
        const federationIds = federations.map(f => f.id)
        federations.forEach(f => this.observedBalances.set(f.id, f.balance))
        this.joinedFederationIds = [
            ...federationIds,
            ...Array.from(this.simulatorJoinedIds).filter(
                id => !federationIds.includes(id),
            ),
        ]
        // a seeded formation can park an authorization before the app's real
        // wallets are known; re-point it at a wallet the app actually holds so
        // the approve prompt's live balance gate has something real to read
        const formation = this.currentFormation()
        const required = formation?.actionRequired
        const realId = federationIds[0]
        if (
            formation &&
            realId &&
            required &&
            required.type !== 'replaceGuardians' &&
            required.requirements.seats.some(
                seat => !federationIds.includes(seat.paymentFederationId),
            )
        ) {
            required.requirements.seats = required.requirements.seats.map(
                seat => ({ ...seat, paymentFederationId: realId }),
            )
            this.publish()
        }
    }

    /**
     * Learn about a join as it happens.
     *
     * `observeFederations` only refreshes on `listFederations`, and the join
     * flow asks whether the new wallet can pay for setup before that call has
     * landed — so without this the answer is always "no" and the flow cannot
     * leave the join card.
     */
    observeJoinedFederation(federationId: string) {
        this.simulatorJoinedIds.add(federationId)
        if (this.joinedFederationIds.includes(federationId)) return
        this.joinedFederationIds = [...this.joinedFederationIds, federationId]
    }

    /**
     * Admit a federation the real bridge has never heard of, at a fixed balance.
     *
     * `observeFederations` replaces its list wholesale from `listFederations`,
     * so a wallet that only exists in redux would be dropped on the next call
     * and the payer picker would filter it out again. Mock payers are held
     * apart and survive that.
     *
     * The balance rides along with the call, so seeding a payer set does not
     * disturb the rest of the world the flow is being tested under.
     */
    addMockPayer(federationId: string, balanceSats: number, name?: string) {
        const existing = this.mockPayers.find(
            p => p.federationId === federationId,
        )
        if (existing) {
            existing.balanceSats = balanceSats
            this.emitBalance(federationId)
            return
        }
        this.mockPayers.push({ federationId, balanceSats, name })
        // announce it the way the bridge announces a join, so redux holds the
        // wallet before the next `listFederations` refresh rides it along
        this.eventEmitter?.(
            'federation',
            makeMockPayerFederation({
                id: federationId,
                name: this.mockPayerName(federationId, name),
                balanceSats,
            }),
        )
    }

    private mockPayerName(federationId: string, name?: string): string {
        return (
            name ??
            MOCK_PAYER_FEDERATIONS.find(m => m.id === federationId)?.name ??
            federationId
        )
    }

    /** Drop every mock payer, leaving only the wallets the app really holds. */
    clearMockPayers() {
        this.mockPayers = []
    }

    /**
     * The mock payers as redux-shaped wallets, to be appended to a real
     * `listFederations`.
     *
     * Seeding them into redux directly is not enough: the next wholesale
     * refresh replaces the wallet list from the bridge and drops them again,
     * which left the payer picker and the top-up From list back to whatever
     * dev happened to have joined.
     */
    listMockFederations(): LoadedFederation[] {
        const payers = this.mockPayers.map(payer =>
            makeMockPayerFederation({
                id: payer.federationId,
                name: this.mockPayerName(payer.federationId, payer.name),
                balanceSats: payer.balanceSats,
            }),
        )
        // only once joined: both paths know the federation before the join
        // lands, and listing it then would report the rejoin as already done
        const walletService = this.walletServiceListing()
        return walletService ? [...payers, walletService] : payers
    }

    private mockJoinableFor(inviteCode: string | undefined) {
        return (
            this.joinableWalletServices.find(
                s => s.inviteCode === inviteCode,
            ) ?? null
        )
    }

    /*** The join branch, for mock trusted services only ***/

    private mockFederationPreview(
        payload: Record<string, unknown>,
    ): RpcFederationPreview {
        // `handles` admitted the code, so the lookup cannot miss
        const service = this.mockJoinableFor(payload.inviteCode as string)
        if (!service) throw new Error('not a mock joinable service')
        return {
            id: service.id,
            name: service.name,
            meta: { welcome_message: service.welcomeMessage },
            inviteCode: service.inviteCode,
            returningMemberStatus: { type: 'newMember' },
        }
    }

    /**
     * Join a mock trusted service: it becomes a zero-balance mock wallet, so
     * `listFederations` keeps it, the payer lookup admits it and the top-up
     * rails can fund it.
     */
    private joinMockFederation(
        payload: Record<string, unknown>,
    ): RpcFederation {
        const service = this.mockJoinableFor(payload.inviteCode as string)
        if (!service) throw new Error('not a mock joinable service')
        this.addMockPayer(service.id, 0, service.name)
        this.observeJoinedFederation(service.id)
        const federation = makeMockPayerFederation({
            id: service.id,
            name: service.name,
            balanceSats: 0,
        })
        // the real bridge announces a join with a `federation` event, and the
        // redux listener is what puts the wallet into the store — the join
        // thunk then reads it back from there, so without this the join
        // "fails" after succeeding
        this.eventEmitter?.('federation', federation)
        // Federation is the ready arm of RpcFederationMaybeLoading, which is
        // what the join rpc's consumers actually read
        return federation as unknown as RpcFederation
    }

    /**
     * Leave a simulated federation, the way `Bridge::leave_federation` does.
     *
     * The auto-join is suppressed and the retained report cleared under the
     * same lock, so an auto-join still in flight says nothing more about this
     * federation: an absent federation that was left on purpose is silence,
     * never a `failed`. The invite still resolves, because the FI status still
     * holds it and `parseInviteCode` answers offline.
     */
    private leaveFederation(federationId: string): null {
        if (this.isWalletServiceFederation(federationId)) {
            this.suppressedAutoJoinFederationId = federationId
            this.isWalletServiceJoined = false
            this.isWalletServiceRecovering = false
        }
        this.mockPayers = this.mockPayers.filter(
            payer => payer.federationId !== federationId,
        )
        if (this.lastJoinEvent?.federationId === federationId)
            this.lastJoinEvent = null
        return null
    }

    private isMockPayer(federationId: string | undefined): boolean {
        return this.mockPayers.some(p => p.federationId === federationId)
    }

    /*** The formed wallet service's own federation ***/

    private isWalletServiceInvite(inviteCode: string | undefined): boolean {
        return this.walletServiceFederation?.inviteCode === inviteCode
    }

    private isWalletServiceFederation(
        federationId: string | undefined,
    ): boolean {
        return this.walletServiceFederation?.id === federationId
    }

    /**
     * Stand the formed federation up and start the auto-join the bridge runs
     * when the wallet service reaches `formed`.
     *
     * `formed_federation_invite` yields the invite for a `formation` status as
     * well as a `restored` one, so the created path reports the same join
     * states as the restore path. A created federation has no ecash to recover,
     * so it goes straight from `joining` to `ready`.
     *
     * `alreadyJoined` is the seeded-`formed` case: it stands for a session that
     * joined this federation long ago, which the bridge finds already `Ready`
     * and reports as such, without a `joining` it never performed.
     *
     * On `signet`, because that is the network a dev federation actually runs
     * on and the network the simulated provider advertises by default: the
     * Lightning step filters providers against the federation's own network,
     * and a federation the app cannot see has no network at all.
     */
    private createWalletServiceFederation(formation: RpcFiFormationSnapshot) {
        formation.milestones.walletServiceCreated = true
        formation.inviteCode = `fed1${'sim'.padEnd(40, '0')}${formation.formationId}`
        this.walletServiceFederation = {
            ...makeMockPayerFederation({
                id: `mock-wallet-service-${formation.formationId}`,
                name: formation.intent.federationName,
                balanceSats: 0,
            }),
            network: 'signet',
            inviteCode: formation.inviteCode,
        }
        this.isWalletServiceJoined = false
    }

    /**
     * The join landed on a restored seed, and the ecash recovery it started has
     * not finished.
     *
     * The bridge lists a federation in that state with `recovering` true and
     * reports `recovering` for the whole window. Collapsing it into `ready`
     * skips the recovery checklist's `restoringBalance` row.
     */
    private beginWalletServiceRecovery() {
        if (
            !this.walletServiceFederation ||
            this.isWalletServiceAutoJoinSuppressed()
        )
            return
        this.isWalletServiceJoined = true
        this.isWalletServiceRecovering = true
        this.eventEmitter?.('federation', this.walletServiceListing())
        this.emitFederationJoin({ type: 'recovering' })
    }

    /**
     * The join has landed and nothing is left to recover: list the federation
     * and report `ready`.
     *
     * `ready` is the bridge's word for "joined and past the checks that can
     * still make it leave again", so it is emitted straight after the
     * federation rather than before it.
     */
    private completeWalletServiceJoin() {
        if (
            !this.walletServiceFederation ||
            this.isWalletServiceAutoJoinSuppressed()
        )
            return
        this.isWalletServiceJoined = true
        this.isWalletServiceRecovering = false
        this.eventEmitter?.('federation', this.walletServiceListing())
        this.emitFederationJoin({ type: 'ready' })
    }

    /**
     * The wallet service's federation as the wallet list carries it right now,
     * or null while it is not joined.
     */
    private walletServiceListing(): LoadedFederation | null {
        const federation = this.walletServiceFederation
        if (!federation || !this.isWalletServiceJoined) return null
        return { ...federation, recovering: this.isWalletServiceRecovering }
    }

    private parseWalletServiceInvite(): RpcParseInviteCodeResult {
        // `handles` admitted the code, so the federation cannot be missing
        if (!this.walletServiceFederation)
            throw new Error('no formed wallet service')
        return { federationId: this.walletServiceFederation.id }
    }

    /**
     * What `federationPreview` returns for the wallet service: its consensus
     * metadata, which is where the applied guardian fee is read back from
     * after the fee step saves it.
     */
    private walletServicePreview(): RpcFederationPreview {
        const federation = this.walletServiceFederation
        if (!federation) throw new Error('no formed wallet service')
        return {
            id: federation.id,
            name: federation.name,
            meta: { ...federation.meta },
            inviteCode: federation.inviteCode,
            returningMemberStatus: { type: 'newMember' },
        }
    }

    private guardianStatus(federationId: string): GuardianStatus[] {
        // a formed wallet service is never held without its formation
        const formation = this.currentFormation()
        if (this.isWalletServiceFederation(federationId) && formation)
            // every seat healthy, so the dashboard's guardian row is honest
            // about a formation that reached `formed`
            return formation.seats.map(seat => ({
                online: {
                    guardian:
                        seat.fmanName ?? seat.fmanId ?? `seat ${seat.index}`,
                    latency_ms: 1,
                },
            }))
        // one healthy guardian is all the status coercion needs
        return [{ online: { guardian: 'sim', latency_ms: 1 } }]
    }

    /*** Money rails, for mock payers only ***/

    /**
     * A deposit invoice against a wallet the real bridge has never heard of.
     *
     * Without this the top-up sheet dies on its first step whenever the payer
     * is a mock one, which is every wallet dev cannot really join.
     */
    private generateInvoice(payload: Record<string, unknown>): string {
        const invoice = `lnbcsim${this.nextId++}`
        this.pendingDeposits.set(invoice, {
            federationId: payload.federationId as string,
            amountMsats: Number(payload.amount),
        })
        return invoice
    }

    /**
     * Move sats between two mock wallets, then tell the app the way the bridge
     * would: a claimed `lnReceive` naming the invoice, which is what the sheet
     * and the confirm screen are actually listening for.
     */
    private async payInvoice(payload: Record<string, unknown>) {
        const invoice = payload.invoice as string
        const deposit = this.pendingDeposits.get(invoice)
        if (!deposit) {
            // a mock wallet cannot pay a real federation's invoice: it has no
            // ecash and the real bridge has never heard of it
            throw new Error(
                'The simulator can only pay invoices it issued. Top up a mock wallet from another mock wallet, or use two real dev federations.',
            )
        }
        // long enough that the "Moving funds…" state is visible rather than a
        // flicker, short enough not to feel broken
        await delay(600)
        this.pendingDeposits.delete(invoice)
        this.debitMockPayer(payload.federationId as string, deposit.amountMsats)
        this.settleDeposit(invoice, deposit)
        return { preimage: `preimage_${this.nextId++}` }
    }

    /**
     * Settle a deposit nothing in the app paid, for the external-deposit path.
     * Driven from Dev Settings, where it stands in for the tester's own wallet.
     */
    settleOpenDeposits() {
        const open = Array.from(this.pendingDeposits.entries())
        this.pendingDeposits.clear()
        open.forEach(([invoice, deposit]) =>
            this.settleDeposit(invoice, deposit),
        )
    }

    /**
     * Credit the destination and tell the app the way the bridge would: a
     * `balance` event, which is what unlocks the pay button, and a claimed
     * `lnReceive` naming the invoice, which is what closes the top-up sheet.
     */
    private settleDeposit(invoice: string, deposit: PendingDeposit) {
        const payer = this.mockPayers.find(
            p => p.federationId === deposit.federationId,
        )
        if (payer)
            payer.balanceSats += Math.round(deposit.amountMsats / SATS_TO_MSATS)
        this.emitBalance(deposit.federationId)
        this.eventEmitter?.('transaction', {
            federationId: deposit.federationId,
            transaction: {
                id: `txn_sim_${this.nextId++}`,
                kind: 'lnReceive',
                ln_invoice: invoice,
                amount: deposit.amountMsats,
                state: { type: 'claimed' },
                outcomeTime: nowSecs(),
            },
        })
    }

    private debitMockPayer(federationId: string, amountMsats: number) {
        const payer = this.mockPayers.find(p => p.federationId === federationId)
        if (!payer) return
        payer.balanceSats = Math.max(
            0,
            payer.balanceSats - Math.round(amountMsats / SATS_TO_MSATS),
        )
        this.emitBalance(federationId)
    }

    private emitBalance(federationId: string) {
        const payer = this.mockPayers.find(p => p.federationId === federationId)
        if (!payer) return
        this.eventEmitter?.('balance', {
            federationId,
            balance: payer.balanceSats * SATS_TO_MSATS,
        })
    }

    private eligiblePayers(): RpcFiEligiblePayersResult {
        if (this.payerSource === 'none') return { type: 'payers', payers: [] }
        if (this.payerSource === 'mock')
            return {
                type: 'payers',
                payers: this.mockPayers.map(p => ({
                    federationId: p.federationId,
                    balanceMsats: String(p.balanceSats * SATS_TO_MSATS),
                })),
            }
        // real: every wallet the app holds, at the balance it last reported;
        // a wallet joined this session has not reported one yet
        return {
            type: 'payers',
            payers: this.joinedFederationIds.map(federationId => ({
                federationId,
                balanceMsats: String(
                    this.observedBalances.get(federationId) ?? 0,
                ),
            })),
        }
    }

    /**
     * The authenticated setup-payment set, joined and unjoined together.
     *
     * Mirrors the bridge: the joined part is whatever the session already
     * holds, and the unjoined part is what may be offered as a join. Once a
     * mock service is joined it moves sides rather than leaving the set, which
     * is what stops the join sheet re-offering a federation the user is in.
     */
    private setupPaymentFederations(): RpcFiSetupPaymentFederationsResult {
        const payerMembers = [
            ...this.mockPayers.map(p => p.federationId),
            ...this.joinedFederationIds,
        ]
        const members = [
            ...Array.from(new Set(payerMembers)).map(federationId => ({
                federationId,
                // a joined member's invite is never used — it is already
                // joined — so a placeholder here costs nothing
                inviteCode: `fed1mock-joined-${federationId}`,
                joined: true,
            })),
            ...this.joinableWalletServices
                .filter(
                    service => !this.joinedFederationIds.includes(service.id),
                )
                .map(service => ({
                    federationId: service.id,
                    inviteCode: service.inviteCode,
                    joined: false,
                })),
        ]
        return { type: 'federations', federations: members }
    }

    private subscribe(streamId: number): null {
        this.streamIds.add(streamId)
        this.sequences.set(streamId, 0)
        // the real bridge sends the current snapshot immediately on subscribe
        setTimeout(() => this.publishTo(streamId), 0)
        return null
    }

    private unsubscribe(streamId: number): null {
        this.streamIds.delete(streamId)
        this.sequences.delete(streamId)
        return null
    }

    /*** Commands ***/

    private previewSelection(
        request: RpcFiSelectionPreviewRequest,
    ): RpcFiSelectionPreviewResult {
        const requested = request.federationSize
        if (this.fleet.eligible < requested) {
            const eligible = Math.min(this.fleet.eligible, requested - 1)
            return {
                type: 'error',
                error: error(
                    'selection',
                    'not enough verified fleet managers for this size',
                    {
                        type: 'insufficientFmanSeats',
                        requested,
                        selected: eligible,
                        seen: this.fleet.seen,
                        eligible,
                    },
                ),
            }
        }

        const seats = Array.from({ length: requested }, (_, index) => {
            const fmanId = `fman_${String(index + 1).padStart(2, '0')}_${this.hash(index)}`
            return {
                fmanId,
                fmanName: fmanNameFor(fmanId),
                advertisedPriceMsats: String(
                    seatPriceMsats(index, requested, this.seatPriceMsats),
                ),
                provenance: 'fedi_attested',
            }
        })
        const total = seats.reduce(
            (sum, seat) => sum + Number(seat.advertisedPriceMsats),
            0,
        )
        const preview: RpcFiSelectionPreview = {
            previewId: `preview_${this.nextId++}`,
            selected: requested,
            totalAdvertisedMsats: String(total),
            seen: this.fleet.seen,
            eligible: this.fleet.eligible,
            validUntil: nowSecs() + this.previewValiditySecs,
            seats,
        }
        this.previews.set(preview.previewId, preview)
        return { type: 'preview', preview }
    }

    private payAndCreate(
        payload: Record<string, unknown>,
    ): RpcFiOperationResult {
        const previewId = payload.previewId as string
        const intent = payload.intent as {
            federationName: string | null
            federationSize: number
            plan: 'infiniteBestEffort'
        }
        const maxTotalMsats = payload.maxTotalMsats as string

        const preview = this.previews.get(previewId)
        const isExpired = preview ? preview.validUntil <= nowSecs() : false

        if (!preview || isExpired) {
            this.previews.delete(previewId)
            return {
                type: 'error',
                error: error(
                    'selectionReauthorizationRequired',
                    'the sealed selection is no longer valid',
                    {
                        type: 'selectionReauthorizationRequired',
                        reason: isExpired
                            ? 'previewExpired'
                            : 'selectedFmanUnavailable',
                    },
                ),
            }
        }

        if (BigInt(maxTotalMsats) < BigInt(preview.totalAdvertisedMsats)) {
            return {
                type: 'error',
                error: error(
                    'selectionReauthorizationRequired',
                    'advertised estimate exceeds the approved limit',
                ),
            }
        }

        this.status = {
            type: 'formation',
            formation: this.buildSnapshot({
                preview,
                intent,
                maxTotalMsats,
                phase: 'preparing',
            }),
        }
        this.publish()
        return { type: 'success' }
    }

    private resume(): RpcFiOperationResult {
        const formation = this.currentFormation()
        if (!formation) {
            return {
                type: 'error',
                error: error('noActiveFormation', 'no formation to resume'),
            }
        }
        formation.lastError = null
        formation.freshness = 'fresh'
        this.publish()
        return { type: 'success' }
    }

    private abandon(): RpcFiOperationResult {
        const formation = this.currentFormation()
        if (!formation) {
            return {
                type: 'error',
                error: error('noActiveFormation', 'no formation to abandon'),
            }
        }
        const dkgComplete =
            FORMATION_PHASES.indexOf(formation.phase) >=
            FORMATION_PHASES.indexOf('dkgComplete')
        if (formation.paymentOutputsStarted || dkgComplete) {
            return {
                type: 'error',
                error: error(
                    'abandonUnavailable',
                    'this setup can no longer be cancelled',
                    {
                        type: 'abandonUnavailable',
                        reason: dkgComplete
                            ? 'dkgComplete'
                            : 'paymentOutputsStarted',
                    },
                ),
            }
        }
        this.reset()
        return { type: 'success' }
    }

    private authorizePayments(authorizationId: string): RpcFiOperationResult {
        const formation = this.currentFormation()
        const required = formation?.actionRequired
        if (!formation || !required || required.type === 'replaceGuardians') {
            return {
                type: 'error',
                error: error('noActiveFormation', 'nothing to authorize'),
            }
        }
        // the real bridge rejects a stale id rather than paying the wrong thing
        if (required.requirements.authorizationId !== authorizationId) {
            return {
                type: 'error',
                error: error('invalidIntent', 'stale authorization id'),
            }
        }
        formation.actionRequired = null
        formation.paymentOutputsStarted = true
        this.publish()
        return { type: 'success' }
    }

    private previewReplacements():
        | { type: 'preview'; preview: RpcFiReplacementPreview }
        | { type: 'error'; error: RpcFiOperationError } {
        const formation = this.currentFormation()
        const required = formation?.actionRequired
        if (!formation || required?.type !== 'replaceGuardians') {
            return {
                type: 'error',
                error: error('noActiveFormation', 'nothing to replace'),
            }
        }
        const requested = required.requirements.seats.length
        const previewId = `replacement_preview_${this.nextId++}`
        const seats = required.requirements.seats.map(seat => {
            const fmanId = `fman_replacement_${this.hash(seat.index)}`
            return {
                index: seat.index,
                fmanId,
                fmanName: fmanNameFor(fmanId),
                advertisedPriceMsats: String(
                    seatPriceMsats(seat.index, requested, this.seatPriceMsats),
                ),
                provenance: 'PeerBadge',
            }
        })
        const preview: RpcFiReplacementPreview = {
            previewId,
            requirements: required.requirements,
            totalAdvertisedMsats: String(
                seats.reduce(
                    (total, seat) => total + Number(seat.advertisedPriceMsats),
                    0,
                ),
            ),
            seats,
        }
        this.replacementPreviewId = previewId
        return { type: 'preview', preview: structuredCloneish(preview) }
    }

    private applyReplacements(previewId: string): RpcFiOperationResult {
        const formation = this.currentFormation()
        const required = formation?.actionRequired
        if (!formation || required?.type !== 'replaceGuardians') {
            return {
                type: 'error',
                error: error('noActiveFormation', 'nothing to replace'),
            }
        }
        // the real bridge seals the subset to the exact previewId
        if (previewId !== this.replacementPreviewId) {
            return {
                type: 'error',
                error: error('invalidIntent', 'stale replacement preview'),
            }
        }
        this.replacementPreviewId = null
        formation.actionRequired = null
        formation.seats = formation.seats.map(seat =>
            required.requirements.seats.some(r => r.index === seat.index)
                ? { ...seat, phase: 'dkgUnderway' as const }
                : seat,
        )
        this.publish()
        return { type: 'success' }
    }

    private setGuardianFee(guardianFeePpm: number): RpcFiOperationResult {
        if (guardianFeePpm > MAX_GUARDIAN_FEE_PPM) {
            return {
                type: 'error',
                error: error(
                    'invalidIntent',
                    `guardian fee ppm must not exceed ${MAX_GUARDIAN_FEE_PPM}`,
                ),
            }
        }
        const formation = this.currentFormation()
        // mirrors `formed_federation_id`: maintenance is post-formation only
        if (!formation || formation.phase !== 'formed') {
            return {
                type: 'error',
                error: error(
                    'noActiveFormation',
                    'federation maintenance is available only after creation',
                ),
            }
        }
        formation.intent.guardianFeePpm = guardianFeePpm
        this.setWalletServiceMeta(
            GUARDIAN_FEE_SEND_PPM_META_KEY,
            String(guardianFeePpm),
        )
        this.publish()
        return { type: 'success' }
    }

    private updateMetadata(): RpcFiOperationResult {
        const formation = this.currentFormation()
        if (!formation || formation.phase !== 'formed') {
            return {
                type: 'error',
                error: error(
                    'noActiveFormation',
                    'federation maintenance is available only after creation',
                ),
            }
        }
        return { type: 'success' }
    }

    private setWalletServiceMeta(key: string, value: string) {
        const federation = this.walletServiceFederation
        if (!federation) return
        federation.meta = { ...federation.meta, [key]: value }
    }

    /*** Liquidity — the Lightning provider attach ***/

    /**
     * The one provider the simulated environment admits.
     *
     * `supportedNetworks` comes from the world rather than the request, so the
     * provider can be put on a network the federation does not run, which is
     * the mismatch that silently finds nothing.
     */
    private liquidityProvider(): RpcFiLiquidityProvider {
        return {
            providerPubkey: 'sim_provider_peerbadge',
            supportedSources: ['gateway'],
            supportedNetworks: [this.liquidityNetwork],
            displayName: 'PeerBadge Verified Lightning Provider',
            website: null,
            contact: null,
            issuedAt: nowSecs(),
            expiresAt: nowSecs() + 3_600,
        }
    }

    private liquidityDiscover(
        network: RpcFiLiquidityNetwork,
    ): RpcFiLiquidityDiscoveryResult {
        const provider = this.liquidityProvider()
        // the caller filters on this too, but a provider that cannot serve the
        // requested network is a rejection the response should carry
        if (!provider.supportedNetworks.includes(network))
            return {
                type: 'discovery',
                providers: [],
                rejected: [
                    {
                        providerPubkey: provider.providerPubkey,
                        code: 'networkUnsupported',
                    },
                ],
            }
        return { type: 'discovery', providers: [provider], rejected: [] }
    }

    /**
     * At most one live operation per federation, so a start with one already
     * present adopts it rather than replacing it — the same refusal the real
     * contract makes.
     */
    private liquidityStart(): RpcFiLiquidityOperationResult {
        if (this.liquidityOperation)
            return { type: 'operation', operation: this.liquidityOperation }

        this.liquidityPolls = 0
        this.liquidityOperation = this.makeLiquidityOperation(false)
        return { type: 'operation', operation: this.liquidityOperation }
    }

    private liquidityResume(): RpcFiLiquidityOperationResult {
        if (!this.liquidityOperation)
            return {
                type: 'error',
                error: error('noActiveFormation', 'no liquidity operation'),
            }
        return { type: 'operation', operation: this.liquidityOperation }
    }

    /** Reads the durable projection and advances it. */
    private liquidityStatus(): RpcFiLiquidityOperationResult {
        const operation = this.liquidityOperation
        if (!operation)
            return {
                type: 'error',
                error: error('noActiveFormation', 'no liquidity operation'),
            }

        this.liquidityPolls += 1
        const advanced =
            this.liquidityPolls >= LIQUIDITY_VERIFY_AFTER_POLLS
                ? { ...operation, gatewayViewVerified: true }
                : operation
        this.liquidityOperation = advanced
        return { type: 'operation', operation: advanced }
    }

    private liquidityCurrent(): RpcFiCurrentLiquidityOperationResult {
        return { type: 'current', operation: this.liquidityOperation }
    }

    private makeLiquidityOperation(
        gatewayViewVerified: boolean,
    ): RpcFiLiquidityOperation {
        return {
            operationId: `liquidity_${this.nextId++}`,
            formationId:
                this.status.type === 'formation'
                    ? this.status.formation.formationId
                    : 'formation_sim',
            providerPubkey: this.liquidityProvider().providerPubkey,
            endpointHint: 'wss://provider.sim',
            detailsPayloadHash: 'sim_payload_hash',
            amounts: {
                gatewayMinSats: 100_000,
                gatewayMaxSats: 1_000_000,
                stabilityMinSats: 0,
                stabilityMaxSats: null,
            },
            phase: 'accepted',
            itemStatuses: [],
            rejectionCode: null,
            gatewayViewVerified,
        }
    }

    private unsupported(method: string): RpcFiOperationResult {
        log.warn('fi method not simulated', method)
        return {
            type: 'error',
            error: error(
                'capabilityUnavailable',
                `${method} is not simulated yet`,
            ),
        }
    }

    /*** Formation timeline ***/

    private buildSnapshot({
        preview,
        intent,
        maxTotalMsats,
        phase,
    }: {
        preview: RpcFiSelectionPreview
        intent: {
            federationName: string | null
            federationSize: number
            plan: 'infiniteBestEffort'
        }
        maxTotalMsats: string
        phase: FormationPhaseName
    }): RpcFiFormationSnapshot {
        return {
            formationId: `formation_${this.nextId++}`,
            phase,
            intent: {
                federationName: intent.federationName ?? 'My Wallet Service',
                federationSize: intent.federationSize,
                guardianFeePpm: 0,
                plan: intent.plan,
                maxTotalMsats,
            },
            seats: preview.seats.map((seat, index) => ({
                index,
                fmanId: seat.fmanId,
                fmanName: seat.fmanName,
                locator: JSON.stringify({ v: 1, fmanId: seat.fmanId }),
                seatId: null,
                guardianCode: null,
                phase: 'selected',
                freshness: 'fresh',
            })),
            freshness: 'fresh',
            actionRequired: null,
            paymentOutputsStarted: false,
            milestones: {
                ecashSent: false,
                guardiansConfirmed: false,
                walletServiceCreated: false,
            },
            inviteCode: null,
            lastError: null,
        }
    }

    /*** Stream plumbing ***/

    private currentFormation(): RpcFiFormationSnapshot | null {
        return this.status.type === 'formation' ? this.status.formation : null
    }

    private publish() {
        this.streamIds.forEach(streamId => this.publishTo(streamId))
    }

    private publishTo(streamId: number) {
        if (!this.emitStream || !this.streamIds.has(streamId)) return
        const sequence = this.sequences.get(streamId) ?? 0
        this.sequences.set(streamId, sequence + 1)
        this.emitStream({
            stream_id: streamId,
            sequence,
            data: structuredCloneish({ type: 'ready', status: this.status }),
        })
    }

    private hash(index: number): string {
        return ((index + 7) * 2654435761).toString(16).slice(0, 6)
    }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Detach consumers from the simulator's internal objects. */
const structuredCloneish = <T>(value: T): T => JSON.parse(JSON.stringify(value))
