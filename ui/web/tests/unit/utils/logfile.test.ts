import { logFileApi } from '../../../src/utils/logfile'

const LOG_STORAGE_KEY = 'fedi:logs'
const MAX_LOGS_STORED = 1024 * 1024 // 1MB
const MIN_LOGS_STORED = 64 * 1024 // 64KB

describe('utils/logfile', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.restoreAllMocks()
        localStorage.clear()
    })

    it('should store the first log batch without a null prefix', async () => {
        await logFileApi.saveLogs('first log\n')

        expect(localStorage.getItem(LOG_STORAGE_KEY)).toBe('first log\n')
    })

    it('should keep only the most recent logs within the configured limit', async () => {
        const existingLogs = 'a'.repeat(MAX_LOGS_STORED - 4)

        localStorage.setItem(LOG_STORAGE_KEY, existingLogs)

        await logFileApi.saveLogs('tail')

        expect(localStorage.getItem(LOG_STORAGE_KEY)).toBe(
            `${existingLogs}tail`,
        )
    })

    it('should retry with a smaller tail when localStorage quota is exceeded', async () => {
        const originalSetItem = Storage.prototype.setItem
        const setItemSpy = jest
            .spyOn(Storage.prototype, 'setItem')
            .mockImplementation(function (
                this: Storage,
                key: string,
                value: string,
            ) {
                if (key === LOG_STORAGE_KEY && value.length > MIN_LOGS_STORED) {
                    throw new DOMException(
                        'quota exceeded',
                        'QuotaExceededError',
                    )
                }

                return originalSetItem.call(this, key, value)
            })

        await expect(
            logFileApi.saveLogs('x'.repeat(MAX_LOGS_STORED)),
        ).resolves.toBeUndefined()

        expect(
            setItemSpy.mock.calls.filter(([key]) => key === LOG_STORAGE_KEY),
        ).toHaveLength(2)
        expect(localStorage.getItem(LOG_STORAGE_KEY)).toBe(
            'x'.repeat(MIN_LOGS_STORED),
        )
    })
})
