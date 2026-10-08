import type { GuardianStatus } from '@fedi/common/types/bindings'

export const simulatedGuardian = (
    guardian: string,
    isResponding: boolean,
    fman_name: string | null = null,
): GuardianStatus =>
    isResponding
        ? { online: { guardian, fman_name, latency_ms: 0 } }
        : { timeout: { guardian, fman_name, elapsed: 'simulated' } }
