import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'
import { type TFunction } from 'i18next'

// Use this file for generic global mocks that are not specific to a single test suite

// default timeout for waitFor functions
// currently at 30 seconds since there seems to be some bottleneck
// where we sometimes have to wait a long time to assert matrix state
configure({ asyncUtilTimeout: 60000 })

// Store the original Intl.NumberFormat for mocking
const OriginalIntlNumberFormat = Intl.NumberFormat

// Mock logger used throughout the codebase
jest.mock('@fedi/common/utils/log', () => ({
    ...jest.requireActual('@fedi/common/utils/log'),
    makeLog: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
    configureLogging: jest.fn(),
    saveLogsToStorage: jest.fn().mockResolvedValue(undefined),
    exportUiLogs: jest.fn().mockResolvedValue(''),
    exportLegacyUiLogs: jest.fn().mockResolvedValue(''),
}))

// mock for when you need to pass a TFunction to a hook
export const createMockT = (
    translations: Record<string, string> = {},
): TFunction => {
    return ((key: string) => {
        // Return translation if it exists, otherwise return the key (standard i18n behavior)
        return translations[key] || key
    }) as any as TFunction
}

// Mock Intl.NumberFormat to allow tests to control system locale
let mockSystemLocaleValue = 'en-US'
global.Intl.NumberFormat = jest.fn(
    (locale?: string | string[], options?: any) => {
        // Use the mock system locale when no locale is explicitly provided
        const effectiveLocale = locale || mockSystemLocaleValue
        return new OriginalIntlNumberFormat(effectiveLocale, options)
    },
) as any

// Function for tests to mock the system locale
export const mockSystemLocale = (locale: string) => {
    mockSystemLocaleValue = locale
}

beforeEach(() => {
    // Reset system locale to default
    mockSystemLocaleValue = 'en-US'
})
