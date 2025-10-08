import { FedimintBridgeEventMap } from '@fedi/common/types'
import { RpcInitOpts } from '@fedi/common/types/bindings'
import { isDev } from '@fedi/common/utils/environment'
import { BridgeError } from '@fedi/common/utils/errors'
import { FedimintBridge } from '@fedi/common/utils/fedimint'
import { makeLog } from '@fedi/common/utils/log'

const log = makeLog('common/utils/bridge/remote')
const rbridgeHost = `localhost:${process?.env?.REMOTE_BRIDGE_PORT || 26722}`

export class RemoteBridge {
    private deviceId: string | null = null
    private websocket: WebSocket | null = null
    private eventEnabled = false

    public readonly fedimint: FedimintBridge

    constructor() {
        this.fedimint = new FedimintBridge(this.fedimintRpc.bind(this))
    }

    private async fedimintRpc<Type = void>(
        method: string,
        payload: object,
    ): Promise<Type> {
        if (!this.deviceId) {
            throw new Error('Fedimint bridge is not ready!')
        }

        log.info(`fedimintRpc ${method}`)
        const startTime = performance.now()
        const jsonPayload = JSON.stringify(payload)

        const response = await fetch(
            `http://${rbridgeHost}/${this.deviceId}/rpc/${method}`,
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

    public async subscribeToBridgeEvents() {
        this.eventEnabled = true
        return []
    }

    public async unsubscribeFromBridgeEvents(_noop: unknown) {
        this.eventEnabled = false
    }

    public async getInviteCode(): Promise<string> {
        const response = await fetch(`http://${rbridgeHost}/invite_code`)

        const result = await response.text()
        const resultJson = JSON.parse(result)

        if (resultJson.error !== undefined) {
            log.error('getInviteCode', resultJson)
            throw new Error(resultJson.error)
        }

        return resultJson.invite_code
    }

    public async generateEcash(amountMsats: number): Promise<string> {
        const response = await fetch(
            `http://${rbridgeHost}/generate_ecash/${amountMsats}`,
        )

        const result = await response.text()
        const resultJson = JSON.parse(result)

        if (resultJson.error !== undefined) {
            log.error('generateEcash', resultJson)
            throw new Error(resultJson.error)
        }

        return resultJson.ecash
    }

    public async initializeBridge(deviceIdentifier: string) {
        this.deviceId = deviceIdentifier

        const options: RpcInitOpts = {
            dataDir: '/remote-data',
            deviceIdentifier,
            logLevel: 'info',
            appFlavor: {
                type:
                    process.env.NODE_ENV === 'test'
                        ? 'tests'
                        : isDev()
                          ? 'dev'
                          : 'bravo',
            },
        }

        const stringifiedOptions = JSON.stringify(options)

        const response = await fetch(
            `http://${rbridgeHost}/${this.deviceId}/init`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: stringifiedOptions,
            },
        )

        const result = await response.text()
        const resultJson = JSON.parse(result)

        if (resultJson.error !== undefined) {
            log.error('FedimintFfi.initialize', resultJson)
            throw new Error(resultJson.error)
        }

        await this.initializeWebsocket(
            `ws://${rbridgeHost}/${this.deviceId}/events`,
        )
    }

    private initializeWebsocket(connUrl: string) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            return
        }

        return new Promise<void>(resolve => {
            this.websocket = new WebSocket(connUrl)

            this.websocket.onopen = () => {
                resolve()
            }

            this.websocket.onmessage = event => {
                const data = JSON.parse(event.data)

                if (data.event && data.data) {
                    const eventType = data.event as keyof FedimintBridgeEventMap
                    if (this.eventEnabled) {
                        this.fedimint.emit(eventType, JSON.parse(data.data))
                    }
                }
            }
        })
    }

    public shutdown() {
        this.fedimint.matrixClient = null
        if (this.websocket) {
            this.websocket.close()
            this.websocket = null
        }
        this.eventEnabled = false
        this.deviceId = null
    }
}

const globalRemoteBridge = new RemoteBridge()

// Export global instance for replacing other bridges in native and web.
export const fedimint = globalRemoteBridge.fedimint
export const subscribeToBridgeEvents =
    globalRemoteBridge.subscribeToBridgeEvents.bind(globalRemoteBridge)
export const unsubscribeFromBridgeEvents =
    globalRemoteBridge.unsubscribeFromBridgeEvents.bind(globalRemoteBridge)
export const initializeBridge =
    globalRemoteBridge.initializeBridge.bind(globalRemoteBridge)
