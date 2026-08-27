import { RpcFiErrorCode, RpcFiLiquidityNetwork } from '../../types/bindings'

/**
 * Named starting conditions for {@link FiSimulator}.
 *
 * A scenario only describes what the *environment* looks like. It never
 * describes what a screen should render — that stays in the screens, driven by
 * the same bridge contract the real backend serves.
 */
export interface FiScenario {
    /** Wallets the bridge admits as setup payers. Empty routes to the gate. */
    payers: Array<{ federationId: string; balanceSats: number }>
    /** Cold-start latency for the first selection preview, in ms. */
    coldPreviewLatencyMs: number
    /** Warm latency for subsequent previews, in ms. */
    warmPreviewLatencyMs: number
    /** How many verified fleet managers exist, capping `selected`. */
    eligibleFmanCount: number
    /** Advertisements seen during the selection walk. */
    seenFmanCount: number
    /** Seconds a sealed preview stays valid. Real bridge uses 120. */
    previewValiditySecs: number
    /** Milliseconds between formation phase transitions. */
    phaseIntervalMs: number
    /** Phase at which formation stops and reports `lastError`. */
    failAtPhase: FormationPhaseName | null
    /** Error surfaced when `failAtPhase` is reached. */
    failWithCode: RpcFiErrorCode
    /** Park an `authorizePayments` action at this phase. */
    authorizeAtPhase: FormationPhaseName | null
    /** Terminally refuse one seat at this phase, parking `replaceGuardians`. */
    replaceGuardianAtPhase: FormationPhaseName | null
    /** Verified candidates available to a replacement preview. */
    replacementCandidateCount: number
    /** Halt at this phase reporting stale data, with no error. */
    unsyncedAtPhase: FormationPhaseName | null
    /** Sats the parked authorization demands. */
    authorizeAmountSats: number
    /** Fail every selection preview after this many with too few guardians. */
    previewFailuresAfterCount: number | null
    /** Reject the next payAndCreate as a stale selection. */
    rejectSelectionOnPay: boolean
    /**
     * Fail `fiClientEligiblePayers` outright, the way the real bridge does when
     * the trusted setup payment set cannot be authenticated. Distinct from an
     * empty `payers` list: membership is unknown rather than absent, and the
     * payment screen says so differently.
     */
    failPayerLookup: boolean
    /**
     * Fail `fiClientSetupPaymentFederations`, the join sheet's own lookup.
     *
     * Distinct from {@link noJoinableWalletServices}: the check did not run, so
     * the list may not be empty. The sheet must say that rather than "no wallet
     * can pay for setup", which reads as settled and stops the user looking.
     */
    failJoinLookup: boolean
    /**
     * Admit no unjoined services, so the join sheet's lookup succeeds and finds
     * nothing to offer. The honest empty state, as opposed to a failed check.
     */
    noJoinableWalletServices: boolean
    /**
     * Latency on the join sheet's lookup, in ms. The real one is a nostr relay
     * fetch capped at ten seconds plus a federation preview per result, so the
     * sheet's loading state is a real thing to look at.
     */
    joinLookupLatencyMs: number
    /**
     * Admit any federation joined during the session as a setup payer, at zero
     * balance.
     *
     * Without this a scenario that starts with no eligible payer can never
     * leave that state, and the join flow stops at the terms. The real bridge
     * admits a newly joined trusted federation on the next lookup; this is that
     * behaviour, kept to the scenarios that are about joining one.
     */
    admitNewlyJoined: boolean
    /**
     * Seed the client with a formation already underway, so the post-payment
     * screens can be reached without spending. `formed` lands on the operator
     * screens directly.
     */
    seedFormation: null | 'inProgress' | 'formed'
    /**
     * The network the simulated provider advertises.
     *
     * Discovery filters a provider against the federation's own network, so a
     * mismatch here is how the "no provider for this network" state is reached
     * — the same shape as the real staging FLIP, which advertises `signet`
     * where the client used to ask for `bitcoin`.
     */
    liquidityNetwork: RpcFiLiquidityNetwork
    /** Fail discovery and start with this code. Null means both succeed. */
    liquidityFailWithCode: RpcFiErrorCode | null
    /** Discovery succeeds and admits nobody, which is not an error. */
    liquidityNoProvider: boolean
    /**
     * How many status reads happen before the gateway view verifies. Null never
     * verifies, which is what the poll budget and "still setting up" need.
     */
    liquidityVerifyAfterPolls: number | null
    /**
     * Report the operation as `rejected` on the first status read. Terminal for
     * this intent, and never a formation failure.
     */
    liquidityRejectsOnStatus: boolean
    /**
     * Start with an operation already running, as if creation had begun one.
     *
     * This is the only way to reach the settings sheet's locked state, and the
     * only way to prove a second host adopts rather than starts again.
     */
    liquidityAlreadyRunning: boolean
    /** Start with a verified gateway, so the attached settings state is reachable. */
    liquidityAlreadyAttached: boolean
}

export type FormationPhaseName =
    | 'preparing'
    | 'awaitingPaymentReadiness'
    | 'acquiringSeats'
    | 'preparingDkg'
    | 'dkgUnderway'
    | 'publishingSeatBindings'
    | 'formed'

/**
 * Ordered formation timeline. Matches `RpcFiFormationPhase` exactly; a phase
 * added in Rust becomes a compile error here once bindings regenerate.
 */
export const FORMATION_PHASES: FormationPhaseName[] = [
    'preparing',
    'awaitingPaymentReadiness',
    'acquiringSeats',
    'preparingDkg',
    'dkgUnderway',
    'publishingSeatBindings',
    'formed',
]

const baseScenario: FiScenario = {
    payers: [
        { federationId: 'fed-bitcoin-builders', balanceSats: 312_500 },
        { federationId: 'fed-community-mint', balanceSats: 48_000 },
    ],
    coldPreviewLatencyMs: 1_000,
    warmPreviewLatencyMs: 400,
    eligibleFmanCount: 30,
    seenFmanCount: 42,
    previewValiditySecs: 120,
    phaseIntervalMs: 2_000,
    failAtPhase: null,
    failWithCode: 'fleetManager',
    authorizeAtPhase: null,
    replaceGuardianAtPhase: null,
    replacementCandidateCount: 5,
    unsyncedAtPhase: null,
    authorizeAmountSats: 6_300,
    previewFailuresAfterCount: null,
    rejectSelectionOnPay: false,
    failPayerLookup: false,
    failJoinLookup: false,
    noJoinableWalletServices: false,
    joinLookupLatencyMs: 400,
    admitNewlyJoined: false,
    seedFormation: null,
    // the simulated federation is a dev one, so the provider advertises the
    // network a dev federation actually runs on
    liquidityNetwork: 'signet',
    liquidityFailWithCode: null,
    liquidityNoProvider: false,
    liquidityVerifyAfterPolls: 2,
    liquidityRejectsOnStatus: false,
    liquidityAlreadyRunning: false,
    liquidityAlreadyAttached: false,
}

const scenario = (overrides: Partial<FiScenario>): FiScenario => ({
    ...baseScenario,
    ...overrides,
})

export const fiScenarios = {
    /** Everything succeeds. The default for dogfooding the flow. */
    happyPath: scenario({}),

    /**
     * The lookup works and finds nothing: the user is in no trusted setup
     * payment federation. The payment screen still prices the setup and says
     * what is missing — there is no gate any more.
     */
    noEligiblePayers: scenario({ payers: [], admitNewlyJoined: true }),

    /**
     * The payer lookup itself fails, which is what the real bridge does when
     * the trusted set cannot be authenticated. Membership is unknown rather
     * than absent, so the payment screen says something different — and the
     * price must still render, which an empty list cannot prove.
     */
    payerLookupFails: scenario({ failPayerLookup: true }),

    /**
     * In no eligible wallet service, and the sheet's lookup finds nothing to
     * join either. The screen keeps its offer, so the sheet can be reopened;
     * the sheet is where "no wallet can pay for setup" is said.
     */
    noJoinableServices: scenario({
        payers: [],
        noJoinableWalletServices: true,
        admitNewlyJoined: true,
    }),

    /**
     * The join sheet's own lookup fails. Membership is unknown rather than
     * absent, so the sheet must not report it as an empty list — that verdict
     * reads as settled and would stop the user looking.
     */
    joinLookupFails: scenario({
        payers: [],
        failJoinLookup: true,
        admitNewlyJoined: true,
    }),

    /** The join sheet's lookup crawls — exercises its loading state. */
    slowJoinLookup: scenario({
        payers: [],
        joinLookupLatencyMs: 6_000,
        admitNewlyJoined: true,
    }),

    /** A payer exists but cannot cover the total — exercises top-up (05). */
    insufficientBalance: scenario({
        payers: [{ federationId: 'fed-bitcoin-builders', balanceSats: 8_000 }],
    }),

    /** Too few verified guardians for the larger presets. */
    notEnoughGuardians: scenario({ eligibleFmanCount: 8, seenFmanCount: 11 }),

    /** Quotes expire almost immediately — exercises the expiry path on 03/04. */
    selectionExpiresFast: scenario({ previewValiditySecs: 5 }),

    /** The sealed selection is rejected at pay time. */
    reauthorizationRequired: scenario({ rejectSelectionOnPay: true }),

    /** Formation parks asking for an extra payment. */
    authorizePayments: scenario({ authorizeAtPhase: 'acquiringSeats' }),

    /** Formation fails mid-DKG so resume can be exercised. */
    formationFails: scenario({
        failAtPhase: 'dkgUnderway',
        failWithCode: 'fleetManager',
    }),

    /** Formation halts on an error retrying cannot fix. */
    formationFailsTerminally: scenario({
        failAtPhase: 'dkgUnderway',
        failWithCode: 'invalidIntent',
    }),

    /** A seat is terminally refused mid-DKG — exercises replacement review. */
    guardianDroppedOut: scenario({ replaceGuardianAtPhase: 'dkgUnderway' }),

    /** A seat is refused and no replacement candidates exist right now. */
    guardianDroppedOutNoCandidates: scenario({
        replaceGuardianAtPhase: 'dkgUnderway',
        replacementCandidateCount: 0,
    }),

    /** The status stream stalls mid-DKG — exercises the reconnecting notice. */
    reconnecting: scenario({ unsyncedAtPhase: 'dkgUnderway' }),

    /** The parked authorization exceeds any dev wallet — exercises top-up. */
    authorizePaymentsShort: scenario({
        authorizeAtPhase: 'acquiringSeats',
        authorizeAmountSats: 10_000_000,
    }),

    /** The refreshed quote can no longer fill the guardian set. */
    quoteRefreshLosesGuardians: scenario({
        previewValiditySecs: 10,
        // the create screen quotes twice before the confirm screen mounts,
        // so the third preview is the confirm screen's expiry refresh
        previewFailuresAfterCount: 2,
    }),

    /** Drop straight into a formation in flight, without paying. */
    formationInProgress: scenario({ seedFormation: 'inProgress' }),

    /** Drop straight into a formed wallet service — the operator screens. */
    alreadyFormed: scenario({ seedFormation: 'formed' }),

    /** Slow everything down to inspect loading states. */
    slowNetwork: scenario({
        coldPreviewLatencyMs: 3_000,
        warmPreviewLatencyMs: 1_500,
        phaseIntervalMs: 6_000,
    }),

    /*
     * Lightning provider, step 5. Each seeds a formed wallet service, so the
     * step and the settings sheet are both one tap away — the attach cannot run
     * before the formation is formed and fresh, so there is nothing to see
     * until it is.
     */

    /** The attach succeeds. Verifies on the second status read. */
    lightningAttaches: scenario({ seedFormation: 'formed' }),

    /** The attach fails with something worth pressing Try again against. */
    lightningFailsRetryable: scenario({
        seedFormation: 'formed',
        liquidityFailWithCode: 'busy',
    }),

    /**
     * The attach fails with something no retry can move, so the banner drops
     * the retry and Skip is the only exit.
     */
    lightningFailsTerminally: scenario({
        seedFormation: 'formed',
        liquidityFailWithCode: 'capabilityUnavailable',
    }),

    /** Discovery works and admits nobody on this federation's network. */
    lightningNoProvider: scenario({
        seedFormation: 'formed',
        liquidityNoProvider: true,
    }),

    /**
     * The provider only serves mainnet while the federation is on signet.
     * The mismatch a hard-coded `bitcoin` used to cause, from the other side.
     */
    lightningWrongNetwork: scenario({
        seedFormation: 'formed',
        liquidityNetwork: 'bitcoin',
    }),

    /** The provider refuses this exact request. Terminal, never a formation failure. */
    lightningRejected: scenario({
        seedFormation: 'formed',
        liquidityRejectsOnStatus: true,
    }),

    /**
     * The gateway view never verifies, so the poll budget runs out and the
     * screen says "still setting up" rather than calling a running request
     * failed.
     */
    lightningNeverVerifies: scenario({
        seedFormation: 'formed',
        liquidityVerifyAfterPolls: null,
    }),

    /**
     * A request is already running at start. The settings sheet adopts it
     * rather than starting a second, and locks while it runs.
     */
    lightningAlreadyAttaching: scenario({
        seedFormation: 'formed',
        liquidityAlreadyRunning: true,
        liquidityVerifyAfterPolls: null,
    }),

    /** A provider is already attached — the one-way, VERIFIED settings state. */
    lightningAlreadyAttached: scenario({
        seedFormation: 'formed',
        liquidityAlreadyAttached: true,
    }),
} satisfies Record<string, FiScenario>

export type FiScenarioName = keyof typeof fiScenarios

export const DEFAULT_FI_SCENARIO: FiScenarioName = 'happyPath'

/**
 * The scenario picker's grouping, by the part of the flow each one is about.
 *
 * A flat list of thirty is unreadable on a phone, and the dev screen is the
 * only place these are ever chosen. Ordered roughly as the flow runs, so
 * finding the scenario for the screen in front of you is a scan, not a search.
 */
export const FI_SCENARIO_GROUPS = [
    {
        title: 'Baseline',
        scenarios: ['happyPath', 'slowNetwork'],
    },
    {
        title: 'Paying for setup',
        scenarios: [
            'noEligiblePayers',
            'payerLookupFails',
            'insufficientBalance',
        ],
    },
    {
        title: 'Joining a wallet service',
        scenarios: ['noJoinableServices', 'joinLookupFails', 'slowJoinLookup'],
    },
    {
        title: 'Selection and quote',
        scenarios: [
            'notEnoughGuardians',
            'selectionExpiresFast',
            'reauthorizationRequired',
            'quoteRefreshLosesGuardians',
        ],
    },
    {
        title: 'Payment authorization',
        scenarios: ['authorizePayments', 'authorizePaymentsShort'],
    },
    {
        title: 'Formation',
        scenarios: [
            'formationInProgress',
            'alreadyFormed',
            'formationFails',
            'formationFailsTerminally',
            'reconnecting',
        ],
    },
    {
        title: 'Guardian replacement',
        scenarios: ['guardianDroppedOut', 'guardianDroppedOutNoCandidates'],
    },
    {
        title: 'Lightning provider',
        scenarios: [
            'lightningAttaches',
            'lightningFailsRetryable',
            'lightningFailsTerminally',
            'lightningNoProvider',
            'lightningWrongNetwork',
            'lightningRejected',
            'lightningNeverVerifies',
            'lightningAlreadyAttaching',
            'lightningAlreadyAttached',
        ],
    },
] as const satisfies ReadonlyArray<{
    title: string
    scenarios: ReadonlyArray<FiScenarioName>
}>

type GroupedScenario = (typeof FI_SCENARIO_GROUPS)[number]['scenarios'][number]

/**
 * A scenario left out of every group would silently vanish from the picker, so
 * omitting one is a compile error rather than a thing to notice on a device.
 */
const _everyScenarioIsGrouped: Exclude<
    FiScenarioName,
    GroupedScenario
> extends never
    ? true
    : never = true
void _everyScenarioIsGrouped

/**
 * Which storyboard frames each scenario reaches, so a tester can match what is
 * on screen to `fedi-docs/wallet-service-topup-flows/index.html` without
 * guessing. Frames A1-A7 are flow A (in no eligible service); B1-B4 are flow B
 * (a member, short of funds).
 */
export const FI_SCENARIO_STORYBOARD_FRAMES: Partial<
    Record<FiScenarioName, string>
> = {
    noEligiblePayers: 'A1-A7 (join card, join sheet, terms, top up, funded)',
    noJoinableServices: 'A1 + join sheet empty state (Check again)',
    joinLookupFails: 'A1 + join sheet failed-check state (Try again)',
    slowJoinLookup: 'A1 + join sheet loading state',
    insufficientBalance: 'B1, B2, A5-A7 (top up, external deposit)',
    happyPath: 'the payable state the storyboard ends on',
    lightningAttaches: 'step 5 attaching, then the dashboard',
    lightningFailsRetryable: 'step 5 error banner + Try again + Skip',
    lightningFailsTerminally: 'step 5 error banner, Skip the only exit',
    lightningNoProvider: 'step 5 error banner, no provider admitted',
    lightningWrongNetwork: 'step 5 error banner, provider on another network',
    lightningRejected: 'step 5 error banner, provider refused the request',
    lightningNeverVerifies: 'step 5 "still setting up" banner',
    lightningAlreadyAttaching: 'settings sheet locked, row reads Attaching…',
    lightningAlreadyAttached: 'settings sheet VERIFIED, card fixed',
}
