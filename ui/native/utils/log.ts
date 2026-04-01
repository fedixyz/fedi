import { Platform } from 'react-native'
import { Asset } from 'react-native-image-picker'
import Share from 'react-native-share'
import RNFB from 'rn-fetch-blob'

import { LogEvent } from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'
import { File } from '@fedi/common/utils/targz'

import { store } from '../state/store'

const log = makeLog('native/utils/logs-export')
const LOGS_DIR = RNFB.fs.dirs.DocumentDir
// Must match RAW_LOG_PREFIX / COMPRESSED_LOG_PREFIX in bridge/fedi-ffi/src/logging.rs
const RAW_BRIDGE_LOG_PREFIX = 'fedi.log.'
const COMPRESSED_BRIDGE_LOG_PREFIX = 'fedi.logz.'

export async function shareReduxState() {
    const state = store.getState()
    const stateJson = JSON.stringify(state, null, 2)
    const stateB64 = Buffer.from(stateJson).toString('base64')
    return Share.open({
        title: 'Fedi state',
        url: `data:application/json;base64,${stateB64}`,
        filename: `fedi-state-${Math.floor(Date.now() / 1000)}.json`,
        type: 'application/json',
    })
}

export async function attachmentsToFiles(
    attachments: Asset[],
): Promise<File[]> {
    const files: File[] = []
    await Promise.all(
        attachments.map(async (a, index) => {
            try {
                const fileExt = a.fileName
                    ? `.${a.fileName.split('.').pop()}`
                    : ''
                const b64 = await asyncStreamFile(a.uri || '', 'base64')
                const content = Buffer.from(b64, 'base64')
                files.push({
                    name: `attachment-${index}${fileExt}`,
                    content,
                })
            } catch (err) {
                log.warn('Failed to stream image attachment', err)
            }
        }),
    )
    return files
}

export async function exportBridgeLogFiles(): Promise<File[]> {
    // Read raw and compressed logs in separate passes so a file
    // compressed by the background maintenance thread between
    // listing and reading is still captured in the second pass.
    const rawFiles = await listAndReadBridgeLogFiles(RAW_BRIDGE_LOG_PREFIX)
    const compressedFiles = await listAndReadBridgeLogFiles(
        COMPRESSED_BRIDGE_LOG_PREFIX,
    )
    return [...rawFiles, ...compressedFiles]
}

async function listAndReadBridgeLogFiles(prefix: string): Promise<File[]> {
    const fileNames = await RNFB.fs.ls(LOGS_DIR).catch(err => {
        log.warn('Failed to list bridge log files', err)
        return []
    })

    const exportedFiles: File[] = []
    for (const file of fileNames.filter(f => f.startsWith(prefix))) {
        try {
            exportedFiles.push({
                name: file,
                content: Buffer.from(
                    await asyncStreamFile(`${LOGS_DIR}/${file}`, 'base64'),
                    'base64',
                ),
            })
        } catch (err) {
            log.info(`Failed to read bridge log file ${file}; skipping`, err)
        }
    }
    return exportedFiles
}

function asyncStreamFile(path: string, encoding: 'utf8' | 'base64') {
    return new Promise<string>((resolve, reject) => {
        let content = ''
        RNFB.fs
            .readStream(
                path.replace('file://', ''), // RNFB doesn't want uri prefix
                encoding,
                // Stream files 100kb at a time to avoid locking the main thread
                // on large files. However, chunk size must be a multiple of 3
                // or else base64 decoding will stop at the first chunk.
                // https://github.com/joltup/rn-fetch-blob?tab=readme-ov-file#file-stream
                1000_02,
            )
            .then(fileStream => {
                fileStream.onData(chunk => {
                    content += chunk
                })
                fileStream.onError(err => {
                    reject(err)
                })
                fileStream.onEnd(() => {
                    resolve(content)
                })
                fileStream.open()
            })
            .catch(err => reject(err))
    })
}

/**
 * Helps break down all of the different log events emitted by the bridge
 * and print them in a way that minimizes cluttered logs during development
 * These logs are NOT printed in production since the bridge writes them to
 * a bridge.log so it would be redundant to write to app.log
 * */
export function formatBridgeFfiLog(event: LogEvent): string {
    // Strip escape characters
    const stripped = event.log.replace('\\', '')
    let stringToLog = ``
    if (__DEV__) {
        stringToLog += `[OS: ${Platform.OS}]\n------ |  `
        const parsed = JSON.parse(event.log)
        if (parsed?.message === 'rpc call') {
            return '' // This is noisy and not helpful. We already log rpc calls in `native/bridge.ts`
            // stringToLog += `> rpc call: received by bridge\n`
        } else if (parsed?.message === 'rpc_error' && parsed?.error) {
            stringToLog += `> rpc error: ${parsed.error}\n`
        } else if (parsed?.name && parsed?.duration_ms) {
            // this makes logs slightly more readable to distinguish operations from rpc calls
            const operation = parsed.name.includes('fedimint_rpc ')
                ? `rpc call: ${parsed.name.split('fedimint_rpc ')[1]}`
                : `operation ${parsed.name}`
            stringToLog += `> ${operation} completed in ${parsed?.duration_ms}ms\n`
        } else if (parsed?.metadata?.is_event && parsed?.message) {
            stringToLog += `> event received from bridge <message>: ${parsed?.message}\n`
        } else {
            // we don't log every event since it just adds a lot of clutter during UI dev
            stringToLog += `> received unspecified log event. uncomment ui/native/utils/log:formatBridgeFfiLog to view the full log\n`

            // Uncomment this to see the full log of this unspecified event
            // stringToLog += `------ |  > full log: ${stripped}\n`
        }
        // Uncomment this to view full unformatted bridge logs
        // stringToLog += `------ |  > full log: ${stripped}\n`
    } else {
        stringToLog += `bridge log -> ${stripped}`
    }
    return stringToLog
}
