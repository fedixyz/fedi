import type {
    RpcFaGuardianTransfer,
    RpcFaLiquidityNetwork,
    RpcFaLiquidityOperation,
} from '@fedi/common/types/bindings'

import type { MockJoinableWalletService } from './mockPayerFederation'

/**
 * What a script may read or set on the simulator between steps. Kept to
 * state, never behaviour: a script that wants a different answer to an RPC
 * stubs that RPC.
 */
export interface FaWorld {
    /** The simulator's own answer, with no script reply or stub in the way. */
    defaultHandle(
        method: string,
        payload: Record<string, unknown>,
    ): Promise<unknown>
    setSeatPriceMsats(msats: number): void
    setFleet(fleet: { eligible: number; seen: number }): void
    setPreviewValiditySecs(secs: number): void
    setJoinableWalletServices(services: MockJoinableWalletService[]): void
    setLiquidityNetwork(network: RpcFaLiquidityNetwork): void
    /** The move the transfer stream reports; `null` for none open. */
    setGuardianTransfer(transfer: RpcFaGuardianTransfer | null): void
    /** Stand up the single live liquidity operation, as if the app had started it. */
    startLiquidity(options: { verified: boolean }): void
    currentLiquidityOperation(): RpcFaLiquidityOperation | null
    eligiblePayerIds(): string[]
}
