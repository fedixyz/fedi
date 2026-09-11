import type { StorageApi } from '../../types'
import type { FedimintBridge } from '../../utils/fedimint'
import { makeLog } from '../../utils/log'
import { FiPlayer } from './player'
import { findFiScreen, type FiScreen } from './screens'
import { FiSimulator } from './simulator'
import {
    DEFAULT_FI_DEV_SWITCHES,
    FiDevSwitches,
    loadFiDevSwitches,
    saveFiDevSwitches,
} from './switches'
import { withFiSimulator } from './transport'

const log = makeLog('common/devtools/fi')

export { FiSimulator } from './simulator'
export { withFiSimulator, createSimulatedBridge } from './transport'
export {
    makeMockPayerFederation,
    MOCK_PAYER_FEDERATIONS,
    MOCK_PAYER_FEDERATION_IDS,
    type MockPayerFederation,
} from './mockPayerFederation'
export {
    fiScenarios,
    FORMATION_PHASES,
    DEFAULT_FI_SCENARIO,
    FI_SCENARIO_GROUPS,
    FI_SCENARIO_STORYBOARD_FRAMES,
    type FiScenario,
    type FiScenarioName,
    type FormationPhaseName,
} from './scenarios'
export {
    MOCK_FI_SERVICE_HEALTH,
    type MockFiServiceHealth,
} from './dashboardMock'
export { FI_SCREEN_GROUPS, type FiScreen, type FiScreenRoute } from './screens'

type BridgeRpc = <T = void>(method: string, payload: object) => Promise<T>

export interface FiDevTools {
    rpc: BridgeRpc
    simulator: FiSimulator
    getSwitches(): FiDevSwitches
    setSwitches(next: FiDevSwitches): Promise<void>
    ready: Promise<void>
    attachBridge(fedimint: FedimintBridge): void
    player: FiPlayer
    /** Reset the simulated timeline and jump the named screen's script to its checkpoint. */
    jumpTo(screenId: string): Promise<FiScreen>
}

export function attachFiDevTools(
    realRpc: BridgeRpc,
    storage: StorageApi,
): FiDevTools {
    const simulator = new FiSimulator()
    const player = new FiPlayer(simulator)
    let switches: FiDevSwitches = DEFAULT_FI_DEV_SWITCHES
    const apply = (next: FiDevSwitches) => {
        switches = next
        simulator.setPayerSource(next.payerSource)
    }
    apply(switches)
    const ready = loadFiDevSwitches(storage).then(apply)
    return {
        rpc: withFiSimulator(
            realRpc,
            simulator,
            () => switches.simulator === 'on',
        ),
        simulator,
        getSwitches: () => switches,
        setSwitches: async next => {
            apply(next)
            await saveFiDevSwitches(storage, next)
        },
        ready,
        attachBridge: fedimint =>
            simulator.attach(
                update => fedimint.emit('streamUpdate', update),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (event, payload) => fedimint.emit(event as any, payload as any),
            ),
        player,
        jumpTo: async screenId => {
            const screen = findFiScreen(screenId)
            if (!screen) throw new Error(`unknown screen "${screenId}"`)
            simulator.reset()
            // the run resolves when the script ends; a script that waits for
            // the user after the checkpoint keeps running in the background
            player
                .run(screen.script, { jumpTo: screen.checkpoint })
                .catch(e => log.warn('fi script failed', e))
            return screen
        },
    }
}

export * from './switches'
