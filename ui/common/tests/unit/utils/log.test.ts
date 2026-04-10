import type { LogFileApi } from '../../../utils/log'

// Import actual implementation for testing log functionality
// since it is mocked in jest.setup.ts
const actualLogUtils = jest.requireActual('../../../utils/log')
const {
    configureLogging,
    resetLogging,
    makeLog,
    exportUiLogs,
    saveLogsToStorage,
    waitForPendingSaves,
} = actualLogUtils

// Mock isDev to control console logging behavior
jest.mock('../../../utils/environment', () => ({
    isDev: jest.fn(() => false), // Default to production mode
}))

// Test data constants
const TEST_CONTEXTS = {
    BASIC: 'test-context',
    BATCH: 'batch-test',
    HIGH_VOLUME: 'high-volume',
    SPORADIC: 'sporadic',
    AUTH: 'auth',
    NETWORK: 'network',
    UI: 'ui',
    HIGH_FREQ: 'high-freq',
    ORDER_TEST: 'order-test',
    EXPORT_TEST: 'export-test',
    ERROR_TEST: 'error-test',
    FORCE_SAVE: 'force-save-test',
    LARGE_MESSAGE: 'large-message-test',
    COMPLEX_DATA: 'complex-data-test',
} as const

const TEST_MESSAGES = {
    BASIC: 'Test message',
    LOG_SEQUENCE: ['Log 1', 'Log 2', 'Log 3', 'Log 4', 'Log 5'],
    APP_LIFECYCLE: {
        START: 'App started',
        USER_INTERACTION: 'User interaction',
        STATE_UPDATE: 'State update',
        NETWORK_TIMEOUT: 'Network timeout',
    },
    AUTH_FLOW: {
        LOGIN_ATTEMPT: 'Login attempt',
        LOGIN_FAILED: 'Login failed',
    },
    NETWORK_FLOW: {
        API_REQUEST: 'API request started',
        API_RESPONSE: 'API response received',
    },
    UI_FLOW: {
        SCREEN_RENDERED: 'Screen rendered',
    },
    BATCH_SEQUENCES: {
        FIRST: ['First batch - Log 1', 'First batch - Log 2'],
        SECOND: ['Second batch - Log 1', 'Second batch - Log 2'],
    },
    EXPORT: {
        STORED: ['Stored log 1', 'Stored log 2'],
        CACHED: ['Cached log 1', 'Cached log 2'],
    },
    ERRORS: {
        CONNECTION_FAILED: 'Connection failed',
        SAVE_FAILURE: 'This should not crash the app',
        IMMEDIATE_SAVE: 'Immediate save test',
        COMPLEX_DATA: 'Complex data test',
    },
} as const

const TEST_EXTRA_DATA = {
    BASIC: { extra: 'data' },
    CONNECTION_ERROR: new Error('Connection failed'),
    COMPLEX_OBJECT: {
        nested: { data: 'value' },
        array: [1, 2, 3],
        error: new Error('Test error'),
        circular: {} as any,
    },
} as const

// Initialize circular reference
TEST_EXTRA_DATA.COMPLEX_OBJECT.circular.self = TEST_EXTRA_DATA.COMPLEX_OBJECT

const HIGH_FREQ_TOTAL_LOGS = 150
const LARGE_MESSAGE = 'x'.repeat(5000)

describe('log utilities', () => {
    let mockLogFileApi: jest.Mocked<LogFileApi>
    let savedLogs: string[] = []

    beforeEach(() => {
        // Reset saved logs
        savedLogs = []

        // Create a mock logFileApi that captures all saved logs
        mockLogFileApi = {
            saveLogs: jest.fn().mockImplementation(async (logs: string) => {
                savedLogs.push(logs)
            }),
            readLogs: jest.fn().mockImplementation(async () => {
                return savedLogs.join('')
            }),
        }

        // Clear all timers and mocks first
        jest.clearAllTimers()
        jest.clearAllMocks()

        // Reset logging state to ensure clean state
        resetLogging()

        // Configure logging with our test-specific mock (overrides global setup)
        configureLogging(mockLogFileApi)

        // Use fake timers for precise timer control
        jest.useFakeTimers()
    })

    afterEach(() => {
        jest.clearAllTimers()
        jest.useRealTimers()
    })

    describe('makeLog and innerLog behavior', () => {
        it('should create log entries with correct format', async () => {
            const logger = makeLog(TEST_CONTEXTS.BASIC)

            logger.info(TEST_MESSAGES.BASIC, TEST_EXTRA_DATA.BASIC)

            // Advance to trigger the serialize+save chunk
            jest.runAllTimers()
            await waitForPendingSaves()

            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)

            const savedContent = savedLogs[0]
            expect(savedContent).toContain('"level":"INFO"')
            expect(savedContent).toContain(`"context":"${TEST_CONTEXTS.BASIC}"`)
            expect(savedContent).toContain(`"message":"${TEST_MESSAGES.BASIC}"`)
            expect(savedContent).toContain('"extra"')
        })

        it('should batch multiple rapid log entries into one save', async () => {
            const logger = makeLog(TEST_CONTEXTS.BATCH)

            logger.info(TEST_MESSAGES.LOG_SEQUENCE[0])
            logger.debug(TEST_MESSAGES.LOG_SEQUENCE[1])
            logger.warn(TEST_MESSAGES.LOG_SEQUENCE[2])
            logger.error(TEST_MESSAGES.LOG_SEQUENCE[3])
            logger.info(TEST_MESSAGES.LOG_SEQUENCE[4])

            // Not saved yet — serialize chunk hasn't run
            expect(mockLogFileApi.saveLogs).not.toHaveBeenCalled()

            jest.runAllTimers()
            await waitForPendingSaves()

            // All entries saved in one chunk
            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)

            const savedContent = savedLogs[0]
            expect(
                savedContent.split('\n').filter(line => line.trim()),
            ).toHaveLength(TEST_MESSAGES.LOG_SEQUENCE.length)

            TEST_MESSAGES.LOG_SEQUENCE.forEach(message => {
                expect(savedContent).toContain(message)
            })
        })

        it('should handle high volume logging', async () => {
            const logger = makeLog(TEST_CONTEXTS.HIGH_VOLUME)

            for (let i = 1; i <= 20; i++) {
                logger.info(`High volume log ${i}`)
            }

            expect(mockLogFileApi.saveLogs).not.toHaveBeenCalled()

            jest.runAllTimers()
            await waitForPendingSaves()

            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)

            const savedContent = savedLogs[0]
            expect(
                savedContent.split('\n').filter(line => line.trim()),
            ).toHaveLength(20)
        })

        it('should save all logs across multiple bursts', async () => {
            const logger = makeLog(TEST_CONTEXTS.SPORADIC)

            logger.info(TEST_MESSAGES.APP_LIFECYCLE.START)
            jest.runAllTimers()
            await waitForPendingSaves()

            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)

            logger.debug(TEST_MESSAGES.APP_LIFECYCLE.USER_INTERACTION)
            logger.debug(TEST_MESSAGES.APP_LIFECYCLE.STATE_UPDATE)
            logger.error(
                TEST_MESSAGES.APP_LIFECYCLE.NETWORK_TIMEOUT,
                TEST_EXTRA_DATA.CONNECTION_ERROR,
            )
            jest.runAllTimers()
            await waitForPendingSaves()

            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(2)

            const savedContent = savedLogs.join('')
            Object.values(TEST_MESSAGES.APP_LIFECYCLE).forEach(message => {
                expect(savedContent).toContain(message)
            })
        })

        it('should handle concurrent logging from multiple contexts', async () => {
            const authLogger = makeLog(TEST_CONTEXTS.AUTH)
            const networkLogger = makeLog(TEST_CONTEXTS.NETWORK)
            const uiLogger = makeLog(TEST_CONTEXTS.UI)

            authLogger.info(TEST_MESSAGES.AUTH_FLOW.LOGIN_ATTEMPT)
            networkLogger.debug(TEST_MESSAGES.NETWORK_FLOW.API_REQUEST)
            uiLogger.info(TEST_MESSAGES.UI_FLOW.SCREEN_RENDERED)
            authLogger.error(TEST_MESSAGES.AUTH_FLOW.LOGIN_FAILED)
            networkLogger.info(TEST_MESSAGES.NETWORK_FLOW.API_RESPONSE)

            jest.runAllTimers()
            await waitForPendingSaves()

            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)

            const savedContent = savedLogs[0]
            expect(savedContent).toContain(`"context":"${TEST_CONTEXTS.AUTH}"`)
            expect(savedContent).toContain(
                `"context":"${TEST_CONTEXTS.NETWORK}"`,
            )
            expect(savedContent).toContain(`"context":"${TEST_CONTEXTS.UI}"`)

            expect(savedContent).toContain(
                TEST_MESSAGES.AUTH_FLOW.LOGIN_ATTEMPT,
            )
            expect(savedContent).toContain(
                TEST_MESSAGES.NETWORK_FLOW.API_REQUEST,
            )
            expect(savedContent).toContain(
                TEST_MESSAGES.UI_FLOW.SCREEN_RENDERED,
            )
        })

        it('should handle very high frequency logging (100+ per second)', async () => {
            const logger = makeLog(TEST_CONTEXTS.HIGH_FREQ)

            for (let i = 1; i <= HIGH_FREQ_TOTAL_LOGS; i++) {
                logger.debug(`Rapid log ${i}`)
            }

            jest.runAllTimers()
            await waitForPendingSaves()

            // All logs captured across however many saves occurred
            const savedContent = savedLogs.join('')
            for (let i = 1; i <= HIGH_FREQ_TOTAL_LOGS; i++) {
                expect(savedContent).toContain(`Rapid log ${i}`)
            }

            expect(
                savedContent.split('\n').filter(line => line.trim()),
            ).toHaveLength(HIGH_FREQ_TOTAL_LOGS)
        })

        it('should preserve log order across batches', async () => {
            const logger = makeLog(TEST_CONTEXTS.ORDER_TEST)

            // First batch
            logger.info(TEST_MESSAGES.BATCH_SEQUENCES.FIRST[0])
            logger.info(TEST_MESSAGES.BATCH_SEQUENCES.FIRST[1])

            jest.runAllTimers()
            await waitForPendingSaves()

            // Second batch
            logger.info(TEST_MESSAGES.BATCH_SEQUENCES.SECOND[0])
            logger.info(TEST_MESSAGES.BATCH_SEQUENCES.SECOND[1])

            jest.runAllTimers()
            await waitForPendingSaves()

            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(2)

            // Verify order within each batch
            TEST_MESSAGES.BATCH_SEQUENCES.FIRST.forEach(message => {
                expect(savedLogs[0]).toContain(message)
            })
            TEST_MESSAGES.BATCH_SEQUENCES.SECOND.forEach(message => {
                expect(savedLogs[1]).toContain(message)
            })

            // Verify chronological order
            const firstBatchLines = savedLogs[0]
                .split('\n')
                .filter(l => l.trim())
            const log1Index = firstBatchLines.findIndex(l =>
                l.includes(TEST_MESSAGES.BATCH_SEQUENCES.FIRST[0]),
            )
            const log2Index = firstBatchLines.findIndex(l =>
                l.includes(TEST_MESSAGES.BATCH_SEQUENCES.FIRST[1]),
            )
            expect(log1Index).toBeLessThan(log2Index)
        })
    })

    describe('exportUiLogs', () => {
        it('should combine saved and pending logs', async () => {
            const logger = makeLog(TEST_CONTEXTS.EXPORT_TEST)

            // These will be saved to disk via chunk
            TEST_MESSAGES.EXPORT.STORED.forEach(message => {
                logger.info(message)
            })
            jest.runAllTimers()
            await waitForPendingSaves()

            // These are still in the queue (no timer advance)
            TEST_MESSAGES.EXPORT.CACHED.forEach(message => {
                logger.info(message)
            })

            // Export should include both saved and pending logs
            const exported = await exportUiLogs()

            const allMessages = [
                ...TEST_MESSAGES.EXPORT.STORED,
                ...TEST_MESSAGES.EXPORT.CACHED,
            ]
            allMessages.forEach(message => {
                expect(exported).toContain(message)
            })
        })

        it('should handle logFileApi errors gracefully', async () => {
            const logger = makeLog(TEST_CONTEXTS.ERROR_TEST)

            // Make readLogs fail
            mockLogFileApi.readLogs.mockRejectedValue(
                new Error('File read failed'),
            )

            logger.info('Test log')

            const exported = await exportUiLogs()

            // Should still include pending logs and error info
            expect(exported).toContain('Test log')
            expect(exported).toContain(
                'Encountered an error during log retrieval',
            )
        })
    })

    describe('saveLogsToStorage', () => {
        it('should save pending logs immediately', async () => {
            const logger = makeLog(TEST_CONTEXTS.FORCE_SAVE)

            logger.info(TEST_MESSAGES.ERRORS.IMMEDIATE_SAVE)

            expect(mockLogFileApi.saveLogs).not.toHaveBeenCalled()

            await saveLogsToStorage()

            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)
            expect(savedLogs[0]).toContain(TEST_MESSAGES.ERRORS.IMMEDIATE_SAVE)
        })
    })

    describe('error handling and edge cases', () => {
        it('should handle very large log messages', async () => {
            const logger = makeLog(TEST_CONTEXTS.LARGE_MESSAGE)

            logger.info(LARGE_MESSAGE)

            jest.runAllTimers()
            await waitForPendingSaves()

            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)

            // Message should be truncated
            const savedContent = savedLogs[0]
            expect(savedContent.length).toBeLessThan(
                LARGE_MESSAGE.length + 1000,
            ) // Some overhead for JSON structure
        })

        it('should handle complex objects and errors in extra data', async () => {
            const logger = makeLog(TEST_CONTEXTS.COMPLEX_DATA)

            logger.error(
                TEST_MESSAGES.ERRORS.COMPLEX_DATA,
                TEST_EXTRA_DATA.COMPLEX_OBJECT,
            )

            jest.runAllTimers()
            await waitForPendingSaves()

            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)

            // Should handle complex data without crashing
            const savedContent = savedLogs[0]
            expect(savedContent).toContain(TEST_MESSAGES.ERRORS.COMPLEX_DATA)
        })
    })
})
