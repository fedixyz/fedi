import { Asset } from 'react-native-image-picker'
import Share from 'react-native-share'
import RNFB from 'rn-fetch-blob'

import { exportLogs as exportAppLogs, makeLog } from '@fedi/common/utils/log'
import { File, makeTarGz } from '@fedi/common/utils/targz'

import { store } from '../state/store'
import { getAllDeviceInfo } from './device-info'

const log = makeLog('native/utils/logs-export')
const MAX_BRIDGE_LOG_SIZE = 1024 * 1024 * 10

export async function generateLogsExportGzip(extraFiles: File[] = []) {
    // Parallelize all information gathering.
    const [jsLogs, bridgeLogs, infoJson] = await Promise.all([
        exportAppLogs(),
        exportBridgeLogs(),
        getAllDeviceInfo(),
    ])

    return await makeTarGz([
        { name: 'app.log', content: jsLogs },
        { name: 'bridge.log', content: bridgeLogs },
        { name: 'info.json', content: JSON.stringify(infoJson, null, 2) },
        ...extraFiles,
    ])
}

export async function shareLogsExport() {
    const targz = await generateLogsExportGzip()
    const filename = `fedi-logs-${Math.floor(Date.now() / 1000)}.tar.gz`
    return Share.open({
        title: 'Fedi logs',
        url: `data:application/tar+gzip;base64,${targz.toString('base64')}`,
        filename: filename,
        type: 'application/tar+gzip',
    })
}

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

async function exportBridgeLogs() {
    // Ensure we get as many logs as limited. Logs are split across multiple files
    // on a rolling basis, so it's possible that `fedi.log` is nearly empty but
    // `fedi.log.1` has a lot of logs from before.
    const LOGS_DIR = RNFB.fs.dirs.DocumentDir
    let files = ['fedi.log']
    const secondLogExists = await RNFB.fs.exists(`${LOGS_DIR}/fedi.log.1`)
    if (secondLogExists) {
        const logStat = await RNFB.fs.stat(`${LOGS_DIR}/fedi.log`)
        if (logStat.size < MAX_BRIDGE_LOG_SIZE) {
            files = ['fedi.log.1', 'fedi.log']
        }
    }

    // Iterate over files and append to string. Starting oldest first, append
    // in ascending order.
    let bridgeLogs = ''
    for (const file of files) {
        try {
            bridgeLogs += await asyncStreamFile(`${LOGS_DIR}/${file}`, 'utf8')
        } catch (error) {
            const err = error as Error
            bridgeLogs += JSON.stringify({
                error: `Error reading file stream for ${file}: ${
                    err.stack || err.message || err.toString()
                }`,
            })
        }
    }

    // Trim logs to 2mb reduce upload size / increase gzip performance. RNFB
    // doesn't allow us to seek before streaming, but it's so much faster than
    // RNFS with seeking that we still save time overall by doing this in JS.
    bridgeLogs = bridgeLogs.slice(-MAX_BRIDGE_LOG_SIZE)

    // Take the first line from the logs and try to JSON parse it. If it fails,
    // cut off the first line since it's fragmented from the slice above. Only
    // split on the first newline, don't split the whole string.
    const firstNewlineIndex = bridgeLogs.indexOf('\n')
    try {
        const firstLine = bridgeLogs.substring(0, firstNewlineIndex)
        JSON.parse(firstLine)
    } catch (err) {
        // Remove first line
        if (firstNewlineIndex !== -1) {
            bridgeLogs = bridgeLogs.slice(firstNewlineIndex + 1)
        }
    }

    return bridgeLogs
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
