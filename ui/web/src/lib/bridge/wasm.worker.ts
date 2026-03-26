// worker to run bridge in a different thread
// request: {token: int, method: string, data: string}
// response: {event: string, data: string} | {logs: string} | {token: int, result: string} | {error: string}
import { RpcAppFlavor, RpcInitOpts } from '@fedi/common/types/bindings'
import { configureLogging, makeLog } from '@fedi/common/utils/log'
import init, {
    fedimint_initialize,
    fedimint_read_file,
    fedimint_rpc,
    fedimint_write_file,
} from '@fedi/common/wasm/'

import { getBridgeLogFile, openBridgeLogFile } from './log'

const log = makeLog('web/lib/bridge/wasm.worker')

type WorkerInitOptions = {
    deviceId: string
    flavor: RpcAppFlavor['type']
}

let resolveInitializeOptions!: (options: WorkerInitOptions) => void
// `workerInit()` is kicked off as soon as the worker loads so the WASM bundle can
// start downloading and instantiating immediately, but the bridge-specific
// `deviceId` and `flavor` only arrive later from the main thread's
// `initialize` message. This promise is the synchronization point between those
// two timelines: we do the expensive work that does not depend on runtime
// options first, then pause exactly once before building `RpcInitOpts` and
// calling `fedimint_initialize`. Keeping the steps in that order avoids racing
// on uninitialized config while still preserving the parallelism of eager WASM
// startup.
const initializeOptionsPromise = new Promise<WorkerInitOptions>(resolve => {
    resolveInitializeOptions = resolve
})
configureLogging({
    saveLogs: async logs => {
        postMessage({ logs })
    },
    readLogs: async () => '',
})

async function workerInit() {
    await init(new URL('@fedi/common/wasm/fedi_wasm_bg.wasm', import.meta.url))
    const { deviceId, flavor } = await initializeOptionsPromise

    const options: RpcInitOpts = {
        dataDir: null,
        deviceIdentifier: deviceId,
        logLevel: null,
        appFlavor: {
            type: flavor,
        },
    }
    const initOptsJson = JSON.stringify(options)

    // Open database file
    const root = await navigator.storage.getDirectory()
    const dbFileHandle = await root.getFileHandle('bridge.db', {
        create: true,
    })
    const dbSyncHandle = await dbFileHandle.createSyncAccessHandle()

    const result = await fedimint_initialize(
        {
            event(event_name: string, data: string) {
                postMessage({ event: event_name, data })
            },
        },
        initOptsJson,
        await openBridgeLogFile(),
        dbSyncHandle,
    )

    let parsedJson
    try {
        parsedJson = JSON.parse(result)
    } catch (err) {
        log.error('Invalid json from fedimint initialize', err)
    }
    if (parsedJson.error !== undefined) {
        log.error('fedimint_initialize ', parsedJson)
        throw new Error('Failed to initialize bridge')
    }

    postMessage({ event: 'initialized' })
}

const initPromise = workerInit().catch(error => postMessage({ error }))

async function rpcRequest(method: string, data: string): Promise<string> {
    await initPromise
    return await fedimint_rpc(method, data)
}

// Handles worker.postMessage calls
addEventListener('message', e => {
    const { token, method, data } = e.data
    if (method === 'initialize') {
        if (!data.deviceId) {
            throw new Error('deviceId not provided')
        }

        if (!data.flavor) {
            throw new Error('flavor not provided')
        }

        resolveInitializeOptions({
            deviceId: data.deviceId,
            flavor: data.flavor,
        })
        return
    }
    if (method == 'getLogs') {
        getBridgeLogFile()
            .then(fileHandle => fileHandle.getFile())
            .then(file => postMessage({ token, result: file }))
            .catch(err => {
                postMessage({ token, error: String(err) })
            })
        return
    }
    if (method === 'readFile') {
        fedimint_read_file(data.path)
            .then(result => {
                postMessage({ token, result })
            })
            .catch(err => {
                postMessage({ token, error: String(err) })
            })
        return
    }
    if (method === 'writeFile') {
        fedimint_write_file(data.path, data.data)
            .then(() => {
                postMessage({ token, result: true })
            })
            .catch(err => {
                postMessage({ token, error: String(err) })
            })
        return
    }
    rpcRequest(method, data)
        .then(result => postMessage({ token, result }))
        .catch(error => postMessage({ error: String(error) }))
})
