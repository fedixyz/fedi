import { StorageApi } from '../types'
import { isDev } from './environment'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogItem {
    timestamp: number
    level: LogLevel
    context: string
    message: string
    extra?: unknown[]
}

const LOG_STORAGE_KEY = 'fedi:logs'
const MAX_LOGS_STORED = 15000
const MAX_MESSAGE_LENGTH = 1000
const MAX_ERROR_MESSAGE_LENGTH = 2000

let storage: StorageApi | undefined
let cachedLogs: LogItem[] = []
let saveTimeout: ReturnType<typeof setTimeout> | undefined

/**
 * Configure the logger with platform and environment specific configuration.
 * Can safely be called multiple times with any changes to configuration.
 */
export function configureLogging(storageArg: StorageApi) {
    storage = storageArg
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
export async function exportLogs(): Promise<string> {
    // Combined stored logs with any cached logs that haven't been saved yet.
    const logs = [...(await getLogsFromStorage()), ...cachedLogs]
    return logs.reduce((prev, log) => {
        // Massage the logs to look more like the rust logs, should make combining
        // them a lot easier.
        const { timestamp, level, ...rest } = log
        const jsonString = JSON.stringify({
            timestamp: new Date(timestamp).toISOString(),
            level: level.toUpperCase(),
            ...rest,
        })
        prev += `${jsonString}\n`
        return prev
    }, '')
}

/**
 * Forcibly save logs to storage. Logs are automatically saved to storage
 * periodically, This should only be called when the app is about to close
 * to prevent logs that haven't been stored yet from being lost.
 */
export async function saveLogsToStorage() {
    if (!storage) {
        throw new Error('Logging storage not initialized')
    }
    const oldLogs = await getLogsFromStorage()
    const newLogs = [...oldLogs, ...cachedLogs].slice(-MAX_LOGS_STORED)
    await storage.setItem(LOG_STORAGE_KEY, JSON.stringify(newLogs))
    cachedLogs = []
}

async function getLogsFromStorage(): Promise<LogItem[]> {
    if (!storage) {
        throw new Error('Logging storage not initialized')
    }
    try {
        const logs = await storage.getItem(LOG_STORAGE_KEY)
        if (!logs) return []
        return JSON.parse(logs)
    } catch (err) {
        return [
            {
                timestamp: Date.now(),
                level: 'error',
                context: 'common/utils/log',
                message:
                    'Encountered an error during log retrieval from storage. Some logging may be missing.',
                extra: [formatArgForStorage(err, 'error')],
            },
        ]
    }
}

function innerLog(
    level: LogLevel,
    context: string,
    message: string,
    ...extra: unknown[]
) {
    const logItem = {
        timestamp: Date.now(),
        level,
        context,
        message: formatArgForStorage(message, level) as string,
        extra: extra.length
            ? extra.map(e => formatArgForStorage(e, level))
            : undefined,
    }
    cachedLogs.push(logItem)

    if (isDev()) {
        // eslint-disable-next-line no-console
        const consoleFn = console[level]
        consoleFn(context ? `[${context}] ${message}` : message, ...extra)
    }
    // Saves each log after a brief delay to batch multiple logs together, but
    // minimizes the risk of losing logs on app close by saving more quickly if we have
    // more than 20 logs in the cache.
    // Acts as an *imperfect* debouncer to prevent UI thread blockage during rapid logging:
    // - clearTimeout cancels any previous calls waiting for the timeout
    // - setTimeout yields to the event loop, allowing UI thread operations to continue
    // - The 1ms delay is a compromise - it yields to the UI thread but doesn't guarantee
    // cancellation of all previous timeouts like a true debouncer should
    clearTimeout(saveTimeout)
    if (cachedLogs.length >= 20) {
        saveTimeout = setTimeout(saveLogsToStorage, 1)
    } else {
        saveTimeout = setTimeout(saveLogsToStorage, 100)
    }
}

function formatArgForStorage(arg: unknown, level?: LogLevel) {
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
