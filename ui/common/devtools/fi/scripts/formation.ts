import {
    formationAt,
    formationStatus,
    withAuthorization,
    withError,
    withReplacement,
    withUnsynced,
} from '../status'
import {
    FiScript,
    FiStep,
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
        | 'publishingSeatBindings'
    >,
) =>
    phases.flatMap(phase => [
        stream(ctx => formationStatus(formationAt(ctx, phase))),
        checkpoint(phase),
        wait(PHASE_MS),
    ])

const PAY_AND_CREATE_STEPS = [
    reply('fiClientPayAndCreate', { type: 'success' }),
    awaitRpc('fiClientPayAndCreate', PAY_AND_CREATE),
    checkpoint('paid'),
]

const TO_DKG = [
    'preparing',
    'awaitingPaymentReadiness',
    'acquiringSeats',
    'preparingDkg',
    'dkgUnderway',
] as const

export const formationHappyPath: FiScript = script('formation.happyPath', [
    ...PAY_AND_CREATE_STEPS,
    ...walk([...TO_DKG, 'publishingSeatBindings']),
    stream(ctx => formationStatus(formationAt(ctx, 'formed'))),
    formWalletService('joining'),
    checkpoint('formedJoining'),
    wait(PHASE_MS),
    formWalletService('ready'),
    checkpoint('formed'),
])

/** Payment through to a joined wallet service, for scripts that begin earlier. */
export const FORMATION_FROM_PAYMENT: FiStep[] = formationHappyPath.steps

export const formationFails: FiScript = script('formation.fails', [
    ...PAY_AND_CREATE_STEPS,
    ...walk(TO_DKG),
    stream(ctx =>
        formationStatus(
            withError(formationAt(ctx, 'dkgUnderway'), 'fleetManager'),
        ),
    ),
    checkpoint('retrying'),
])

export const formationFailsTerminally: FiScript = script(
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

export const formationReconnecting: FiScript = script(
    'formation.reconnecting',
    [
        stream(ctx =>
            formationStatus(withUnsynced(formationAt(ctx, 'formed'))),
        ),
        formWalletService('ready'),
        checkpoint('reconnecting'),
    ],
)

export const formationCreatedJoinFails: FiScript = script(
    'formation.createdJoinFails',
    [
        ...PAY_AND_CREATE_STEPS,
        ...walk([...TO_DKG, 'publishingSeatBindings']),
        stream(ctx => formationStatus(formationAt(ctx, 'formed'))),
        formWalletService('joining'),
        formWalletService('failed'),
        checkpoint('joinFailed'),
    ],
)

export const formationAlreadyFormed: FiScript = script(
    'formation.alreadyFormed',
    [
        stream(ctx => formationStatus(formationAt(ctx, 'formed'))),
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

const authorizeScript = (name: string, amountSats: number): FiScript =>
    script(name, [
        ...PAY_AND_CREATE_STEPS,
        ...walk(['preparing', 'awaitingPaymentReadiness']),
        authorizeAt(amountSats),
        checkpoint('authorize'),
        awaitRpc('fiClientAuthorizeReplacementPayments', {
            authorizationId: AUTHORIZATION_ID,
        }),
        wait(PHASE_MS),
        ...walk(['preparingDkg', 'dkgUnderway', 'publishingSeatBindings']),
        stream(ctx => formationStatus(formationAt(ctx, 'formed'))),
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
    awaitRpc('fiClientApplyReplacements', {
        previewId: 'replacement_preview_script',
    }),
    wait(PHASE_MS),
    ...walk(['publishingSeatBindings']),
    stream(ctx => formationStatus(formationAt(ctx, 'formed'))),
    formWalletService('ready'),
    checkpoint('formed'),
]

export const formationGuardianDroppedOut: FiScript = script(
    'formation.guardianDroppedOut',
    REPLACEMENT_STEPS,
)

export const formationGuardianDroppedOutNoCandidates: FiScript = script(
    'formation.guardianDroppedOutNoCandidates',
    [
        stub('fiClientPreviewReplacements', () => ({
            type: 'error',
            error: {
                code: 'selection',
                message: 'not enough verified replacement candidates',
                detail: {
                    type: 'insufficientFmanSeats',
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

export const FORMATION_SCRIPTS: FiScript[] = [
    formationHappyPath,
    formationFails,
    formationFailsTerminally,
    formationReconnecting,
    formationCreatedJoinFails,
    formationAlreadyFormed,
    formationAuthorizePayments,
    formationAuthorizePaymentsShort,
    formationGuardianDroppedOut,
    formationGuardianDroppedOutNoCandidates,
]
