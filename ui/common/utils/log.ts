import { StorageApi } from '../types/storage'
import { isDev } from './environment'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const MAX_MESSAGE_LENGTH = 1000
const MAX_ERROR_MESSAGE_LENGTH = 2000
export const QUICK_SAVE_THRESHOLD = 20
export const QUICK_SAVE_DELAY = 1
export const DEBOUNCE_DELAY = 100

export interface LogFileApi {
    saveLogs(logs: string): Promise<void>
    readLogs(): Promise<string>
}

let logFileApi: LogFileApi | undefined
// invariant: cachedLogs is empty or has \n at end
let cachedLogs = ''
let cachedLogsCount = 0
let saveTimeout: ReturnType<typeof setTimeout> | undefined

/**
 * Configure the logger with platform and environment specific configuration.
 * Can safely be called multiple times with any changes to configuration.
 */
export function configureLogging(logFileApiArg: LogFileApi) {
    logFileApi = logFileApiArg
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
    try {
        return (await logFileApi.readLogs()) + cachedLogs
    } catch (err) {
        return (
            JSON.stringify({
                timestamp: Date.now(),
                level: 'error',
                context: 'common/utils/log',
                message:
                    'Encountered an error during log retrieval from logFileApi. Some logging may be missing.',
                extra: [formatArgForStorage(err, 'error')],
            }) +
            '\n' +
            cachedLogs
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
                extra: [formatArgForStorage(err, 'error')],
            }) + '\n'
        )
    }
}

/**
 * Forcibly save logs to logFileApi. Logs are automatically saved to storage
 * periodically, This should only be called when the app is about to close
 * to prevent logs that haven't been stored yet from being lost.
 */
export async function saveLogsToStorage() {
    if (!logFileApi) {
        throw new Error('Logging logFileApi not initialized')
    }
    const newLogs = cachedLogs
    cachedLogs = ''
    cachedLogsCount = 0
    await logFileApi.saveLogs(newLogs)
}

function innerLog(
    level: LogLevel,
    context: string,
    message: string,
    ...extra: unknown[]
) {
    const logItem = {
        // date serializes as ISO date format
        timestamp: new Date(),
        level: level.toUpperCase(),
        context,
        message: formatArgForStorage(message, level) as string,
        extra: extra.length
            ? extra.map(e => formatArgForStorage(e, level))
            : undefined,
    }
    cachedLogs = cachedLogs + JSON.stringify(logItem) + '\n'
    cachedLogsCount++

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
    if (cachedLogsCount >= QUICK_SAVE_THRESHOLD) {
        saveTimeout = setTimeout(saveLogsToStorage, QUICK_SAVE_DELAY)
    } else {
        saveTimeout = setTimeout(saveLogsToStorage, DEBOUNCE_DELAY)
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
