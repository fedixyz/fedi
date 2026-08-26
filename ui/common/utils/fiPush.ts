/**
 * Stable Fedi-owned routing contract for a Manifold formation update.
 *
 * These values are notification hints only. After a match, callers must open
 * the federation-creation workflow and recover from `fiClientStatus` and
 * `fiClientResume`; no notification field is authoritative formation state.
 */
export const FI_FORMATION_PUSH_ROUTE = {
    kind: 'fi_formation_update',
    'pg.open_behavior': 'open_workflow',
    'pg.privacy': 'display_text',
    'pg.workflow': 'federation_creation',
    'pg.action': 'resume',
} as const

export type FiFormationPushRoute = typeof FI_FORMATION_PUSH_ROUTE

/**
 * Strictly recognizes the Fedi-owned route while tolerating gateway-owned
 * notification identifiers and future non-routing data fields.
 */
export function parseFiFormationPushRoute(
    value: unknown,
): FiFormationPushRoute | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null
    }
    const data = value as Record<string, unknown>
    for (const [key, expected] of Object.entries(FI_FORMATION_PUSH_ROUTE)) {
        if (data[key] !== expected) return null
    }
    return FI_FORMATION_PUSH_ROUTE
}
