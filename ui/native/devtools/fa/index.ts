import type { StorageApi } from '@fedi/common/types'
import type { FedimintBridge } from '@fedi/common/utils/fedimint'
import { makeLog } from '@fedi/common/utils/log'

import { FaPlayer } from './player'
import { findFaScreen, type FaScreen } from './screens'
import { findFaScript } from './scripts'
import { FaSimulator } from './simulator'
import type { FaScript } from './steps'
import {
    DEFAULT_FA_DEV_SWITCHES,
    FaDevSwitches,
    loadFaDevSwitches,
    saveFaDevSwitches,
} from './switches'
import { withFaSimulator } from './transport'

const log = makeLog('native/devtools/fa')

export { FaSimulator } from './simulator'
export { withFaSimulator } from './transport'
export {
    makeMockPayerFederation,
    MOCK_PAYER_FEDERATIONS,
    MOCK_PAYER_FEDERATION_IDS,
    type MockPayerFederation,
} from './mockPayerFederation'
export { FA_SCREEN_GROUPS, type FaScreen, type FaScreenRoute } from './screens'
export { FA_SCRIPT_GROUPS, findFaScript, type FaScriptGroup } from './scripts'

type BridgeRpc = <T = void>(method: string, payload: object) => Promise<T>

export interface FaDevTools {
    rpc: BridgeRpc
    simulator: FaSimulator
    getSwitches(): FaDevSwitches
    setSwitches(next: FaDevSwitches): Promise<void>
    ready: Promise<void>
    attachBridge(fedimint: FedimintBridge): void
    player: FaPlayer
    /** Reset the simulated timeline and jump the named screen's script to its checkpoint. */
    jumpTo(screenId: string): Promise<FaScreen>
    /** Reset the simulator and run a script from its first step with real timing. */
    play(scriptName: string): FaScript
}

export function attachFaDevTools(
    realRpc: BridgeRpc,
    storage: StorageApi,
): FaDevTools {
    const simulator = new FaSimulator()
    const player = new FaPlayer(simulator)
    let switches: FaDevSwitches = DEFAULT_FA_DEV_SWITCHES
    const apply = (next: FaDevSwitches) => {
        switches = next
        // seeding a mock payer announces it as a federation join straight to
        // redux, which never passes the rpc gate below, so an off simulator
        // has to seed nothing
        simulator.setPayerSource(
            next.simulator === 'on' ? next.payerSource : 'none',
        )
    }
    apply(switches)
    const ready = loadFaDevSwitches(storage).then(apply)
    return {
        rpc: withFaSimulator(
            realRpc,
            simulator,
            () => switches.simulator === 'on',
        ),
        simulator,
        getSwitches: () => switches,
        setSwitches: async next => {
            apply(next)
            await saveFaDevSwitches(storage, next)
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
            const screen = findFaScreen(screenId)
            if (!screen) throw new Error(`unknown screen "${screenId}"`)
            simulator.reset()
            // the run resolves when the script ends; a script that waits for
            // the user after the checkpoint keeps running in the background
            player
                .run(screen.script, { jumpTo: screen.checkpoint })
                .catch(e => log.warn('fi script failed', e))
            return screen
        },
        play: scriptName => {
            const target = findFaScript(scriptName)
            if (!target) throw new Error(`unknown script "${scriptName}"`)
            simulator.reset()
            player.run(target, {}).catch(e => log.warn('fi script failed', e))
            return target
        },
    }
}

export * from './switches'
