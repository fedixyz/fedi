import { FederationStatus } from '../types'
import { GuardianStatus } from '../types/bindings'

export const GUARDIAN_REFRESH_INTERVAL = 35_000
// match GUARDIAN_STATUS_CACHE_TTL_SECS in the bridge to avoid reusing a probe.
export const GUARDIAN_CACHE_TTL = 30_000
const MAX_OBSERVATION_GAP = 150_000
const OFFLINE_DELAY = 3 * 60_000
const PARTIAL_REACHABILITY_DELAY = 6 * 60_000

export type FederationHealth = {
    guardians: GuardianStatus[]
    checkedAt: number
    belowQuorumSince?: number
    partialSince?: number
}

export function observeFederationHealth(
    guardians: GuardianStatus[],
    checkedAt: number,
    previous?: FederationHealth,
    previousStatus: FederationStatus = 'unknown',
): { health: FederationHealth; status: FederationStatus } {
    const continues =
        previous &&
        checkedAt >= previous.checkedAt &&
        checkedAt - previous.checkedAt <= MAX_OBSERVATION_GAP &&
        guardians.length === previous.guardians.length &&
        guardians.every(
            (guardian, index) =>
                Object.values(guardian)[0].guardian ===
                Object.values(previous.guardians[index])[0].guardian,
        )
    const health: FederationHealth = { guardians, checkedAt }
    if (guardians.length === 0) return { health, status: 'unknown' }

    const online = guardians.filter(g => 'online' in g).length
    const quorum = guardians.length - Math.floor((guardians.length - 1) / 3)
    if (online === guardians.length) {
        return { health, status: 'online' }
    }

    health.partialSince = continues
        ? (previous.partialSince ?? checkedAt)
        : checkedAt
    if (online < quorum) {
        health.belowQuorumSince = continues
            ? (previous.belowQuorumSince ?? checkedAt)
            : checkedAt
        return {
            health,
            status:
                checkedAt - health.belowQuorumSince >= OFFLINE_DELAY
                    ? 'offline'
                    : continues
                      ? previousStatus
                      : 'unknown',
        }
    }

    return {
        health,
        status:
            checkedAt - health.partialSince >= PARTIAL_REACHABILITY_DELAY ||
            (continues &&
                (previousStatus === 'offline' || previousStatus === 'unstable'))
                ? 'unstable'
                : continues
                  ? previousStatus
                  : 'unknown',
    }
}
