import '@testing-library/jest-dom'
import type { TFunction } from 'i18next'

import { useCommonSelector, useCommonDispatch } from '@fedi/common/hooks/redux'
import { SupportedCurrency } from '@fedi/common/types'
import { FedimintBridge } from '@fedi/common/utils/fedimint'

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

// Mock react-i18next translation hook
// TODO: consider adding the option to return the actual localized strings? or at least dedicate a test suite for it
export const mockUseTranslation = () => ({
    t: ((i18nKey: string) => i18nKey) as TFunction,
})
jest.mock('react-i18next', () => ({
    useTranslation: mockUseTranslation,
}))

// Mock Redux hooks, actions, and selectors
jest.mock('@fedi/common/hooks/redux', () => ({
    useCommonSelector: jest.fn(),
    useCommonDispatch: jest.fn(),
}))

jest.mock('@fedi/common/redux', () => {
    const actual = jest.requireActual('@fedi/common/redux')

    // Create mock functions for all selectors
    const mockSelectors: Record<string, jest.Mock> = {}
    Object.keys(actual).forEach(exportName => {
        if (exportName.startsWith('select')) {
            mockSelectors[exportName] = jest.fn().mockName(exportName)
        }
    })

    return {
        // All selectors as mock functions
        ...mockSelectors,
        // Action creators as mock functions
        setAmountInputType: jest.fn(),
        // Add other action creators as needed
    }
})

// Mock utility hooks
jest.mock('@fedi/common/hooks/util', () => ({
    useUpdatingRef: jest.fn(value => ({ current: value })),
}))

const mockUseCommonSelector = jest.mocked(useCommonSelector)
const mockUseCommonDispatch = jest.mocked(useCommonDispatch)

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

// Default selector values - can be overridden in individual tests
export const mockSelectorValues = (overrides: Record<string, any> = {}) => {
    mockUseCommonSelector.mockImplementation((selector: any) => {
        const selectorName = selector.getMockName()

        // Check if any tests have overridden this selector
        if (overrides[selectorName] !== undefined) {
            return overrides[selectorName]
        }

        // Fall back to default values
        // CONSIDER: Should we even have this in the /setup scope? should test suites just mock what they need within their own scope?
        if (selectorName === 'selectBtcExchangeRate') return 100000
        if (selectorName === 'selectCurrency') return SupportedCurrency.USD
        if (selectorName === 'selectCurrencyLocale') return 'en-US'
        if (selectorName === 'selectAmountInputType') return undefined

        return undefined
    })
}

// Create a comprehensive mock for FedimintBridge
const createMockFedimint = (): jest.Mocked<FedimintBridge> => {
    const mockBridge = {
        // Core RPC methods
        rpc: jest.fn(),
        rpcTyped: jest.fn(),
        rpcResult: jest.fn(),

        getTransaction: jest.fn(),
    } as any

    return mockBridge
}

// Use the mock factory
export const mockFedimint = createMockFedimint()

// Mock factory for i18next TFunction
export const createMockT = (
    translations: Record<string, string> = {},
): TFunction => {
    return ((key: string) => {
        // Return translation if it exists, otherwise return the key (standard i18n behavior)
        return translations[key] || key
    }) as any as TFunction
}

beforeEach(() => {
    // Mock dispatch function
    mockUseCommonDispatch.mockReturnValue(jest.fn())

    // Reset system locale to default
    mockSystemLocaleValue = 'en-US'

    mockSelectorValues()

    // TODO: provide flexible mechanism for clearing/customizing mocked fedimint bridge?
})
