import { NativeEventEmitter, NativeModules } from 'react-native'
import RNFS from 'react-native-fs'

import { FedimintBridgeEventMap } from '@fedi/common/types'
import { RpcInitOpts } from '@fedi/common/types/bindings'
import { isDev } from '@fedi/common/utils/environment'
import { BridgeError, FedimintBridge } from '@fedi/common/utils/fedimint'
import { makeLog } from '@fedi/common/utils/log'

import { isNightly } from './utils/device-info'

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

export const fedimint = new FedimintBridge(fedimintRpc)

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

export async function initializeBridge(deviceId: string) {
    const options: RpcInitOpts = {
        dataDir: RNFS.DocumentDirectoryPath,
        deviceIdentifier: deviceId,
        logLevel: 'info',
        appFlavor: {
            type: isDev() ? 'dev' : isNightly() ? 'nightly' : 'bravo',
        },
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
