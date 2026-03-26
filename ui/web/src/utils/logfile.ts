const LOG_STORAGE_KEY = 'fedi:logs'
// Keep log storage well below the browser quota because the PWA also persists
// app state in localStorage under the same origin.
const MAX_LOGS_STORED = 1024 * 1024 // 1MB
const MIN_LOGS_STORED = 64 * 1024 // 64KB

function trimLogs(logs: string, maxLength: number) {
    return logs.length > maxLength ? logs.slice(-maxLength) : logs
}

function isQuotaExceededError(error: unknown) {
    if (!(error instanceof Error)) return false

    return (
        error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    )
}

function persistLogs(logs: string) {
    try {
        localStorage.setItem(LOG_STORAGE_KEY, trimLogs(logs, MAX_LOGS_STORED))
        return
    } catch (error) {
        if (!isQuotaExceededError(error)) return
    }

    try {
        localStorage.removeItem(LOG_STORAGE_KEY)
        const latestLogs = trimLogs(logs, MIN_LOGS_STORED)
        if (latestLogs) {
            localStorage.setItem(LOG_STORAGE_KEY, latestLogs)
        }
    } catch {
        // Best effort logging should never crash the app.
    }
}

export const logFileApi = {
    saveLogs: (logs: string) => {
        persistLogs((localStorage.getItem(LOG_STORAGE_KEY) ?? '') + logs)
        return Promise.resolve(undefined)
    },
    readLogs: () => {
        return Promise.resolve(localStorage.getItem(LOG_STORAGE_KEY) || '')
    },
}
