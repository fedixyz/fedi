import RNFS from 'react-native-fs'

const logFileName = (i: number) =>
    `${RNFS.DocumentDirectoryPath}/fedi-ui.${i}.log`

const MAX_LOG_SIZE = 5 * 1024 * 1024 // 5MB

async function attemptLogFileRollover() {
    try {
        const stat = await RNFS.stat(logFileName(0))
        // on disk we retain 2 * MAX_LOG_SIZE to efficiently roll log files
        // not enough data to roll over yet
        if (stat.size < MAX_LOG_SIZE) {
            return
        }

        // remove the last .1 file
        try {
            await RNFS.unlink(logFileName(1))
        } catch (err) {
            // .1 doesn't exist, ignore the error
        }
        try {
            // move current .0 to .1
            // and .0 will start from empty on next log writting
            await RNFS.moveFile(logFileName(0), logFileName(1))
        } catch (err) {
            // this shouldn't happen, but we ignore the error in this case
        }
    } catch (err) {
        // don't rollover if something fails
    }
}

// we only roll once per app launch to improve performance
let attemptLogFileRolloverOncePromise: null | Promise<void> = null

// Reset function for testing
export function resetLogFileRollover() {
    attemptLogFileRolloverOncePromise = null
}

export const logFileApi = {
    async saveLogs(logs: string) {
        if (attemptLogFileRolloverOncePromise === null) {
            attemptLogFileRolloverOncePromise = attemptLogFileRollover()
        }
        await attemptLogFileRolloverOncePromise
        await RNFS.appendFile(logFileName(0), logs)
    },
    async readLogs() {
        const newLogs = (
            await Promise.allSettled([
                RNFS.readFile(logFileName(1)),
                RNFS.readFile(logFileName(0)),
            ])
        )
            .map(x => (x.status === 'fulfilled' ? x.value : ''))
            .join('')

        if (newLogs.length >= MAX_LOG_SIZE) {
            return newLogs.slice(-MAX_LOG_SIZE)
        }
        return newLogs
    },
}
