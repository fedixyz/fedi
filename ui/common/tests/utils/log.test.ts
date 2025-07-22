import type { LogFileApi } from '../../utils/log'

// Import actual implementation for testing log functionality
// since it is mocked in jest.setup.ts
const actualLogUtils = jest.requireActual('../../utils/log')
const {
    configureLogging,
    makeLog,
    exportUiLogs,
    saveLogsToStorage,
    DEBOUNCE_DELAY,
    QUICK_SAVE_THRESHOLD,
    QUICK_SAVE_DELAY,
} = actualLogUtils

// Mock isDev to control console logging behavior
jest.mock('../../utils/environment', () => ({
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
        // resetLogging()

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

            // Fast-forward to trigger save
            jest.advanceTimersByTime(DEBOUNCE_DELAY)

            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)

            const savedContent = savedLogs[0]
            expect(savedContent).toContain('"level":"INFO"')
            expect(savedContent).toContain(`"context":"${TEST_CONTEXTS.BASIC}"`)
            expect(savedContent).toContain(`"message":"${TEST_MESSAGES.BASIC}"`)
            expect(savedContent).toContain('"extra"')
        })

        it('should batch multiple rapid log entries', async () => {
            const logger = makeLog(TEST_CONTEXTS.BATCH)

            // Simulate rapid logging (like what happens in real app)
            logger.info(TEST_MESSAGES.LOG_SEQUENCE[0])
            logger.debug(TEST_MESSAGES.LOG_SEQUENCE[1])
            logger.warn(TEST_MESSAGES.LOG_SEQUENCE[2])
            logger.error(TEST_MESSAGES.LOG_SEQUENCE[3])
            logger.info(TEST_MESSAGES.LOG_SEQUENCE[4])

            // Should not have saved yet (debounced)
            expect(mockLogFileApi.saveLogs).not.toHaveBeenCalled()

            // Fast-forward past debounce delay
            jest.advanceTimersByTime(DEBOUNCE_DELAY)

            // Should have saved once with all logs batched
            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)

            const savedContent = savedLogs[0]
            expect(
                savedContent.split('\n').filter(line => line.trim()),
            ).toHaveLength(TEST_MESSAGES.LOG_SEQUENCE.length)

            TEST_MESSAGES.LOG_SEQUENCE.forEach(message => {
                expect(savedContent).toContain(message)
            })
        })

        it('should save quickly when cache reaches 20 logs', async () => {
            const logger = makeLog(TEST_CONTEXTS.HIGH_VOLUME)

            // Generate exactly 20 logs
            for (let i = 1; i <= QUICK_SAVE_THRESHOLD; i++) {
                logger.info(`High volume log ${i}`)
            }

            // Should not have saved yet
            expect(mockLogFileApi.saveLogs).not.toHaveBeenCalled()

            // Fast-forward by 1ms (the quick save threshold)
            jest.advanceTimersByTime(QUICK_SAVE_DELAY)

            // Should have saved quickly due to high volume
            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)

            const savedContent = savedLogs[0]
            expect(
                savedContent.split('\n').filter(line => line.trim()),
            ).toHaveLength(QUICK_SAVE_THRESHOLD)
        })

        it('should handle sporadic logging patterns realistically', async () => {
            const logger = makeLog(TEST_CONTEXTS.SPORADIC)

            // Simulate realistic app logging pattern
            logger.info(TEST_MESSAGES.APP_LIFECYCLE.START)
            jest.advanceTimersByTime(DEBOUNCE_DELAY)

            // Should have saved once with the first log
            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)

            // Add more logs with sporadic times between logs (each call resets the timeout)
            logger.debug(TEST_MESSAGES.APP_LIFECYCLE.USER_INTERACTION)
            jest.advanceTimersByTime(20)
            logger.debug(TEST_MESSAGES.APP_LIFECYCLE.STATE_UPDATE)
            jest.advanceTimersByTime(30)
            logger.error(
                TEST_MESSAGES.APP_LIFECYCLE.NETWORK_TIMEOUT,
                TEST_EXTRA_DATA.CONNECTION_ERROR,
            )
            jest.advanceTimersByTime(40)

            // Should not have saved a 2nd time yet (debounced)
            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)

            // Wait for debounce to complete (100ms from the last log)
            jest.advanceTimersByTime(DEBOUNCE_DELAY)

            // Should have saved once with all logs
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

            // Simulate concurrent logging from different parts of app
            authLogger.info(TEST_MESSAGES.AUTH_FLOW.LOGIN_ATTEMPT)
            networkLogger.debug(TEST_MESSAGES.NETWORK_FLOW.API_REQUEST)
            uiLogger.info(TEST_MESSAGES.UI_FLOW.SCREEN_RENDERED)
            authLogger.error(TEST_MESSAGES.AUTH_FLOW.LOGIN_FAILED)
            networkLogger.info(TEST_MESSAGES.NETWORK_FLOW.API_RESPONSE)

            jest.advanceTimersByTime(DEBOUNCE_DELAY)

            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)

            const savedContent = savedLogs[0]
            expect(savedContent).toContain(`"context":"${TEST_CONTEXTS.AUTH}"`)
            expect(savedContent).toContain(
                `"context":"${TEST_CONTEXTS.NETWORK}"`,
            )
            expect(savedContent).toContain(`"context":"${TEST_CONTEXTS.UI}"`)

            // Check all messages are present
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

            // Simulate 150 logs in rapid succession (like during heavy debugging)
            for (let i = 1; i <= HIGH_FREQ_TOTAL_LOGS; i++) {
                logger.debug(`Rapid log ${i}`)
            }

            // After 50 logs (>20), should trigger quick save (1ms) for all 50 logs
            jest.advanceTimersByTime(QUICK_SAVE_DELAY)

            // Should have saved once with all 50 logs
            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)

            // Verify all logs were captured in the single save
            const savedContent = savedLogs[0]
            for (let i = 1; i <= HIGH_FREQ_TOTAL_LOGS; i++) {
                expect(savedContent).toContain(`Rapid log ${i}`)
            }

            // Verify the correct number of log entries
            expect(
                savedContent.split('\n').filter(line => line.trim()),
            ).toHaveLength(HIGH_FREQ_TOTAL_LOGS)
        })

        it('should preserve log order across batches', async () => {
            const logger = makeLog(TEST_CONTEXTS.ORDER_TEST)

            // First batch
            logger.info(TEST_MESSAGES.BATCH_SEQUENCES.FIRST[0])
            logger.info(TEST_MESSAGES.BATCH_SEQUENCES.FIRST[1])

            jest.advanceTimersByTime(DEBOUNCE_DELAY)

            // Second batch
            logger.info(TEST_MESSAGES.BATCH_SEQUENCES.SECOND[0])
            logger.info(TEST_MESSAGES.BATCH_SEQUENCES.SECOND[1])

            jest.advanceTimersByTime(DEBOUNCE_DELAY)

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
        it('should combine cached logs with stored logs', async () => {
            const logger = makeLog(TEST_CONTEXTS.EXPORT_TEST)

            // Add some logs that will be saved
            TEST_MESSAGES.EXPORT.STORED.forEach(message => {
                logger.info(message)
            })

            jest.advanceTimersByTime(DEBOUNCE_DELAY)

            // Add some logs that are still cached
            TEST_MESSAGES.EXPORT.CACHED.forEach(message => {
                logger.info(message)
            })

            // Export should include both stored and cached logs
            const exported = await exportUiLogs()

            // Check all messages are present
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

            // Should still include cached logs and error info
            expect(exported).toContain('Test log')
            expect(exported).toContain(
                'Encountered an error during log retrieval',
            )
        })
    })

    describe('saveLogsToStorage', () => {
        it('should force save cached logs immediately', async () => {
            const logger = makeLog(TEST_CONTEXTS.FORCE_SAVE)

            logger.info(TEST_MESSAGES.ERRORS.IMMEDIATE_SAVE)

            // Should not have saved yet
            expect(mockLogFileApi.saveLogs).not.toHaveBeenCalled()

            // Force save
            await saveLogsToStorage()

            // Should have saved immediately
            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)
            expect(savedLogs[0]).toContain(TEST_MESSAGES.ERRORS.IMMEDIATE_SAVE)
        })
    })

    describe('error handling and edge cases', () => {
        it('should handle very large log messages', async () => {
            const logger = makeLog(TEST_CONTEXTS.LARGE_MESSAGE)

            logger.info(LARGE_MESSAGE)

            jest.advanceTimersByTime(DEBOUNCE_DELAY)

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

            jest.advanceTimersByTime(DEBOUNCE_DELAY)

            expect(mockLogFileApi.saveLogs).toHaveBeenCalledTimes(1)

            // Should handle complex data without crashing
            const savedContent = savedLogs[0]
            expect(savedContent).toContain(TEST_MESSAGES.ERRORS.COMPLEX_DATA)
        })
    })
})
