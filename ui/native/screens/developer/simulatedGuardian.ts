import type { GuardianStatus } from '@fedi/common/types/bindings'

export const simulatedGuardian = (
    guardian: string,
    isResponding: boolean,
    mg_name: string | null = null,
): GuardianStatus =>
    isResponding
        ? { online: { guardian, mg_name, latency_ms: 0 } }
        : { timeout: { guardian, mg_name, elapsed: 'simulated' } }
