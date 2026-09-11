import type {
    RpcFiErrorCode,
    RpcFiFormationPhase,
    RpcFiFormationSnapshot,
    RpcFiSeatPhase,
    RpcFiStatus,
} from '@fedi/common/types/bindings'

export type FormationPhaseName = RpcFiFormationPhase

/** Ordered formation timeline; a phase added in Rust is a compile error here. */
export const FORMATION_PHASES: FormationPhaseName[] = [
    'preparing',
    'awaitingPaymentReadiness',
    'acquiringSeats',
    'preparingDkg',
    'dkgUnderway',
    'publishingSeatBindings',
    'formed',
]

export type FormationSeed = {
    formationId: string
    federationName?: string
    federationSize?: number
    seatPriceMsats?: number
}

const DEFAULT_FEDERATION_NAME = 'My Wallet Service'
const DEFAULT_FEDERATION_SIZE = 4
const DEFAULT_SEAT_PRICE_MSATS = 2_100_000

export const IDLE_STATUS: RpcFiStatus = { type: 'idle' }

export const seatPhaseFor = (phase: FormationPhaseName): RpcFiSeatPhase => {
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

const phaseIndex = (phase: FormationPhaseName) =>
    FORMATION_PHASES.indexOf(phase)

export function formationAt(
    seed: FormationSeed,
    phase: FormationPhaseName,
): RpcFiFormationSnapshot {
    const size = seed.federationSize ?? DEFAULT_FEDERATION_SIZE
    const price = seed.seatPriceMsats ?? DEFAULT_SEAT_PRICE_MSATS
    const index = phaseIndex(phase)
    const reached = (p: FormationPhaseName) => index >= phaseIndex(p)
    const seatPhase = seatPhaseFor(phase)
    return {
        formationId: seed.formationId,
        phase,
        intent: {
            federationName: seed.federationName ?? DEFAULT_FEDERATION_NAME,
            federationSize: size,
            guardianFeePpm: 0,
            plan: 'infiniteBestEffort',
            maxTotalMsats: String(size * price),
        },
        seats: Array.from({ length: size }, (_, i) => {
            const fmanId = `fman_${seed.formationId}_${i}`
            return {
                index: i,
                fmanId,
                fmanName: `guardian ${i + 1}`,
                locator: JSON.stringify({ v: 1, fmanId }),
                seatId: reached('acquiringSeats') ? `seat_${i}` : null,
                guardianCode: reached('preparingDkg') ? `code_${i}` : null,
                phase: seatPhase,
                freshness: 'fresh',
            }
        }),
        freshness: 'fresh',
        actionRequired: null,
        paymentOutputsStarted: reached('acquiringSeats'),
        milestones: {
            ecashSent: reached('acquiringSeats'),
            guardiansConfirmed: reached('dkgUnderway'),
            walletServiceCreated: phase === 'formed',
        },
        inviteCode:
            phase === 'formed'
                ? `fed1${'sim'.padEnd(40, '0')}${seed.formationId}`
                : null,
        lastError: null,
    }
}

export function withError(
    formation: RpcFiFormationSnapshot,
    code: RpcFiErrorCode,
): RpcFiFormationSnapshot {
    return { ...formation, lastError: code }
}

export function withUnsynced(
    formation: RpcFiFormationSnapshot,
): RpcFiFormationSnapshot {
    return { ...formation, freshness: 'unsynced' }
}

export function formationStatus(
    formation: RpcFiFormationSnapshot,
): RpcFiStatus {
    return { type: 'formation', formation }
}

const SATS_TO_MSATS = 1_000

export function withAuthorization(
    formation: RpcFiFormationSnapshot,
    {
        authorizationId,
        amountSats,
        payerFederationId,
    }: {
        authorizationId: string
        amountSats: number
        payerFederationId: string
    },
): RpcFiFormationSnapshot {
    const totalMsats = amountSats * SATS_TO_MSATS
    const seats = formation.seats.slice(0, 3)
    return {
        ...formation,
        paymentOutputsStarted: true,
        actionRequired: {
            type: 'authorizePayments',
            requirements: {
                authorizationId,
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
        },
    }
}

/** Seat 0 is refused: it regresses and the decision parks for the user. */
export function withReplacement(
    formation: RpcFiFormationSnapshot,
    { replacementId }: { replacementId: string },
): RpcFiFormationSnapshot {
    const [refused, ...rest] = formation.seats
    return {
        ...formation,
        seats: [{ ...refused, phase: 'replacementRequired' }, ...rest],
        milestones: { ...formation.milestones, guardiansConfirmed: false },
        actionRequired: {
            type: 'replaceGuardians',
            requirements: {
                replacementId,
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
        },
    }
}

export type RestoredSeed = { formationId: string }

const RESTORED_SEAT_COUNT = 10

/**
 * A backup found for this seed. The backup carries no name; reconciliation
 * learns it, which is why the name is an option rather than a default.
 */
export function restoredStatus(
    seed: RestoredSeed,
    {
        freshness,
        backupEligible = false,
        federationName = null,
    }: {
        freshness: 'fresh' | 'unsynced'
        backupEligible?: boolean
        federationName?: string | null
    },
): RpcFiStatus {
    return {
        type: 'restored',
        formation: {
            snapshotGeneration: 3,
            formationId: seed.formationId,
            federationInvite: `fed1${'sim'.padEnd(40, '0')}${seed.formationId}`,
            federationName,
            seats: Array.from({ length: RESTORED_SEAT_COUNT }, (_, index) => ({
                fmanId: `fman_${seed.formationId}_${index}`,
                seatId: `seat_${index}`,
                locator: '{"version":1}',
            })),
            phase: 'formed',
            freshness,
            backupEligible,
        },
    }
}
