import { StorageApi } from '../types/storage'
import { isDev } from './environment'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const MAX_MESSAGE_LENGTH = 1000
const MAX_ERROR_MESSAGE_LENGTH = 2000

export interface LogFileApi {
    saveLogs(logs: string): Promise<void>
    readLogs(): Promise<string>
}

// Logging pipeline:
//   log() → logQueue → [serializeChunkAndSave when idle] → disk
//
// Serialization is chunked across idle periods so large bursts of logging
// don't freeze the UI. Each chunk runs for up to SERIALIZE_BUDGET_MS,
// then saves what it serialized and yields until the next idle period.

let logFileApi: LogFileApi | undefined

type LogEntry = {
    timestamp: Date
    level: string
    context: string
    message: ReturnType<typeof formatArg>
    extra: ReturnType<typeof formatArg>[] | undefined
}
let logQueue: LogEntry[] = []
let logQueueCursor = 0 // advances instead of shifting — avoids O(n) per chunk
let processingRequested = false
let lastSavePromise: Promise<void> = Promise.resolve()

// Half a 60fps frame — leaves the other half for rendering and other work.
const SERIALIZE_BUDGET_MS = 8

/**
 * Configure the logger with platform and environment specific configuration.
 * Can safely be called multiple times with any changes to configuration.
 */
export function configureLogging(logFileApiArg: LogFileApi) {
    logFileApi = logFileApiArg
}

/** Reset all module state. Only for tests — production code never needs this. */
export function resetLogging() {
    logQueue = []
    logQueueCursor = 0
    processingRequested = false
    lastSavePromise = Promise.resolve()
}

/** Wait for pending saves to finish. Only for tests. */
export function waitForPendingSaves(): Promise<void> {
    return lastSavePromise.then(() => {})
}

/**
 * Create a logging object. Pass in a context string to be included with all
 * logs to make logs easier to find.
 */
export function makeLog(context: string) {
    return {
        debug: (msg: string, ...extra: unknown[]) =>
            innerLog('debug', context, msg, ...extra),
        info: (msg: string, ...extra: unknown[]) =>
            innerLog('info', context, msg, ...extra),
        warn: (msg: string, ...extra: unknown[]) =>
            innerLog('warn', context, msg, ...extra),
        error: (msg: string, ...extra: unknown[]) =>
            innerLog('error', context, msg, ...extra),
    }
}

export type Logger = ReturnType<typeof makeLog>

/**
 * Export logs as a plain string that can be saved to a file.
 */
export async function exportUiLogs(): Promise<string> {
    if (!logFileApi) {
        throw new Error('Logging logFileApi not initialized')
    }
    const pending = await serializeAndSaveRemaining()
    try {
        return await logFileApi.readLogs()
    } catch (err) {
        return (
            JSON.stringify({
                timestamp: Date.now(),
                level: 'error',
                context: 'common/utils/log',
                message:
                    'Encountered an error during log retrieval from logFileApi. Some logging may be missing.',
                extra: [formatArg(err, 'error')],
            }) +
            '\n' +
            pending
        )
    }
}

/**
 * Export logs to a plain string from the location we used to store UI logs.
 * TODO: Remove this after some time when we don't need very old logs anymore
 */
const LEGACY_LOG_STORAGE_KEY = 'fedi:logs'
export async function exportLegacyUiLogs(storage: StorageApi): Promise<string> {
    try {
        if (!storage) {
            throw new Error('Storage not initialized')
        }
        const legacyLogs = await storage.getItem(LEGACY_LOG_STORAGE_KEY)
        if (!legacyLogs) return ''
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return JSON.parse(legacyLogs).reduce((prev: string, log: any) => {
            const { timestamp, level, ...rest } = log
            const jsonString = JSON.stringify({
                timestamp: new Date(timestamp).toISOString(),
                level: level.toUpperCase(),
                ...rest,
            })
            prev += `${jsonString}\n`
            return prev
        }, '')
    } catch (err) {
        return (
            JSON.stringify({
                timestamp: Date.now(),
                level: 'error',
                context: 'common/utils/log',
                message:
                    'Encountered an error during log retrieval from legacy logs. Some logging may be missing.',
                extra: [formatArg(err, 'error')],
            }) + '\n'
        )
    }
}

/**
 * Serialize and save any remaining queued logs. Call when the app is about
 * to close to avoid losing recent logs.
 */
export async function saveLogsToStorage() {
    try {
        await serializeAndSaveRemaining()
    } catch {
        // Best-effort — called on app close where there's nothing to do
        // with a save error.
    }
}

// --- Logging pipeline internals ---

function innerLog(
    level: LogLevel,
    context: string,
    message: string,
    ...extra: unknown[]
) {
    // Snapshot args now because callers may mutate them after returning.
    logQueue.push({
        timestamp: new Date(),
        level: level.toUpperCase(),
        context,
        message: formatArg(message, level),
        extra: extra.length ? extra.map(e => formatArg(e, level)) : undefined,
    })

    if (isDev()) {
        // eslint-disable-next-line no-console
        const consoleFn = console[level]
        consoleFn(context ? `[${context}] ${message}` : message, ...extra)
    }

    requestLogProcessing()
}

function requestLogProcessing() {
    if (processingRequested) return
    if (!logFileApi) return
    processingRequested = true
    scheduleWhenIdle(serializeChunkAndSave)
}

function serializeChunkAndSave() {
    processingRequested = false
    // Can fire after serializeAndSaveRemaining() already drained the queue
    if (logQueueCursor >= logQueue.length) return

    const start = global.performance.now()
    let appended = ''

    for (; logQueueCursor < logQueue.length; logQueueCursor++) {
        appended += JSON.stringify(logQueue[logQueueCursor]) + '\n'
        if (global.performance.now() - start >= SERIALIZE_BUDGET_MS) {
            logQueueCursor++
            break
        }
    }

    if (logQueueCursor === logQueue.length) {
        logQueue = []
        logQueueCursor = 0
    } else {
        requestLogProcessing()
    }

    if (appended) {
        lastSavePromise = lastSavePromise
            .then(() => logFileApi?.saveLogs(appended))
            .catch(() => {})
    }
}

// Serialize all remaining items and save to disk. Returns the serialized
// string so exportUiLogs can use it as a fallback if readLogs fails.
async function serializeAndSaveRemaining(): Promise<string> {
    processingRequested = false
    if (logQueueCursor >= logQueue.length) return ''
    let result = ''
    for (let i = logQueueCursor; i < logQueue.length; i++) {
        result += JSON.stringify(logQueue[i]) + '\n'
    }
    logQueue = []
    logQueueCursor = 0
    try {
        if (logFileApi) await logFileApi.saveLogs(result)
    } catch {
        // Best-effort — nothing useful to do with a save error
    }
    return result
}

// --- Utilities ---

// requestIdleCallback with setTimeout(0) fallback for Node/tests.
function scheduleWhenIdle(cb: () => void) {
    const g = globalThis as {
        requestIdleCallback?: (cb: () => void) => number
    }
    if (typeof g.requestIdleCallback === 'function') {
        g.requestIdleCallback(cb)
    } else {
        setTimeout(cb, 0)
    }
}

function formatArg(arg: unknown, level?: LogLevel) {
    let formatted: string | number | boolean | null
    // Non-objects can stay as-is
    if (
        typeof arg === 'string' ||
        typeof arg === 'number' ||
        typeof arg === 'boolean' ||
        arg === null
    ) {
        formatted = arg
    }
    // Objects will be JSON serialized where possible, toString'd where not
    else {
        try {
            // Special exception for errors, they don't JSON serialize properly
            if (arg instanceof Error) {
                formatted = JSON.stringify(arg, Object.getOwnPropertyNames(arg))
            } else {
                formatted = JSON.stringify(arg)
            }
        } catch (err) {
            formatted = arg?.toString() || 'undefined'
        }
    }
    // Truncate long strings
    if (
        typeof formatted === 'string' &&
        formatted.length > MAX_MESSAGE_LENGTH
    ) {
        formatted =
            level === 'error'
                ? `${formatted.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...`
                : `${formatted.slice(0, MAX_MESSAGE_LENGTH)}...`
    }
    return formatted
}
