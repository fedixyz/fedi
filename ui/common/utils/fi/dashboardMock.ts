/**
 * Stand-in data for the dashboard figures the bridge cannot answer yet.
 *
 * Story 09 is backend-blocked: nothing exposes steady-state guardian health
 * (`RpcFiSeatProgress.phase` describes formation only). This shape is what the
 * bridge would plausibly return, so swapping this module for a real RPC is a
 * change of source, not of the screen.
 *
 * Guardian health is deliberately two independent numbers: the design has
 * slots for divergence, and collapsing them to one would hide an outage.
 *
 * The service-earnings mock that used to live here is gone. The operator's fee
 * earnings are real, and the guardian fees dashboard reads them from the
 * bridge, so nothing needs to stand in for them.
 */

export interface MockFiServiceHealth {
    isLive: boolean
    /** The total is real — only the online count has no source. */
    onlineGuardians: number
}

export const MOCK_FI_SERVICE_HEALTH: MockFiServiceHealth = {
    isLive: true,
    onlineGuardians: 10,
}
