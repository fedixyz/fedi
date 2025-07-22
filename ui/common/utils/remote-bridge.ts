import { FedimintBridgeEventMap } from '@fedi/common/types'
import { RpcInitOpts } from '@fedi/common/types/bindings'
import { isDev } from '@fedi/common/utils/environment'
import { BridgeError } from '@fedi/common/utils/errors'
import { FedimintBridge } from '@fedi/common/utils/fedimint'
import { makeLog } from '@fedi/common/utils/log'

const log = makeLog('common/utils/bridge/remote')

const rbridgeHost = 'localhost:26722'
let deviceId: string | null = null
let websocket: WebSocket | null = null

async function fedimintRpc<Type = void>(
    method: string,
    payload: object,
): Promise<Type> {
    if (!deviceId) {
        throw new Error('Fedimint bridge is not ready!')
    }

    log.info(`fedimintRpc ${method}`)
    const startTime = performance.now()
    const jsonPayload = JSON.stringify(payload)

    const response = await fetch(
        `http://${rbridgeHost}/${deviceId}/rpc/${method}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: jsonPayload,
        },
    )

    const json = await response.text()
    const parsed = JSON.parse(json)

    if (parsed.error) {
        throw new BridgeError(parsed)
    } else {
        log.info(
            `fedimintRpc ${method} resolved in ${Number(performance.now() - startTime).toFixed(0)}ms`,
        )
        return parsed.result
    }
}

export const fedimint = new FedimintBridge(fedimintRpc)

let eventEnabled = false

export async function subscribeToBridgeEvents() {
    eventEnabled = true
    return []
}
export async function unsubscribeFromBridgeEvents(_noop: unknown) {
    eventEnabled = false
}

export async function initializeBridge(deviceIdentifier: string) {
    deviceId = deviceIdentifier

    const options: RpcInitOpts = {
        dataDir: '/remote-data',
        deviceIdentifier,
        logLevel: 'info',
        appFlavor: {
            type: isDev() ? 'dev' : 'bravo',
        },
    }

    const stringifiedOptions = JSON.stringify(options)

    const response = await fetch(`http://${rbridgeHost}/${deviceId}/init`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: stringifiedOptions,
    })

    const result = await response.text()
    const resultJson = JSON.parse(result)

    if (resultJson.error !== undefined) {
        log.error('FedimintFfi.initialize', resultJson)
        throw new Error(resultJson.error)
    }

    // web socket and connected
    if (websocket && websocket.readyState != 4) return
    websocket = new WebSocket(`ws://${rbridgeHost}/${deviceId}/events`)
    websocket.onmessage = event => {
        const data = JSON.parse(event.data)
        if (data.event && data.data) {
            const eventType = data.event as keyof FedimintBridgeEventMap
            if (eventEnabled) {
                fedimint.emit(eventType, JSON.parse(data.data))
            }
        }
    }
}
