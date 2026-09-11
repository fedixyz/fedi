import type {
    RpcFiLiquidityNetwork,
    RpcFiLiquidityOperation,
} from '@fedi/common/types/bindings'

import type { MockJoinableWalletService } from './mockPayerFederation'

/**
 * What a script may read or set on the simulator between steps. Kept to
 * state, never behaviour: a script that wants a different answer to an RPC
 * stubs that RPC.
 */
export interface FiWorld {
    /** The simulator's own answer, with no script reply or stub in the way. */
    defaultHandle(
        method: string,
        payload: Record<string, unknown>,
    ): Promise<unknown>
    setSeatPriceMsats(msats: number): void
    setFleet(fleet: { eligible: number; seen: number }): void
    setPreviewValiditySecs(secs: number): void
    setJoinableWalletServices(services: MockJoinableWalletService[]): void
    setLiquidityNetwork(network: RpcFiLiquidityNetwork): void
    /** Stand up the single live liquidity operation, as if the app had started it. */
    startLiquidity(options: { verified: boolean }): void
    currentLiquidityOperation(): RpcFiLiquidityOperation | null
    eligiblePayerIds(): string[]
}
