const LOG_STORAGE_KEY = 'fedi:logs'
const MAX_LOGS_STORED = 5 * 1024 * 1024 // 5MB

export const logFileApi = {
    saveLogs: (logs: string) => {
        localStorage.setItem(
            LOG_STORAGE_KEY,
            (localStorage.getItem(LOG_STORAGE_KEY) + logs).slice(
                -MAX_LOGS_STORED,
            ),
        )
        return Promise.resolve(undefined)
    },
    readLogs: () => {
        return Promise.resolve(localStorage.getItem(LOG_STORAGE_KEY) || '')
    },
}
