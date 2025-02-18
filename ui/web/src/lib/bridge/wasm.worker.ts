// worker to run bridge in a different thread
// request: {token: int, method: string, data: string}
// response: {event: string, data: string} | {token: int, result: string} | {error: string}
import { RpcInitOpts } from '@fedi/common/types/bindings'
import { isDev } from '@fedi/common/utils/environment'
import { makeLog } from '@fedi/common/utils/log'
import init, {
    fedimint_initialize,
    fedimint_read_file,
    fedimint_rpc,
    fedimint_write_file,
    get_logs,
} from '@fedi/common/wasm/'

const log = makeLog('web/lib/bridge/wasm.worker')

let deviceId: string

async function workerInit() {
    await init(new URL('@fedi/common/wasm/fedi_wasm_bg.wasm', import.meta.url))
    if (!deviceId) {
        log.error('fedimint_initialize - deviceId not set')
        throw new Error('Failed to initialize bridge')
    }
    const origin = self?.location?.host || ''
    const options: RpcInitOpts = {
        dataDir: null,
        deviceIdentifier: deviceId,
        logLevel: null,
        appFlavor: {
            type: isDev()
                ? 'dev'
                : origin.includes('app.fedi.xyz')
                  ? 'bravo'
                  : 'nightly',
        },
    }
    const initOptsJson = JSON.stringify(options)
    const result = await fedimint_initialize(
        {
            event(event_name: string, data: string) {
                postMessage({ event: event_name, data })
            },
        },
        initOptsJson,
    )

    try {
        const parsedJson = JSON.parse(result)
        if (parsedJson.error !== undefined) {
            log.error('fedimint_initialize ', parsedJson)
            throw new Error('Failed to initialize bridge')
        }
    } catch (err) {
        log.error('Invalid json from fedimint initialize', err)
    }

    postMessage({ event: 'initialized' })
}

const initPromise = workerInit().catch(error =>
    postMessage({ error: String(error) }),
)

async function rpcRequest(method: string, data: string): Promise<string> {
    await initPromise
    return await fedimint_rpc(method, data)
}

// Handles worker.postMessage calls
addEventListener('message', e => {
    const { token, method, data } = e.data
    if (method === 'initialize') {
        // Store deviceId for bridge initialization later
        if (!data.deviceId) {
            throw new Error('deviceId not provided')
        }
        deviceId = data.deviceId
        return
    }
    if (method == 'getLogs') {
        ;(async () => {
            const file = await get_logs()
            postMessage({
                token,
                // TODO: release data??
                result: JSON.stringify({ result: URL.createObjectURL(file) }),
            })
        })()
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
