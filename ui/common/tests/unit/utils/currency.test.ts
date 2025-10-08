import { selectLoadedFederations } from '@fedi/common/redux'
// Import directly from the currency file to avoid circular dependency issues
import {
    selectCurrency,
    selectFederationCurrency,
    selectOverrideCurrency,
    selectFederationDefaultCurrency,
} from '@fedi/common/redux/currency'

import { SelectableCurrency, SupportedCurrency } from '../../../types'
import { getFederationDefaultCurrency } from '../../../utils/FederationUtils'
import { getCurrencyCode } from '../../../utils/currency'

// Mock the dependencies first
jest.mock('@fedi/common/redux', () => ({
    selectLoadedFederations: jest.fn(),
}))

jest.mock('../../../utils/FederationUtils', () => ({
    getFederationDefaultCurrency: jest.fn(),
}))

// Mock CommonState type for tests
type MockCommonState = {
    currency: {
        overrideCurrency: any
        customFederationCurrencies: Record<string, any>
        btcUsdRate: number
        fiatUsdRates: Record<string, number>
        currencyLocale: undefined
    }
}

// Mock data for tests
const mockState: MockCommonState = {
    currency: {
        overrideCurrency: null,
        customFederationCurrencies: {},
        btcUsdRate: 50000,
        fiatUsdRates: { KES: 130, AUD: 1.5 },
        currencyLocale: undefined,
    },
}

const mockFederations = [
    {
        id: 'fed1',
        meta: { default_currency: 'USD' },
    },
    {
        id: 'fed2',
        meta: { default_currency: 'KES' },
    },
    {
        id: 'fed3',
        meta: {}, // No default currency
    },
]

const mockSelectLoadedFederations =
    selectLoadedFederations as jest.MockedFunction<
        typeof selectLoadedFederations
    >
const mockGetFederationDefaultCurrency =
    getFederationDefaultCurrency as jest.MockedFunction<
        typeof getFederationDefaultCurrency
    >

// TODO: Rewrite this entire test suite to use the new mockReduxProvider and split out util tests vs hook/selector tests
describe('currency', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        // Reset to default implementations
        mockSelectLoadedFederations.mockReturnValue(mockFederations as any)
        mockGetFederationDefaultCurrency.mockImplementation(meta => {
            const currency = meta?.default_currency
            return currency ? (currency as SelectableCurrency) : null
        })
    })

    describe('getCurrencyCode', () => {
        it('correctly returns a three-letter currency code', () => {
            expect(getCurrencyCode(SupportedCurrency.USD)).toBe('USD')
        })

        it('correctly returns a generic currency code for aliases', () => {
            expect(getCurrencyCode('mali')).toBe('XOF')
        })
    })

    describe('selectOverrideCurrency', () => {
        it('returns null when no override is set', () => {
            const state = { ...mockState }
            expect(selectOverrideCurrency(state as any)).toBe(null)
        })

        it('returns the override currency when set', () => {
            const state = {
                ...mockState,
                currency: {
                    ...mockState.currency,
                    overrideCurrency: SupportedCurrency.KES,
                },
            }
            expect(selectOverrideCurrency(state as any)).toBe(
                SupportedCurrency.KES,
            )
        })
    })

    describe('selectFederationDefaultCurrency', () => {
        it('returns USD when federation has USD default', () => {
            const state = { ...mockState }
            expect(selectFederationDefaultCurrency(state as any, 'fed1')).toBe(
                'USD',
            )
        })

        it('returns KES when federation has KES default', () => {
            const state = { ...mockState }
            expect(selectFederationDefaultCurrency(state as any, 'fed2')).toBe(
                'KES',
            )
        })

        it('returns USD when federation has no default currency', () => {
            const state = { ...mockState }
            expect(selectFederationDefaultCurrency(state as any, 'fed3')).toBe(
                SupportedCurrency.USD,
            )
        })

        it('returns USD when federation is not found', () => {
            const state = { ...mockState }
            expect(
                selectFederationDefaultCurrency(state as any, 'nonexistent'),
            ).toBe(SupportedCurrency.USD)
        })
    })

    describe('selectFederationCurrency', () => {
        describe('Priority 1: Custom federation currency', () => {
            it('returns custom federation currency when set', () => {
                const state = {
                    ...mockState,
                    currency: {
                        ...mockState.currency,
                        customFederationCurrencies: {
                            fed1: SupportedCurrency.EUR,
                        },
                        overrideCurrency: SupportedCurrency.KES, // Should be ignored
                    },
                }
                expect(selectFederationCurrency(state as any, 'fed1')).toBe(
                    SupportedCurrency.EUR,
                )
            })
        })

        describe('Priority 2: Global override currency', () => {
            it('returns override currency when no custom currency set', () => {
                const state = {
                    ...mockState,
                    currency: {
                        ...mockState.currency,
                        overrideCurrency: SupportedCurrency.KES,
                    },
                }
                expect(selectFederationCurrency(state as any, 'fed1')).toBe(
                    SupportedCurrency.KES,
                )
            })

            it('returns override currency even when federation has different default', () => {
                const state = {
                    ...mockState,
                    currency: {
                        ...mockState.currency,
                        overrideCurrency: SupportedCurrency.AUD,
                    },
                }
                expect(selectFederationCurrency(state as any, 'fed2')).toBe(
                    SupportedCurrency.AUD,
                ) // fed2 has KES default
            })
        })

        describe('Priority 3: Federation default currency', () => {
            it('returns federation default when no custom or override set', () => {
                const state = { ...mockState }
                expect(selectFederationCurrency(state as any, 'fed2')).toBe(
                    'KES',
                )
            })

            it('returns USD when federation has no default and no overrides', () => {
                const state = { ...mockState }
                expect(selectFederationCurrency(state as any, 'fed3')).toBe(
                    SupportedCurrency.USD,
                )
            })
        })
    })

    // TODO: fix these tests along with the refactor to use mockReduxProvider mentioned in the TOOD above
    describe.skip('selectCurrency', () => {
        describe('has no loaded federations', () => {
            beforeEach(() => {
                mockSelectLoadedFederations.mockReturnValue([])
            })

            it('returns USD when no federationId and no override', () => {
                const state = { ...mockState }
                expect(selectCurrency(state as any)).toBe(SupportedCurrency.USD)
            })

            it('returns override currency when no federationId but override set', () => {
                const state = {
                    ...mockState,
                    currency: {
                        ...mockState.currency,
                        overrideCurrency: SupportedCurrency.KES,
                    },
                }
                expect(selectCurrency(state as any)).toBe(SupportedCurrency.KES)
            })
        })

        describe('has loaded federations', () => {
            beforeEach(() => {
                mockSelectLoadedFederations.mockReturnValue(
                    mockFederations as any,
                )
            })

            it('returns USD when no federationId and no override', () => {
                const state = { ...mockState }
                expect(selectCurrency(state as any)).toBe(SupportedCurrency.USD)
            })

            it('returns override currency when no federationId but override set', () => {
                const state = {
                    ...mockState,
                    currency: {
                        ...mockState.currency,
                        overrideCurrency: SupportedCurrency.KES,
                    },
                }
                expect(selectCurrency(state as any)).toBe(SupportedCurrency.KES)
            })

            it("delegates to the federation's currency when federationId is provided", () => {
                const state = {
                    ...mockState,
                    currency: {
                        ...mockState.currency,
                        overrideCurrency: SupportedCurrency.USD,
                    },
                }
                expect(selectCurrency(state as any, 'fed2')).toBe(
                    SupportedCurrency.KES,
                )
            })
            it('custom federation currency overrides everything', () => {
                const state = {
                    ...mockState,
                    currency: {
                        ...mockState.currency,
                        customFederationCurrencies: {
                            fed1: SupportedCurrency.EUR,
                        },
                        overrideCurrency: SupportedCurrency.KES, // Should be ignored
                    },
                }
                expect(selectCurrency(state as any, 'fed1')).toBe(
                    SupportedCurrency.EUR,
                )
            })
        })
    })
})
