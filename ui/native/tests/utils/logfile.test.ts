// tests logfile.ts
import RNFS from 'react-native-fs'

import { logFileApi, resetLogFileRollover } from '../../utils/logfile'

// Mock react-native-fs for testing
jest.mock('react-native-fs', () => ({
    DocumentDirectoryPath: '/mock/documents',
    stat: jest.fn(),
    unlink: jest.fn(),
    moveFile: jest.fn(),
    appendFile: jest.fn(),
    readFile: jest.fn(),
}))

// Mock storage for testing
jest.mock('../../utils/storage', () => ({
    storage: {
        getItem: jest.fn(),
    },
}))

const mockRNFS = RNFS as jest.Mocked<typeof RNFS>
const MAX_LOG_SIZE = 5 * 1024 * 1024 // 5MB

const sampleLog1 =
    '{"timestamp":"2025-01-01T00:00:00.000Z","level":"info","context":"test","message":"First log entry"}'
const sampleLog2 =
    '{"timestamp":"2025-01-01T00:00:01.000Z","level":"info","context":"test","message":"Second log entry"}'
const sampleLog3 =
    '{"timestamp":"2025-01-01T00:00:02.000Z","level":"info","context":"test","message":"Third log entry"}'

describe('logFileApi', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('attemptLogFileRollover logic (first call)', () => {
        beforeEach(() => {
            // Reset rollover state to test the first call
            resetLogFileRollover()
        })

        it('should not rollover when file is small', async () => {
            mockRNFS.stat.mockResolvedValue({ size: 1024 } as any)
            mockRNFS.appendFile.mockResolvedValue()

            await logFileApi.saveLogs(sampleLog1)

            expect(mockRNFS.stat).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.0.log',
            )
            expect(mockRNFS.appendFile).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.0.log',
                sampleLog1,
            )
            expect(mockRNFS.unlink).not.toHaveBeenCalled()
            expect(mockRNFS.moveFile).not.toHaveBeenCalled()
        })

        it('should trigger rollover when file exceeds MAX_LOG_SIZE', async () => {
            mockRNFS.stat.mockResolvedValue({
                size: MAX_LOG_SIZE + 1000,
            } as any)
            mockRNFS.unlink.mockResolvedValue()
            mockRNFS.moveFile.mockResolvedValue()
            mockRNFS.appendFile.mockResolvedValue()

            await logFileApi.saveLogs(sampleLog1)

            expect(mockRNFS.stat).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.0.log',
            )
            expect(mockRNFS.unlink).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.1.log',
            )
            expect(mockRNFS.moveFile).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.0.log',
                '/mock/documents/fedi-ui.1.log',
            )
            expect(mockRNFS.appendFile).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.0.log',
                sampleLog1,
            )
        })

        it('should handle case where .1 file does not exist during rollover', async () => {
            mockRNFS.stat.mockResolvedValue({
                size: MAX_LOG_SIZE + 1000,
            } as any)
            mockRNFS.unlink.mockRejectedValue(new Error('File does not exist'))
            mockRNFS.moveFile.mockResolvedValue()
            mockRNFS.appendFile.mockResolvedValue()

            await expect(logFileApi.saveLogs(sampleLog1)).resolves.not.toThrow()

            expect(mockRNFS.unlink).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.1.log',
            )
            expect(mockRNFS.moveFile).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.0.log',
                '/mock/documents/fedi-ui.1.log',
            )
            expect(mockRNFS.appendFile).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.0.log',
                sampleLog1,
            )
        })

        it('should handle case where moveFile fails during rollover', async () => {
            mockRNFS.stat.mockResolvedValue({
                size: MAX_LOG_SIZE + 1000,
            } as any)
            mockRNFS.unlink.mockResolvedValue()
            mockRNFS.moveFile.mockRejectedValue(new Error('Move failed'))
            mockRNFS.appendFile.mockResolvedValue()

            await expect(logFileApi.saveLogs(sampleLog1)).resolves.not.toThrow()

            expect(mockRNFS.moveFile).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.0.log',
                '/mock/documents/fedi-ui.1.log',
            )
            expect(mockRNFS.appendFile).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.0.log',
                sampleLog1,
            )
        })

        it('should handle case where stat fails during rollover', async () => {
            mockRNFS.stat.mockRejectedValue(new Error('Stat failed'))
            mockRNFS.appendFile.mockResolvedValue()

            await expect(logFileApi.saveLogs(sampleLog1)).resolves.not.toThrow()

            expect(mockRNFS.stat).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.0.log',
            )
            expect(mockRNFS.unlink).not.toHaveBeenCalled()
            expect(mockRNFS.moveFile).not.toHaveBeenCalled()
            expect(mockRNFS.appendFile).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.0.log',
                sampleLog1,
            )
        })
    })

    describe('rollover check', () => {
        beforeEach(() => {
            // Reset singleton state for these tests
            resetLogFileRollover()
        })

        it('should only perform rollover once per app session', async () => {
            mockRNFS.stat.mockResolvedValue({
                size: MAX_LOG_SIZE + 1000,
            } as any)
            mockRNFS.unlink.mockResolvedValue()
            mockRNFS.moveFile.mockResolvedValue()
            mockRNFS.appendFile.mockResolvedValue()

            // Call saveLogs multiple times
            await logFileApi.saveLogs(sampleLog1)
            await logFileApi.saveLogs(sampleLog2)
            await logFileApi.saveLogs(sampleLog3)

            // Rollover operations should only be called once
            expect(mockRNFS.stat).toHaveBeenCalledTimes(1)
            expect(mockRNFS.unlink).toHaveBeenCalledTimes(1)
            expect(mockRNFS.moveFile).toHaveBeenCalledTimes(1)

            // But appendFile should be called for each log
            expect(mockRNFS.appendFile).toHaveBeenCalledTimes(3)
        })

        it('should handle concurrent saveLogs calls gracefully', async () => {
            mockRNFS.stat.mockResolvedValue({
                size: MAX_LOG_SIZE + 1000,
            } as any)
            mockRNFS.unlink.mockResolvedValue()
            mockRNFS.moveFile.mockResolvedValue()
            mockRNFS.appendFile.mockResolvedValue()

            // Call saveLogs concurrently
            const promises = [
                logFileApi.saveLogs(sampleLog1),
                logFileApi.saveLogs(sampleLog2),
                logFileApi.saveLogs(sampleLog3),
            ]

            await Promise.all(promises)

            // Rollover should only happen once despite concurrent calls
            expect(mockRNFS.stat).toHaveBeenCalledTimes(1)
            expect(mockRNFS.unlink).toHaveBeenCalledTimes(1)
            expect(mockRNFS.moveFile).toHaveBeenCalledTimes(1)
            expect(mockRNFS.appendFile).toHaveBeenCalledTimes(3)
        })
    })

    describe('saveLogs behavior after rollover has run once', () => {
        beforeEach(async () => {
            // Pre-run rollover once to simulate post-rollover state
            resetLogFileRollover()
            mockRNFS.stat.mockResolvedValue({ size: 1024 } as any)
            mockRNFS.appendFile.mockResolvedValue()
            await logFileApi.saveLogs('initial log')

            // Clear mocks to focus on post-rollover behavior
            jest.clearAllMocks()
        })

        it('should save logs directly without checking rollover again', async () => {
            mockRNFS.appendFile.mockResolvedValue()

            await logFileApi.saveLogs(sampleLog1)

            // Should NOT call stat again (rollover already done)
            expect(mockRNFS.stat).not.toHaveBeenCalled()
            expect(mockRNFS.unlink).not.toHaveBeenCalled()
            expect(mockRNFS.moveFile).not.toHaveBeenCalled()

            // Should only append the log
            expect(mockRNFS.appendFile).toHaveBeenCalledTimes(1)
            expect(mockRNFS.appendFile).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.0.log',
                sampleLog1,
            )
        })

        it('should handle multiple saves efficiently after rollover', async () => {
            mockRNFS.appendFile.mockResolvedValue()

            await logFileApi.saveLogs(sampleLog1)
            await logFileApi.saveLogs(sampleLog2)
            await logFileApi.saveLogs(sampleLog3)

            // Should NOT call any rollover operations
            expect(mockRNFS.stat).not.toHaveBeenCalled()
            expect(mockRNFS.unlink).not.toHaveBeenCalled()
            expect(mockRNFS.moveFile).not.toHaveBeenCalled()

            // Should only append logs
            expect(mockRNFS.appendFile).toHaveBeenCalledTimes(3)
            expect(mockRNFS.appendFile).toHaveBeenNthCalledWith(
                1,
                '/mock/documents/fedi-ui.0.log',
                sampleLog1,
            )
            expect(mockRNFS.appendFile).toHaveBeenNthCalledWith(
                2,
                '/mock/documents/fedi-ui.0.log',
                sampleLog2,
            )
            expect(mockRNFS.appendFile).toHaveBeenNthCalledWith(
                3,
                '/mock/documents/fedi-ui.0.log',
                sampleLog3,
            )
        })

        it('should handle concurrent saves efficiently after rollover', async () => {
            mockRNFS.appendFile.mockResolvedValue()

            const promises = [
                logFileApi.saveLogs(sampleLog1),
                logFileApi.saveLogs(sampleLog2),
                logFileApi.saveLogs(sampleLog3),
            ]

            await Promise.all(promises)

            // Should NOT call any rollover operations
            expect(mockRNFS.stat).not.toHaveBeenCalled()
            expect(mockRNFS.unlink).not.toHaveBeenCalled()
            expect(mockRNFS.moveFile).not.toHaveBeenCalled()

            // Should only append logs
            expect(mockRNFS.appendFile).toHaveBeenCalledTimes(3)
        })

        it('should handle large batches efficiently after rollover', async () => {
            const largeBatch =
                Array.from(
                    { length: 50 },
                    (_, i) =>
                        `{"timestamp":"2024-01-01T00:00:${i.toString().padStart(2, '0')}.000Z","level":"info","context":"test","message":"Log entry ${i}"}`,
                ).join('\n') + '\n'

            mockRNFS.appendFile.mockResolvedValue()

            await logFileApi.saveLogs(largeBatch)

            // Should NOT call any rollover operations
            expect(mockRNFS.stat).not.toHaveBeenCalled()
            expect(mockRNFS.unlink).not.toHaveBeenCalled()
            expect(mockRNFS.moveFile).not.toHaveBeenCalled()

            // Should only append the batch
            expect(mockRNFS.appendFile).toHaveBeenCalledTimes(1)
            expect(mockRNFS.appendFile).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.0.log',
                largeBatch,
            )
        })
    })

    describe('readLogs', () => {
        it('should read and combine logs from both files', async () => {
            const log1Content = 'old logs from file 1'
            const log0Content = 'new logs from file 0'

            mockRNFS.readFile.mockImplementation((path: string) => {
                if (path.includes('fedi-ui.1.log')) {
                    return Promise.resolve(log1Content)
                }
                if (path.includes('fedi-ui.0.log')) {
                    return Promise.resolve(log0Content)
                }
                return Promise.reject(new Error('File not found'))
            })

            const result = await logFileApi.readLogs()

            expect(result).toBe(log1Content + log0Content)
            expect(mockRNFS.readFile).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.1.log',
            )
            expect(mockRNFS.readFile).toHaveBeenCalledWith(
                '/mock/documents/fedi-ui.0.log',
            )
        })

        it('should handle missing log files gracefully', async () => {
            const log0Content = 'only file 0 exists'

            mockRNFS.readFile.mockImplementation((path: string) => {
                if (path.includes('fedi-ui.1.log')) {
                    return Promise.reject(new Error('File not found'))
                }
                if (path.includes('fedi-ui.0.log')) {
                    return Promise.resolve(log0Content)
                }
                return Promise.reject(new Error('File not found'))
            })

            const result = await logFileApi.readLogs()

            expect(result).toBe(log0Content)
        })

        it('should truncate logs to MAX_LOG_SIZE', async () => {
            const longContent = 'a'.repeat(MAX_LOG_SIZE + 1000)

            mockRNFS.readFile.mockImplementation((path: string) => {
                if (path.includes('fedi-ui.1.log')) {
                    return Promise.resolve(longContent)
                }
                if (path.includes('fedi-ui.0.log')) {
                    return Promise.resolve('')
                }
                return Promise.reject(new Error('File not found'))
            })

            const result = await logFileApi.readLogs()

            expect(result.length).toBe(MAX_LOG_SIZE)
            expect(result).toBe(longContent.slice(-MAX_LOG_SIZE))
        })

        it('should return logs in correct order (.1 file first, then .0 file)', async () => {
            const log1Content = 'OLDER_LOGS'
            const log0Content = 'NEWER_LOGS'

            mockRNFS.readFile.mockImplementation((path: string) => {
                if (path.includes('fedi-ui.1.log')) {
                    return Promise.resolve(log1Content)
                }
                if (path.includes('fedi-ui.0.log')) {
                    return Promise.resolve(log0Content)
                }
                return Promise.reject(new Error('File not found'))
            })

            const result = await logFileApi.readLogs()

            expect(result).toBe('OLDER_LOGSNEWER_LOGS')
            expect(result.indexOf('OLDER_LOGS')).toBeLessThan(
                result.indexOf('NEWER_LOGS'),
            )
        })
    })
})
