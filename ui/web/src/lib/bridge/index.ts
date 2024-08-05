import { BridgeError, FedimintBridge } from '@fedi/common/utils/fedimint'
import { makeLog } from '@fedi/common/utils/log'

const log = makeLog('web/lib/bridge')

let worker: Worker
let callbackId = 0
const callbacks = new Map()

async function workerRequest<ResponseData, RequestData = unknown>(
    method: string,
    data: RequestData,
): Promise<ResponseData> {
    // Instant throw if bridge is not initialized
    // TODO: Just await promise until it is?
    if (!worker) {
        throw new Error('Fedimint bridge is not ready!')
    }

    return new Promise(resolve => {
        callbackId++
        callbacks.set(callbackId, (res: ResponseData) => resolve(res))
        worker.postMessage({ token: callbackId, method, data })
    })
}

async function fedimintRpc<Type = void>(
    method: string,
    payload: object,
): Promise<Type> {
    // Instant throw if bridge is not initialized
    // TODO: Just await promise until it is?
    if (!worker) {
        throw new Error('Fedimint bridge is not ready!')
    }

    // Post a message to the worker
    const jsonPayload = JSON.stringify(payload)
    const json = await workerRequest<string>(method, jsonPayload)
    const parsed = JSON.parse(json)
    if (parsed.error) {
        log.error(method, parsed)
        throw new BridgeError(parsed)
    } else {
        return parsed.result
    }
}

export const fedimint = new FedimintBridge(fedimintRpc)

let initializePromise: Promise<void> | undefined
export async function initializeBridge(deviceId: string) {
    // Only initialize once at a time.
    if (initializePromise) {
        await initializePromise
        return
    }

    initializePromise = new Promise<void>((resolve, reject) => {
        worker = new Worker(new URL('./wasm.worker.ts', import.meta.url))
        worker.onmessage = e => {
            if (e.data.error) {
                log.error('bridge error', e.data)
                return reject(new Error(e.data.error))
            }
            if (e.data.event) {
                // Initialized event is just for us, not emitted.
                if (e.data.event === 'initialized') {
                    return resolve()
                }
                fedimint.emit(e.data.event, JSON.parse(e.data.data))
            }
            if (e.data.token) {
                const cb = callbacks.get(e.data.token)
                if (cb === undefined) {
                    log.warn(
                        `Received token ${e.data.token} with no associated callback, ignoring`,
                    )
                    return
                }
                callbacks.delete(e.data.token)
                cb(e.data.result)
            }
        }
        worker.postMessage({ method: 'initialize', data: { deviceId } })
    })

    // After initializing, clear promise so subsequent calls re-initialize.
    return initializePromise.finally(() => {
        initializePromise = undefined
    })
}

export async function readBridgeFile(path: string) {
    const response = workerRequest<Uint8Array | string>('readFile', { path })

    if (typeof response === 'string') {
        let errMsg: string
        try {
            const parsed = JSON.parse(response)
            errMsg = parsed.error
        } catch (err) {
            log.error(
                'Failed to parse response from readFile as JSON',
                response,
                err,
            )
            throw err
        }
        throw new Error(errMsg)
    }

    return response
}

export async function writeBridgeFile(path: string, data: Uint8Array) {
    const response = workerRequest<boolean | string>('writeFile', {
        path,
        data,
    })

    if (typeof response === 'string') {
        let errMsg: string
        try {
            const parsed = JSON.parse(response)
            errMsg = parsed.error
        } catch (err) {
            log.error(
                'Failed to parse response from readFile as JSON',
                response,
                err,
            )
            throw err
        }
        throw new Error(errMsg)
    }
}

// Expose bridge API to window for testing in development
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).fedimint = fedimint
}
