import { RpcSPv2CachedSyncResponse } from './bindings'

// Only the fields from RpcSPv2CachedSyncResponse
// that are needed for the legacy stability pool ui
export type StabilityPoolState = Pick<
    RpcSPv2CachedSyncResponse,
    // Price in cents per BTC
    | 'currCycleStartPrice'
    | 'stagedBalance'
    | 'lockedBalance'
    | 'idleBalance'
    | 'pendingUnlockRequest'
>

export type Spv2ParsedPaymentAddress = {
    address: string
    accountId: string
}
