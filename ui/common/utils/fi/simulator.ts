import type { Federation } from '../../types'
import {
    RpcFederation,
    RpcFederationPreview,
    RpcFiClientStatus,
    RpcFiEligiblePayersResult,
    RpcFiErrorCode,
    RpcFiCurrentLiquidityOperationResult,
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
} from '../../types/bindings'
import { makeLog } from '../log'
import {
    MOCK_JOINABLE_WALLET_SERVICES,
    MOCK_PAYER_FEDERATIONS,
    makeMockPayerFederation,
} from './mockPayerFederation'
import {
    DEFAULT_FI_SCENARIO,
    FORMATION_PHASES,
    FiScenario,
    FiScenarioName,
    FormationPhaseName,
    fiScenarios,
} from './scenarios'

const log = makeLog('common/utils/fi/simulator')

/** Advertised price per guardian seat, in msats. 2,100 sats. */
const BASE_SEAT_PRICE_MSATS = 2_100_000
/** Ceiling enforced by `guardian_fee_from_rpc` in the Rust bridge. */
const MAX_GUARDIAN_FEE_PPM = 210_000

const SATS_TO_MSATS = 1_000

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
 * offsets cancel in pairs so the total still lands on `count * 2,100 sats`,
 * which is what the design references quote.
 */
const seatPriceMsats = (index: number, count: number): number => {
    const isLastOfOddSet = index === count - 1 && count % 2 === 1
    if (isLastOfOddSet) return BASE_SEAT_PRICE_MSATS
    const offset = 50 * SATS_TO_MSATS
    return index % 2 === 0
        ? BASE_SEAT_PRICE_MSATS + offset
        : BASE_SEAT_PRICE_MSATS - offset
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
 * keeps a replayed scenario naming the same seat the same way, and keeps
 * collisions possible rather than papering over them.
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
export class FiSimulator {
    private scenario: FiScenario
    private status: RpcFiStatus = { type: 'idle' }
    private previews = new Map<string, RpcFiSelectionPreview>()
    private replacementPreviewId: string | null = null
    private previewCount = 0
    private streamIds = new Set<number>()
    private sequences = new Map<number, number>()
    private emitStream: StreamEmitter | null = null
    private emitEvent: EventEmitter | null = null
    private pendingDeposits = new Map<string, PendingDeposit>()
    private phaseTimer: ReturnType<typeof setTimeout> | null = null
    private phaseIndex = 0
    private hasPreviewedOnce = false
    private joinedFederationIds: string[] = []
    /** Federations known at session start; anything later was joined since. */
    private baselineFederationIds: string[] | null = null
    private mockPayers: Array<{
        federationId: string
        balanceSats: number
        name?: string
    }> = []
    private nextId = 1
    /** The single live liquidity operation, if one exists. */
    private liquidityOperation: RpcFiLiquidityOperation | null = null
    /** Status reads so far, which is what advances the verification. */
    private liquidityPolls = 0

    constructor(scenarioName: FiScenarioName = DEFAULT_FI_SCENARIO) {
        this.scenario = fiScenarios[scenarioName]
        this.seedFromScenario()
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
        this.emitEvent = emitEvent ?? null
    }

    /** Swap the environment mid-session, for the dev scenario picker. */
    setScenario(name: FiScenarioName) {
        this.scenario = fiScenarios[name]
        this.reset()
        this.seedFromScenario()
        this.publish()
    }

    /**
     * Put the client straight into a formation when the scenario asks for one.
     *
     * Reaching the progress, fee and operator screens otherwise means spending
     * from a real joined wallet, which dev cannot always provide.
     */
    private seedFromScenario() {
        const seed = this.scenario.seedFormation
        if (!seed) return
        const size = 10
        const seats = Array.from({ length: size }, (_, index) => {
            const fmanId = `fman_${String(index + 1).padStart(2, '0')}_${this.hash(index)}`
            return {
                fmanId,
                fmanName: fmanNameFor(fmanId),
                advertisedPriceMsats: String(seatPriceMsats(index, size)),
                provenance: 'fedi_attested',
            }
        })
        const formation = this.buildSnapshot({
            preview: {
                previewId: 'preview_seed',
                selected: size,
                totalAdvertisedMsats: String(size * BASE_SEAT_PRICE_MSATS),
                seen: this.scenario.seenFmanCount,
                eligible: this.scenario.eligibleFmanCount,
                validUntil: nowSecs() + this.scenario.previewValiditySecs,
                seats,
            },
            intent: {
                federationName: 'My Wallet Service',
                federationSize: size,
                plan: 'infiniteBestEffort',
                fedimintdVersion: '0.11.1-fedi13',
            },
            maxTotalMsats: String(size * BASE_SEAT_PRICE_MSATS),
            phase: seed === 'formed' ? 'formed' : 'acquiringSeats',
        })
        if (seed === 'formed') {
            formation.milestones = {
                ecashSent: true,
                guardiansConfirmed: true,
                walletServiceCreated: true,
            }
            formation.paymentOutputsStarted = true
            formation.inviteCode = `fed1${'sim'.padEnd(40, '0')}${formation.formationId}`
            this.phaseIndex = FORMATION_PHASES.indexOf('formed')
        } else {
            formation.milestones.ecashSent = true
            formation.paymentOutputsStarted = true
            this.phaseIndex = FORMATION_PHASES.indexOf('acquiringSeats')
        }
        this.status = { type: 'formation', formation }
        // an operation the creation flow is presumed to have started already.
        // Seeded after the status, so it carries the real formation id.
        if (
            this.scenario.liquidityAlreadyRunning ||
            this.scenario.liquidityAlreadyAttached
        )
            this.liquidityOperation = this.makeLiquidityOperation(
                this.scenario.liquidityAlreadyAttached,
            )
        // a seeded in-flight formation marches like a paid one, so the
        // scenario's fail/authorize/replace knobs apply to it too. Knob
        // scenarios walk the timeline synchronously until the knob parks it,
        // so the very first snapshot a screen reads is already in the state
        // the scenario names; a plain seed keeps marching on the timer.
        if (seed !== 'inProgress') return
        const { scenario } = this
        const hasKnob =
            scenario.failAtPhase ||
            scenario.unsyncedAtPhase ||
            scenario.authorizeAtPhase ||
            scenario.replaceGuardianAtPhase
        if (!hasKnob) {
            this.scheduleNextPhase()
            return
        }
        // a knob at or before the seeded phase can never be "entered" by the
        // walk, so it applies to the seeded snapshot directly
        const phaseIndexOf = (phase: FormationPhaseName | null) =>
            phase ? FORMATION_PHASES.indexOf(phase) : Number.MAX_SAFE_INTEGER
        if (phaseIndexOf(scenario.failAtPhase) <= this.phaseIndex) {
            formation.lastError = scenario.failWithCode
            return
        }
        if (phaseIndexOf(scenario.unsyncedAtPhase) <= this.phaseIndex) {
            formation.freshness = 'unsynced'
            return
        }
        if (phaseIndexOf(scenario.authorizeAtPhase) <= this.phaseIndex) {
            this.parkAuthorization(formation)
            return
        }
        if (phaseIndexOf(scenario.replaceGuardianAtPhase) <= this.phaseIndex) {
            this.parkReplacement(formation)
            return
        }
        for (let step = 0; step < FORMATION_PHASES.length; step++) {
            const current = this.currentFormation()
            if (
                !current ||
                current.phase === 'formed' ||
                current.lastError ||
                current.actionRequired ||
                current.freshness === 'unsynced'
            )
                break
            this.advancePhase()
        }
        // the walk's intermediate advances each armed a timer; parked states
        // must not march on without the user
        if (this.phaseTimer) {
            clearTimeout(this.phaseTimer)
            this.phaseTimer = null
        }
    }

    /** Return to a pristine `idle` client. */
    reset() {
        if (this.phaseTimer) clearTimeout(this.phaseTimer)
        this.phaseTimer = null
        this.phaseIndex = 0
        this.hasPreviewedOnce = false
        this.previewCount = 0
        this.previews.clear()
        this.pendingDeposits.clear()
        this.liquidityOperation = null
        this.liquidityPolls = 0
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
        if (method === 'federationPreview' || method === 'joinFederation')
            return Boolean(this.mockJoinableFor(payload.inviteCode as string))
        // the join thunk resolves a status for the new wallet through this,
        // and a mock id reaching the real bridge fails the whole join
        if (method === 'getGuardianStatus')
            return this.isMockPayer(payload.federationId as string)
        // This developer action must reach the real bridge so it can write the
        // startup marker outside the simulated FI state.
        return (
            method !== 'fiClientScheduleReset' && method.startsWith('fiClient')
        )
    }

    async handle(method: string, payload: Record<string, unknown>) {
        log.debug('simulated fi rpc', method)
        switch (method) {
            case 'generateInvoice':
                return this.generateInvoice(payload)
            case 'payInvoice':
                return this.payInvoice(payload)
            case 'federationPreview':
                return this.mockFederationPreview(payload)
            case 'joinFederation':
                return this.joinMockFederation(payload)
            case 'getGuardianStatus':
                // one healthy guardian is all the status coercion needs
                return [{ online: { guardian: 'sim', latency_ms: 1 } }]
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
        return { type: 'ready', status: this.status }
    }

    /**
     * Record the federations the app has actually joined.
     *
     * The payer picker can only offer a wallet the app holds, so invented ids
     * would leave every scenario stuck on "no wallet can pay". The transport
     * snoops `listFederations` and feeds the real ids in here; the scenario
     * then supplies the balances against them.
     */
    observeFederations(federationIds: string[]) {
        // the first list is what the session started with; anything that turns
        // up later was joined during it, which is what `admitNewlyJoined` acts
        // on
        if (this.baselineFederationIds === null)
            this.baselineFederationIds = federationIds
        this.joinedFederationIds = federationIds
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
        // whatever was joined before this point is the baseline, so a join
        // arriving before the first `listFederations` still counts as new
        if (this.baselineFederationIds === null)
            this.baselineFederationIds = this.joinedFederationIds
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
     * The balance rides along rather than coming from the scenario, so seeding
     * a payer set does not disturb the scenario the flow is being tested under.
     */
    addMockPayer(federationId: string, balanceSats: number, name?: string) {
        const existing = this.mockPayers.find(
            p => p.federationId === federationId,
        )
        if (existing) {
            existing.balanceSats = balanceSats
            return
        }
        this.mockPayers.push({ federationId, balanceSats, name })
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
    listMockFederations(): Federation[] {
        return this.mockPayers.map(payer =>
            makeMockPayerFederation({
                id: payer.federationId,
                name:
                    payer.name ??
                    MOCK_PAYER_FEDERATIONS.find(
                        m => m.id === payer.federationId,
                    )?.name ??
                    payer.federationId,
                balanceSats: payer.balanceSats,
            }),
        )
    }

    private mockJoinableFor(inviteCode: string | undefined) {
        return (
            MOCK_JOINABLE_WALLET_SERVICES.find(
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
     * `listFederations` keeps it, the payer lookup admits it (in scenarios
     * with `admitNewlyJoined`) and the top-up rails can fund it.
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
        this.emitEvent?.('federation', federation)
        // Federation is the ready arm of RpcFederationMaybeLoading, which is
        // what the join rpc's consumers actually read
        return federation as unknown as RpcFederation
    }

    private isMockPayer(federationId: string | undefined): boolean {
        return this.mockPayers.some(p => p.federationId === federationId)
    }

    /*** Money rails, for mock payers only ***/

    /**
     * A deposit invoice against a wallet the real bridge has never heard of.
     *
     * Without this the top-up sheet dies on its first step whenever the payer
     * is a mock one, which is every scenario dev cannot join a real wallet for.
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
        this.emitEvent?.('transaction', {
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
        this.emitEvent?.('balance', {
            federationId,
            balance: payer.balanceSats * SATS_TO_MSATS,
        })
    }

    private eligiblePayers(): RpcFiEligiblePayersResult {
        // the real bridge returns an *error*, not an empty list, when the
        // trusted setup payment set cannot be authenticated — which is what a
        // user in no such federation actually hits. `payers: []` cannot stand
        // in for it, so the failing shape is its own scenario.
        if (this.scenario.failPayerLookup) {
            return {
                type: 'error',
                error: {
                    code: 'registry',
                    message: 'trusted setup payment federations unavailable',
                    detail: null,
                },
            }
        }
        // a federation joined during the session, in a scenario that is about
        // joining one. Zero balance: it was joined to pay for setup, so the
        // next thing it needs is a top-up
        const newlyJoined = this.scenario.admitNewlyJoined
            ? this.joinedFederationIds
                  .filter(id => !this.baselineFederationIds?.includes(id))
                  .map(federationId => ({ federationId, balanceMsats: '0' }))
            : []

        const balances = this.scenario.payers
        // an empty scenario means "nothing can pay", whatever was already
        // joined — but not what was joined since
        if (!balances.length) return { type: 'payers', payers: newlyJoined }

        // mock payers carry their own balance; everything else falls back to
        // the scenario's list, cycled across however many wallets are joined
        const mockPayers = this.mockPayers.filter(
            p => !this.joinedFederationIds.includes(p.federationId),
        )
        const realIds = this.joinedFederationIds.length
            ? this.joinedFederationIds
            : mockPayers.length
              ? []
              : balances.map(p => p.federationId)

        return {
            type: 'payers',
            payers: [
                ...newlyJoined,
                ...realIds.map((federationId, index) => ({
                    federationId,
                    balanceMsats: String(
                        balances[index % balances.length].balanceSats *
                            SATS_TO_MSATS,
                    ),
                })),
                ...mockPayers.map(p => ({
                    federationId: p.federationId,
                    balanceMsats: String(p.balanceSats * SATS_TO_MSATS),
                })),
            ],
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
    private async setupPaymentFederations(): Promise<RpcFiSetupPaymentFederationsResult> {
        const scenario = this.scenario
        // the real lookup is a relay fetch plus a preview per result, so the
        // sheet's loading state is worth being able to sit and look at
        await delay(scenario.joinLookupLatencyMs)
        if (scenario.failJoinLookup) {
            return {
                type: 'error',
                error: {
                    code: 'registry',
                    message: 'simulated setup-payment lookup failure',
                    detail: null,
                },
            }
        }
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
            ...(scenario.noJoinableWalletServices
                ? []
                : MOCK_JOINABLE_WALLET_SERVICES
            )
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

    private async previewSelection(
        request: RpcFiSelectionPreviewRequest,
    ): Promise<RpcFiSelectionPreviewResult> {
        const { scenario } = this
        await delay(
            this.hasPreviewedOnce
                ? scenario.warmPreviewLatencyMs
                : scenario.coldPreviewLatencyMs,
        )
        this.previewCount++
        this.hasPreviewedOnce = true

        const requested = request.federationSize
        if (
            scenario.eligibleFmanCount < requested ||
            (scenario.previewFailuresAfterCount !== null &&
                this.previewCount > scenario.previewFailuresAfterCount)
        ) {
            const eligible = Math.min(scenario.eligibleFmanCount, requested - 1)
            return {
                type: 'error',
                error: error(
                    'selection',
                    'not enough verified fleet managers for this size',
                    {
                        type: 'insufficientFmanSeats',
                        requested,
                        selected: eligible,
                        seen: scenario.seenFmanCount,
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
                advertisedPriceMsats: String(seatPriceMsats(index, requested)),
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
            seen: scenario.seenFmanCount,
            eligible: scenario.eligibleFmanCount,
            validUntil: nowSecs() + scenario.previewValiditySecs,
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
            fedimintdVersion: string
        }
        const maxTotalMsats = payload.maxTotalMsats as string

        const preview = this.previews.get(previewId)
        const isExpired = preview ? preview.validUntil <= nowSecs() : false

        if (!preview || isExpired || this.scenario.rejectSelectionOnPay) {
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
        this.phaseIndex = 0
        this.publish()
        this.scheduleNextPhase()
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
        this.scheduleNextPhase()
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
        if (formation.paymentOutputsStarted || formation.phase === 'formed') {
            return {
                type: 'error',
                error: error(
                    'abandonUnavailable',
                    'this setup can no longer be cancelled',
                    {
                        type: 'abandonUnavailable',
                        reason:
                            formation.phase === 'formed'
                                ? 'alreadyFormed'
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
        this.scheduleNextPhase()
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
        if (this.scenario.replacementCandidateCount < requested) {
            return {
                type: 'error',
                error: error(
                    'selection',
                    'not enough verified replacement candidates',
                    {
                        type: 'insufficientFmanSeats',
                        requested,
                        selected: this.scenario.replacementCandidateCount,
                        seen: this.scenario.seenFmanCount,
                        eligible: this.scenario.replacementCandidateCount,
                    },
                ),
            }
        }
        const previewId = `replacement_preview_${this.nextId++}`
        const seats = required.requirements.seats.map(seat => {
            const fmanId = `fman_replacement_${this.hash(seat.index)}`
            return {
                index: seat.index,
                fmanId,
                fmanName: fmanNameFor(fmanId),
                advertisedPriceMsats: String(
                    seatPriceMsats(seat.index, requested),
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
        this.scheduleNextPhase()
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

    /*** Liquidity — the Lightning provider attach ***/

    /**
     * The one provider the simulated environment admits.
     *
     * `supportedNetworks` comes from the scenario rather than the request, so a
     * scenario can put the provider on a network the federation does not run,
     * which is the mismatch that silently finds nothing.
     */
    private liquidityProvider(): RpcFiLiquidityProvider {
        return {
            providerPubkey: 'sim_provider_peerbadge',
            supportedSources: ['gateway'],
            supportedNetworks: [this.scenario.liquidityNetwork],
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
        const code = this.scenario.liquidityFailWithCode
        if (code)
            return {
                type: 'error',
                error: error(code, 'simulated liquidity discovery failure'),
            }
        if (this.scenario.liquidityNoProvider)
            return { type: 'discovery', providers: [], rejected: [] }

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

        const code = this.scenario.liquidityFailWithCode
        if (code)
            return {
                type: 'error',
                error: error(code, 'simulated liquidity start failure'),
            }

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

    /**
     * Reads the durable projection and advances it.
     *
     * The verification is counted in reads rather than timed, so a scenario
     * says how many polls it takes and the wait is the same however fast the
     * device is.
     */
    private liquidityStatus(): RpcFiLiquidityOperationResult {
        const operation = this.liquidityOperation
        if (!operation)
            return {
                type: 'error',
                error: error('noActiveFormation', 'no liquidity operation'),
            }

        if (this.scenario.liquidityRejectsOnStatus) {
            this.liquidityOperation = {
                ...operation,
                phase: 'rejected',
                rejectionCode: 'intentRefused',
            }
            return { type: 'operation', operation: this.liquidityOperation }
        }

        this.liquidityPolls += 1
        const verifyAfter = this.scenario.liquidityVerifyAfterPolls
        const advanced =
            verifyAfter !== null && this.liquidityPolls >= verifyAfter
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
            fedimintdVersion: string
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
                fedimintdVersion: intent.fedimintdVersion,
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

    private scheduleNextPhase() {
        if (this.phaseTimer) clearTimeout(this.phaseTimer)
        this.phaseTimer = setTimeout(
            () => this.advancePhase(),
            this.scenario.phaseIntervalMs,
        )
    }

    private advancePhase() {
        const formation = this.currentFormation()
        if (!formation) return

        const nextIndex = this.phaseIndex + 1
        const nextPhase = FORMATION_PHASES[nextIndex]
        if (!nextPhase) return

        if (this.scenario.failAtPhase === nextPhase) {
            formation.lastError = this.scenario.failWithCode
            this.publish()
            return
        }

        if (this.scenario.unsyncedAtPhase === nextPhase) {
            // the stream stalls: last-known data, no error, no more progress
            formation.freshness = 'unsynced'
            this.publish()
            return
        }

        this.phaseIndex = nextIndex
        formation.phase = nextPhase
        formation.seats = formation.seats.map(seat => ({
            ...seat,
            phase: seatPhaseFor(nextPhase),
        }))

        // milestones are what the progress screen renders, so they flip on the
        // phases the bridge actually associates them with
        if (nextIndex >= FORMATION_PHASES.indexOf('acquiringSeats')) {
            formation.milestones.ecashSent = true
            formation.paymentOutputsStarted = true
        }
        if (nextIndex >= FORMATION_PHASES.indexOf('dkgUnderway')) {
            formation.milestones.guardiansConfirmed = true
        }
        if (nextPhase === 'formed') {
            formation.milestones.walletServiceCreated = true
            formation.inviteCode = `fed1${'sim'.padEnd(40, '0')}${formation.formationId}`
        }

        if (this.scenario.replaceGuardianAtPhase === nextPhase) {
            this.parkReplacement(formation)
            this.publish()
            return // wait for the user rather than marching on
        }

        if (this.scenario.authorizeAtPhase === nextPhase) {
            this.parkAuthorization(formation)
            this.publish()
            return // wait for the user rather than marching on
        }

        this.publish()
        if (nextPhase !== 'formed') this.scheduleNextPhase()
    }

    /**
     * One seat is terminally refused: it regresses, the all-seats milestone
     * predicate un-ticks, and the decision parks for the user.
     */
    private parkReplacement(formation: RpcFiFormationSnapshot) {
        const refused = formation.seats[0]
        refused.phase = 'replacementRequired'
        formation.milestones.guardiansConfirmed = false
        formation.actionRequired = {
            type: 'replaceGuardians',
            requirements: {
                replacementId: `replacement_${this.nextId++}`,
                seats: [
                    {
                        index: refused.index,
                        previousFmanId: refused.fmanId,
                        previousFmanName: refused.fmanName,
                        previousQuoteId: `quote_${refused.index}`,
                        previousLocator: refused.locator,
                    },
                ],
            },
        }
    }

    /**
     * Park an extra-payment authorization. The payer must be a wallet the app
     * really holds: the approve prompt gates on that wallet's live balance,
     * exactly as the real bridge names real payment federations per seat.
     */
    private parkAuthorization(formation: RpcFiFormationSnapshot) {
        // a mock payer outranks the scenario's invented ids: it is a wallet
        // redux actually holds, so the shortfall gate and the banner's name
        // both resolve — an invented id degrades to the nameless variant
        const payerFederationId =
            this.joinedFederationIds[0] ??
            this.mockPayers[0]?.federationId ??
            this.scenario.payers[0]?.federationId ??
            ''
        const totalMsats = this.scenario.authorizeAmountSats * SATS_TO_MSATS
        const seats = formation.seats.slice(0, 3)
        formation.actionRequired = {
            type: 'authorizePayments',
            requirements: {
                authorizationId: `auth_${this.nextId++}`,
                totalMsats: String(totalMsats),
                maxTotalMsats: formation.intent.maxTotalMsats,
                seats: seats.map(seat => ({
                    index: seat.index,
                    fmanId: seat.fmanId,
                    fmanName: seat.fmanName,
                    quoteId: `quote_${seat.index}`,
                    paymentFederationId: payerFederationId,
                    amountMsats: String(Math.floor(totalMsats / seats.length)),
                })),
            },
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

const seatPhaseFor = (
    phase: FormationPhaseName,
): RpcFiFormationSnapshot['seats'][number]['phase'] => {
    switch (phase) {
        case 'preparing':
        case 'awaitingPaymentReadiness':
            return 'selected'
        case 'acquiringSeats':
            return 'acquiring'
        case 'preparingDkg':
            return 'guardianCodeReady'
        case 'dkgUnderway':
            return 'dkgUnderway'
        default:
            return 'running'
    }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Detach consumers from the simulator's internal objects. */
const structuredCloneish = <T>(value: T): T => JSON.parse(JSON.stringify(value))
