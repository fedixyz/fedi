import { RpcSPv2CachedSyncResponse } from './bindings'

// Only the fields from RpcSPv2CachedSyncResponse
// that are needed for the legacy stability pool ui
export type StabilityPoolState = Pick<
    RpcSPv2CachedSyncResponse,
    // Price in cents per BTC
    | 'currCycleStartPrice'
    | 'staged'
    | 'locked'
    | 'idleBalance'
    | 'pendingUnlock'
>

// The bitcoin send methods, in the order the Send screen shows them
export const SEND_METHODS = ['lightning', 'onchain', 'ecash'] as const

export type SendMethod = (typeof SEND_METHODS)[number]

export type Spv2ParsedPaymentAddress = {
    address: string
    accountId: string
}
