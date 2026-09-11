import {
    formationAt,
    formationStatus,
    withError,
    withUnsynced,
} from '../status'
import {
    FiScript,
    awaitRpc,
    checkpoint,
    formWalletService,
    reply,
    script,
    stream,
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

const start = [
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
    ...start,
    ...walk([...TO_DKG, 'publishingSeatBindings']),
    stream(ctx => formationStatus(formationAt(ctx, 'formed'))),
    formWalletService('joining'),
    checkpoint('formedJoining'),
    wait(PHASE_MS),
    formWalletService('ready'),
    checkpoint('formed'),
])

export const formationFails: FiScript = script('formation.fails', [
    ...start,
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
        ...start,
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
        ...start,
        ...walk([...TO_DKG, 'publishingSeatBindings']),
        stream(ctx => formationStatus(formationAt(ctx, 'formed'))),
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

export const FORMATION_SCRIPTS: FiScript[] = [
    formationHappyPath,
    formationFails,
    formationFailsTerminally,
    formationReconnecting,
    formationCreatedJoinFails,
    formationAlreadyFormed,
]
