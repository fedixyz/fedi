/**
 * Stable Fedi-owned routing contract for a Manifold formation update.
 *
 * These values are notification hints only. After a match, callers must open
 * the federation-creation workflow and recover from `faClientStatus` and
 * `faClientResume`; no notification field is authoritative formation state.
 */
export const FA_FORMATION_PUSH_ROUTE = {
    kind: 'fi_formation_update',
    'pg.open_behavior': 'open_workflow',
    'pg.privacy': 'display_text',
    'pg.workflow': 'federation_creation',
    'pg.action': 'resume',
} as const

export type FaFormationPushRoute = typeof FA_FORMATION_PUSH_ROUTE

/**
 * Strictly recognizes the Fedi-owned route while tolerating gateway-owned
 * notification identifiers and future non-routing data fields.
 */
export function parseFaFormationPushRoute(
    value: unknown,
): FaFormationPushRoute | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null
    }
    const data = value as Record<string, unknown>
    for (const [key, expected] of Object.entries(FA_FORMATION_PUSH_ROUTE)) {
        if (data[key] !== expected) return null
    }
    return FA_FORMATION_PUSH_ROUTE
}
