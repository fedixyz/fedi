import { NativeEventEmitter, NativeModules } from 'react-native'

import { FedimintBridgeEventMap } from '@fedi/common/types'
import { FedimintBridge } from '@fedi/common/utils/fedimint'
import { makeLog } from '@fedi/common/utils/log'

const { BridgeNativeEventEmitter, FedimintFfi } = NativeModules

const log = makeLog('native/bridge')

async function fedimintRpc<Type = void>(
    method: string,
    payload: object,
): Promise<Type> {
    log.info('rpc method', method)
    const jsonPayload = JSON.stringify(payload)
    const json: string = await new Promise(resolve => {
        setTimeout(() => resolve(FedimintFfi.rpc(method, jsonPayload)))
    })
    const parsed = JSON.parse(json)
    if (parsed.error) {
        throw Error(parsed.error)
    } else {
        return parsed.result
    }
}

export const fedimint = new FedimintBridge(fedimintRpc)

export async function initializeBridge(dataDir: string, deviceId: string) {
    // Pass through all native bridge events to the FedimintBridge class instance
    const emitter = new NativeEventEmitter(BridgeNativeEventEmitter)
    const eventTypes: (keyof FedimintBridgeEventMap)[] =
        await FedimintFfi.getSupportedEvents()
    eventTypes.forEach(eventType =>
        emitter.addListener(eventType, (serializedEvent: string) => {
            fedimint.emit(eventType, JSON.parse(serializedEvent))
        }),
    )

    const logLevel = 'info'
    const result = await FedimintFfi.initialize(dataDir, logLevel, deviceId)
    const resultJson = JSON.parse(result)
    if (resultJson.error !== undefined) {
        log.error('FedimintFfi.initialize', resultJson)
        throw new Error(resultJson.error)
    }
}
