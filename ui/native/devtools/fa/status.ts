import type {
    RpcFaErrorCode,
    RpcFaFormationPhase,
    RpcFaFormationFreshness,
    RpcFaFormationSnapshot,
    RpcFaFormedFederation,
    RpcFaFormedOrigin,
    RpcFaSeatPhase,
    RpcFaStatus,
} from '@fedi/common/types/bindings'

export type FormationPhaseName = RpcFaFormationPhase

/** Ordered formation timeline; a phase added in Rust is a compile error here. */
export const FORMATION_PHASES: FormationPhaseName[] = [
    'preparing',
    'awaitingPaymentReadiness',
    'acquiringSeats',
    'preparingDkg',
    'dkgUnderway',
    'dkgComplete',
    'publishingSeatBindings',
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

export const IDLE_STATUS: RpcFaStatus = { type: 'idle' }

export const seatPhaseFor = (phase: FormationPhaseName): RpcFaSeatPhase => {
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
): RpcFaFormationSnapshot {
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
            const mgId = `mg_${seed.formationId}_${i}`
            return {
                index: i,
                mgId,
                mgName: `guardian ${i + 1}`,
                locator: JSON.stringify({ v: 1, mgId }),
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
        },
        inviteCode: null,
        lastError: null,
    }
}

export function withError(
    formation: RpcFaFormationSnapshot,
    code: RpcFaErrorCode,
): RpcFaFormationSnapshot {
    return { ...formation, lastError: code }
}

export function withUnsynced<
    T extends RpcFaFormationSnapshot | RpcFaFormedFederation,
>(snapshot: T): T {
    return { ...snapshot, freshness: 'unsynced' }
}

export function formationStatus(
    formation: RpcFaFormationSnapshot,
): RpcFaStatus {
    return { type: 'formation', formation }
}

const SATS_TO_MSATS = 1_000

export function withAuthorization(
    formation: RpcFaFormationSnapshot,
    {
        authorizationId,
        amountSats,
        payerFederationId,
    }: {
        authorizationId: string
        amountSats: number
        payerFederationId: string
    },
): RpcFaFormationSnapshot {
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
                    mgId: seat.mgId,
                    mgName: seat.mgName,
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
    formation: RpcFaFormationSnapshot,
    { replacementId }: { replacementId: string },
): RpcFaFormationSnapshot {
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
                        previousMgId: refused.mgId,
                        previousMgName: refused.mgName,
                        previousQuoteId: `quote_${refused.index}`,
                        previousLocator: refused.locator,
                    },
                ],
            },
        },
    }
}

const inviteFor = (formationId: string) =>
    `fed1${'sim'.padEnd(40, '0')}${formationId}`

/**
 * The federation a completed formation becomes. The bridge reports it as a
 * `formed` status rather than a formation phase, carrying only the seats'
 * identities: every seat has its MG and its seat by then.
 */
export function formedFrom(
    formation: RpcFaFormationSnapshot,
    {
        freshness,
        backupEligible,
        origin,
    }: {
        freshness: RpcFaFormationFreshness
        backupEligible: boolean
        origin: RpcFaFormedOrigin
    },
): RpcFaFormedFederation {
    return {
        formationId: formation.formationId,
        federationInvite: inviteFor(formation.formationId),
        federationName: formation.intent.federationName,
        seats: formation.seats.map(({ index, mgId, seatId, locator }) => {
            if (mgId === null || seatId === null)
                throw new Error(`seat ${index} has no MG or seat to form`)
            return { mgId, seatId, locator }
        }),
        freshness,
        backupEligible,
        origin,
    }
}

/**
 * The federation this device formed: setup ran here, so the seats were
 * checked against it and it is backup eligible from the start.
 */
export function formedAt(seed: FormationSeed): RpcFaFormedFederation {
    return formedFrom(formationAt(seed, 'publishingSeatBindings'), {
        freshness: 'fresh',
        backupEligible: true,
        origin: 'thisDevice',
    })
}

export function formedStatus(federation: RpcFaFormedFederation): RpcFaStatus {
    return { type: 'formed', federation }
}

export type RestoredSeed = { formationId: string }

const RESTORED_SEAT_COUNT = 10

/**
 * A federation imported from a backup found for this seed. It is `unsynced`
 * and not backup eligible until its first reconciliation; the backup carries
 * no name either, and reconciliation learns it, which is why the name is an
 * option rather than a default.
 */
export function restoredStatus(
    seed: RestoredSeed,
    {
        freshness,
        backupEligible,
        federationName = null,
    }: {
        freshness: RpcFaFormationFreshness
        backupEligible: boolean
        federationName?: string | null
    },
): RpcFaStatus {
    const formation = formationAt(
        { formationId: seed.formationId, federationSize: RESTORED_SEAT_COUNT },
        'publishingSeatBindings',
    )
    return formedStatus({
        ...formedFrom(formation, {
            freshness,
            backupEligible,
            origin: 'backup',
        }),
        federationName,
    })
}
