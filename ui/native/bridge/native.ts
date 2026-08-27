import { NativeEventEmitter, NativeModules } from 'react-native'
import RNFS from 'react-native-fs'

import { FedimintBridgeEventMap } from '@fedi/common/types'
import { RpcAppFlavor, RpcInitOpts } from '@fedi/common/types/bindings'
import { isDev } from '@fedi/common/utils/environment'
import { BridgeError } from '@fedi/common/utils/errors'
import { FedimintBridge } from '@fedi/common/utils/fedimint'
import { FiSimulator, withFiSimulator } from '@fedi/common/utils/fi'
import { makeLog } from '@fedi/common/utils/log'

import { isEdge, isExperimental } from '../utils/device-info'

const { BridgeNativeEventEmitter, FedimintFfi } = NativeModules

const log = makeLog('native/bridge')

async function fedimintRpc<Type = void>(
    method: string,
    payload: object,
): Promise<Type> {
    log.info(`fedimintRpc ${method}`)
    const startTime = global.performance.now()
    const jsonPayload = JSON.stringify(payload)
    const json: string = await new Promise(resolve => {
        setTimeout(() => resolve(FedimintFfi.rpc(method, jsonPayload)))
    })
    const parsed = JSON.parse(json)
    if (parsed.error) {
        throw new BridgeError(parsed)
    } else {
        log.info(
            `fedimintRpc ${method} resolved in ${Number(global.performance.now() - startTime).toFixed(0)}ms`,
        )
        return parsed.result
    }
}

/**
 * The FI backend cannot complete a formation in dev — the environment ships a
 * placeholder trust root — so dev builds resolve the `fiClient*` family from an
 * in-memory simulator instead. Every other RPC still reaches the real bridge,
 * which is what lets the top-up step move real ecash between real dev
 * federations.
 *
 * Deleting this block is the whole job of switching to the real backend.
 */
export const fiSimulator: FiSimulator | null = isDev()
    ? new FiSimulator()
    : null

export const fedimint = new FedimintBridge(
    fiSimulator ? withFiSimulator(fedimintRpc, fiSimulator) : fedimintRpc,
)

fiSimulator?.attach(
    update => fedimint.emit('streamUpdate', update),
    // the simulated money rails speak in bridge events, not RPC replies
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (event, payload) => fedimint.emit(event as any, payload as any),
)

export async function subscribeToBridgeEvents() {
    // Pass through all native bridge events to the FedimintBridge class instance
    const emitter = new NativeEventEmitter(BridgeNativeEventEmitter)
    const eventTypes: (keyof FedimintBridgeEventMap)[] =
        await FedimintFfi.getSupportedEvents()

    // returns an array of subscriptions to unsubscribe later
    return eventTypes.map(eventType =>
        emitter.addListener(eventType, (serializedEvent: string) => {
            fedimint.emit(eventType, JSON.parse(serializedEvent))
        }),
    )
}

export async function unsubscribeFromBridgeEvents(
    subscriptions: Awaited<ReturnType<typeof subscribeToBridgeEvents>>,
) {
    subscriptions.forEach(s => s.remove())
}

export const getAppFlavor = (): RpcAppFlavor['type'] => {
    return isDev()
        ? 'dev'
        : isEdge()
          ? 'edge'
          : isExperimental()
            ? 'nightly'
            : 'bravo'
}

export async function initializeBridge(
    deviceId: string,
    appFlavor: RpcAppFlavor['type'],
) {
    const options: RpcInitOpts = {
        dataDir: RNFS.DocumentDirectoryPath,
        deviceIdentifier: deviceId,
        logLevel: 'info',
        appFlavor: { type: appFlavor },
    }
    log.info(
        'initializing connection to federation',
        RNFS.DocumentDirectoryPath,
    )
    const stringifiedOptions = JSON.stringify(options)
    const result = await FedimintFfi.initialize(stringifiedOptions)
    const resultJson = JSON.parse(result)
    if (resultJson.error !== undefined) {
        log.error('FedimintFfi.initialize', resultJson)
        throw new Error(resultJson.error)
    }
}
