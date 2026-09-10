import type { MSats } from '../../types'
import { FedimintBridge } from '../../utils/fedimint'
import { FiScenarioName } from './scenarios'
import { FiSimulator } from './simulator'

type BridgeRpc = <T = void>(method: string, payload: object) => Promise<T>

/**
 * Wrap a bridge transport so the FI methods resolve from {@link FiSimulator}
 * and everything else reaches the real bridge untouched.
 *
 * Interception happens at the transport, below `FedimintBridge`, so screens,
 * redux and the generated method wrappers are all unaware of it. Selective
 * delegation matters: the top-up step needs real `generateInvoice`,
 * `payInvoice` and `joinFederation` against real dev federations — only the
 * `fi*` family is unavailable in dev.
 *
 * Removing the simulator is deleting the `withFiSimulator(...)` call.
 */
export function withFiSimulator(
    realRpc: BridgeRpc,
    simulator: FiSimulator,
    isEnabled: () => boolean = () => true,
): BridgeRpc {
    return async function simulatedRpc<T = void>(
        method: string,
        payload: object,
    ): Promise<T> {
        if (!isEnabled()) return realRpc<T>(method, payload)
        const args = payload as Record<string, unknown>
        if (!simulator.handles(method, args)) {
            const result = await realRpc<T>(method, payload)
            // the payer picker can only offer wallets the app holds, so the
            // simulator needs the real federation ids rather than invented ones
            if (method === 'listFederations' && Array.isArray(result)) {
                // observe the real ids only: a mock payer is not a wallet the
                // app joined
                simulator.observeFederations(
                    result
                        .filter((f): f is { id: string; balance?: MSats } =>
                            Boolean((f as { id?: string }).id),
                        )
                        .map(f => ({
                            id: f.id,
                            balance: f.balance ?? (0 as MSats),
                        })),
                )
                // seeded mock wallets ride along on every refresh, so the
                // wholesale replace that follows cannot drop them. Never gated
                // on the payer source: this list also carries the formed wallet
                // service's own federation, which the app holds whoever pays
                const mocks = simulator.listMockFederations()
                if (mocks.length) return [...result, ...mocks] as unknown as T
            }
            // the join flow asks whether the new wallet can pay for setup
            // before the next `listFederations` lands, so the join itself is
            // what the simulator has to hear about
            if (method === 'joinFederation') {
                const id = (result as { id?: string } | undefined)?.id
                if (id) simulator.observeJoinedFederation(id)
            }
            return result
        }
        return (await simulator.handle(method, args)) as T
    }
}

/**
 * Build a bridge whose FI surface is simulated.
 *
 * Used by the dev toggle and by flow tests that need real state transitions
 * rather than per-method stubs.
 */
export function createSimulatedBridge(
    scenario?: FiScenarioName,
    realRpc: BridgeRpc = notImplementedRpc,
): { fedimint: FedimintBridge; simulator: FiSimulator } {
    const simulator = new FiSimulator(scenario)
    const fedimint = new FedimintBridge(withFiSimulator(realRpc, simulator))
    // the bridge routes `streamUpdate` to the handler `rpcStream` registered,
    // so the simulator drives subscriptions through the same public path the
    // native event emitter uses
    simulator.attach(
        update => fedimint.emit('streamUpdate', update),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (event, payload) => fedimint.emit(event as any, payload as any),
    )
    return { fedimint, simulator }
}

const notImplementedRpc: BridgeRpc = method => {
    return Promise.reject(
        new Error(`no real bridge behind the simulator for "${method}"`),
    )
}
