import type {
    RpcFiErrorCode,
    RpcFiFormationSnapshot,
    RpcFiSeatPhase,
    RpcFiStatus,
} from '../../types/bindings'
import { FORMATION_PHASES, FormationPhaseName } from './scenarios'

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

// mirrors the seat phase the knob simulator assigns per formation phase
const seatPhaseFor = (phase: FormationPhaseName): RpcFiSeatPhase => {
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
