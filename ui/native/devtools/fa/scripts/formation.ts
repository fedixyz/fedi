import {
    formationAt,
    formationStatus,
    formedAt,
    formedStatus,
    withAuthorization,
    withError,
    withReplacement,
    withUnsynced,
} from '../status'
import {
    FaScript,
    FaStep,
    awaitRpc,
    checkpoint,
    formWalletService,
    reply,
    script,
    stream,
    stub,
    wait,
} from '../steps'

const PHASE_MS = 2_000
const PAY_AND_CREATE = {
    previewId: 'preview_script',
    intent: {
        federationName: 'My Wallet Service',
        federationSize: 4,
        plan: 'infiniteBestEffort',
    },
    paymentFederationId: 'mock-payer-global-bitcoin',
    maxTotalMsats: '8400000',
}

const walk = (
    phases: ReadonlyArray<
        | 'preparing'
        | 'awaitingPaymentReadiness'
        | 'acquiringSeats'
        | 'preparingDkg'
        | 'dkgUnderway'
        | 'dkgComplete'
        | 'publishingSeatBindings'
    >,
) =>
    phases.flatMap(phase => [
        stream(ctx => formationStatus(formationAt(ctx, phase))),
        checkpoint(phase),
        wait(PHASE_MS),
    ])

const PAY_AND_CREATE_STEPS = [
    reply('faClientPayAndCreate', { type: 'success' }),
    awaitRpc('faClientPayAndCreate', PAY_AND_CREATE),
    checkpoint('paid'),
]

const TO_DKG = [
    'preparing',
    'awaitingPaymentReadiness',
    'acquiringSeats',
    'preparingDkg',
    'dkgUnderway',
] as const

export const formationHappyPath: FaScript = script('formation.happyPath', [
    ...PAY_AND_CREATE_STEPS,
    ...walk([...TO_DKG, 'dkgComplete', 'publishingSeatBindings']),
    stream(ctx => formedStatus(formedAt(ctx))),
    formWalletService('joining'),
    checkpoint('formedJoining'),
    wait(PHASE_MS),
    formWalletService('ready'),
    checkpoint('formed'),
])

/** Payment through to a joined wallet service, for scripts that begin earlier. */
export const FORMATION_FROM_PAYMENT: FaStep[] = formationHappyPath.steps

export const formationFails: FaScript = script('formation.fails', [
    ...PAY_AND_CREATE_STEPS,
    ...walk(TO_DKG),
    stream(ctx =>
        formationStatus(
            withError(formationAt(ctx, 'dkgUnderway'), 'manifoldGuardian'),
        ),
    ),
    checkpoint('retrying'),
])

export const formationDkgStuck: FaScript = script('formation.dkgStuck', [
    ...PAY_AND_CREATE_STEPS,
    ...walk(TO_DKG),
    checkpoint('dkgStuck'),
])

export const formationFailsTerminally: FaScript = script(
    'formation.failsTerminally',
    [
        ...PAY_AND_CREATE_STEPS,
        ...walk(TO_DKG),
        stream(ctx =>
            formationStatus(
                withError(formationAt(ctx, 'dkgUnderway'), 'invalidIntent'),
            ),
        ),
        checkpoint('failedTerminally'),
    ],
)

export const formationReconnecting: FaScript = script(
    'formation.reconnecting',
    [
        stream(ctx => formedStatus(withUnsynced(formedAt(ctx)))),
        formWalletService('ready'),
        checkpoint('reconnecting'),
    ],
)

export const formationCreatedJoinFails: FaScript = script(
    'formation.createdJoinFails',
    [
        ...PAY_AND_CREATE_STEPS,
        ...walk([...TO_DKG, 'dkgComplete', 'publishingSeatBindings']),
        stream(ctx => formedStatus(formedAt(ctx))),
        formWalletService('joining'),
        formWalletService('failed'),
        checkpoint('joinFailed'),
    ],
)

export const formationAlreadyFormed: FaScript = script(
    'formation.alreadyFormed',
    [
        stream(ctx => formedStatus(formedAt(ctx))),
        formWalletService('ready'),
        checkpoint('formed'),
    ],
)

const AUTHORIZATION_ID = 'auth_script'
const REPLACEMENT_ID = 'replacement_script'

const authorizeAt = (amountSats: number) =>
    stream(ctx =>
        formationStatus(
            withAuthorization(formationAt(ctx, 'acquiringSeats'), {
                authorizationId: AUTHORIZATION_ID,
                amountSats,
                payerFederationId: ctx.world.eligiblePayerIds()[0] ?? 'unknown',
            }),
        ),
    )

const authorizeScript = (name: string, amountSats: number): FaScript =>
    script(name, [
        ...PAY_AND_CREATE_STEPS,
        ...walk(['preparing', 'awaitingPaymentReadiness']),
        authorizeAt(amountSats),
        checkpoint('authorize'),
        awaitRpc('faClientAuthorizeReplacementPayments', {
            authorizationId: AUTHORIZATION_ID,
        }),
        wait(PHASE_MS),
        ...walk([
            'preparingDkg',
            'dkgUnderway',
            'dkgComplete',
            'publishingSeatBindings',
        ]),
        stream(ctx => formedStatus(formedAt(ctx))),
        formWalletService('ready'),
        checkpoint('formed'),
    ])

export const formationAuthorizePayments = authorizeScript(
    'formation.authorizePayments',
    6_300,
)
export const formationAuthorizePaymentsShort = authorizeScript(
    'formation.authorizePaymentsShort',
    10_000_000,
)

const REPLACEMENT_STEPS = [
    ...PAY_AND_CREATE_STEPS,
    ...walk([
        'preparing',
        'awaitingPaymentReadiness',
        'acquiringSeats',
        'preparingDkg',
    ]),
    stream(ctx =>
        formationStatus(
            withReplacement(formationAt(ctx, 'dkgUnderway'), {
                replacementId: REPLACEMENT_ID,
            }),
        ),
    ),
    checkpoint('replaceGuardians'),
    // the simulator answers the real tap against the id its own preview sealed;
    // this payload is only read when a jump skips the step, which no screen does
    awaitRpc('faClientApplyReplacements', {
        previewId: 'replacement_preview_script',
    }),
    wait(PHASE_MS),
    ...walk(['dkgComplete', 'publishingSeatBindings']),
    stream(ctx => formedStatus(formedAt(ctx))),
    formWalletService('ready'),
    checkpoint('formed'),
]

export const formationGuardianDroppedOut: FaScript = script(
    'formation.guardianDroppedOut',
    REPLACEMENT_STEPS,
)

export const formationGuardianDroppedOutNoCandidates: FaScript = script(
    'formation.guardianDroppedOutNoCandidates',
    [
        stub('faClientPreviewReplacements', () => ({
            type: 'error',
            error: {
                code: 'selection',
                message: 'not enough verified replacement candidates',
                detail: {
                    type: 'insufficientMgSeats',
                    requested: 1,
                    selected: 0,
                    seen: 42,
                    eligible: 0,
                },
            },
        })),
        // the replacement preview never succeeds, so the formed tail of
        // these steps is unreachable; kept so the checkpoint stays shared
        ...REPLACEMENT_STEPS,
    ],
)

export const FORMATION_SCRIPTS: FaScript[] = [
    formationHappyPath,
    formationFails,
    formationDkgStuck,
    formationFailsTerminally,
    formationReconnecting,
    formationCreatedJoinFails,
    formationAlreadyFormed,
    formationAuthorizePayments,
    formationAuthorizePaymentsShort,
    formationGuardianDroppedOut,
    formationGuardianDroppedOutNoCandidates,
]
