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

export const guardianQuorum = (total: number) =>
    total - Math.floor((total - 1) / 3)

export const readGuardianStatus = (status: GuardianStatus) => {
    const { guardian, fman_name } = Object.values(status)[0]
    return { guardian, fman_name, isResponding: 'online' in status }
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
                readGuardianStatus(guardian).guardian ===
                readGuardianStatus(previous.guardians[index]).guardian,
        )
    const health: FederationHealth = { guardians, checkedAt }
    if (guardians.length === 0) return { health, status: 'unknown' }

    const online = guardians.filter(
        g => readGuardianStatus(g).isResponding,
    ).length
    const quorum = guardianQuorum(guardians.length)
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
