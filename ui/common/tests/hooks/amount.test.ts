/**
 * Tests for useAmountInput hook
 * Testing hook logic in isolation without rendering React components
 */
import { renderHook, act } from '@testing-library/react'

import { useAmountInput, useAmountFormatter } from '@fedi/common/hooks/amount'
import { Sats } from '@fedi/common/types'

import { createMockTransaction } from '../mock-data/transactions'
import { mockSelectorValues, mockSystemLocale } from '../setup/jest.setup'

describe('useAmountInput hook', () => {
    const mockOnChangeAmount = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('initialization', () => {
        const initialAmount = 1000 as Sats

        it('should initialize with correct default values', () => {
            const { result } = renderHook(() =>
                useAmountInput(initialAmount, mockOnChangeAmount),
            )

            expect(result.current.isFiat).toBe(true)
            expect(result.current.satsValue).toBe('1,000')
            expect(result.current.currency).toBe('USD')
            expect(result.current.currencyLocale).toBe('en-US')
            expect(result.current.numpadButtons).toBeDefined()
            expect(result.current.handleNumpadPress).toBeInstanceOf(Function)
        })

        it('should initialize correct fiat mode based on defaultAmountInputType', () => {
            mockSelectorValues({
                selectAmountInputType: 'fiat',
            })

            const { result: resultFiat, unmount } = renderHook(() =>
                useAmountInput(initialAmount, mockOnChangeAmount),
            )

            expect(resultFiat.current.isFiat).toBe(true)
            unmount()

            mockSelectorValues({
                selectAmountInputType: 'sats',
            })

            const { result: resultSats } = renderHook(() =>
                useAmountInput(initialAmount, mockOnChangeAmount),
            )

            expect(resultSats.current.isFiat).toBe(false)
        })
    })

    describe('mode switching', () => {
        it('should switch between fiat and sats modes', () => {
            const { result } = renderHook(() =>
                useAmountInput(1000 as Sats, mockOnChangeAmount),
            )

            expect(result.current.isFiat).toBe(true)

            // Switch to sats mode
            act(() => {
                result.current.setIsFiat(false)
            })

            expect(result.current.isFiat).toBe(false)

            // Switch back to fiat mode
            act(() => {
                result.current.setIsFiat(true)
            })

            expect(result.current.isFiat).toBe(true)
        })
    })

    describe('validation', () => {
        it('should validate minimum amount when initial amount is too low', () => {
            const minimumAmount = 500 as Sats
            const initialAmount = 100 as Sats // Below minimum

            const { result } = renderHook(() =>
                useAmountInput(
                    initialAmount,
                    mockOnChangeAmount,
                    minimumAmount,
                ),
            )

            expect(result.current.validation).toEqual({
                i18nKey: 'errors.invalid-amount-min',
                amount: minimumAmount,
                fiatValue: 0.5, // 500 sats = 0.50 USD
                onlyShowOnSubmit: true,
            })
        })

        it('should validate maximum amount when initial amount is too high', () => {
            const maximumAmount = 1000 as Sats
            const initialAmount = 2000 as Sats // Above maximum

            const { result } = renderHook(() =>
                useAmountInput(
                    initialAmount,
                    mockOnChangeAmount,
                    null,
                    maximumAmount,
                ),
            )

            expect(result.current.validation).toEqual({
                i18nKey: 'errors.invalid-amount-max',
                amount: maximumAmount,
                fiatValue: 1.0, // 1000 sats = 1.00 USD
                onlyShowOnSubmit: false,
            })
        })

        it('should not show validation when amount is within bounds', () => {
            const minimumAmount = 500 as Sats
            const maximumAmount = 2000 as Sats
            const initialAmount = 1000 as Sats // Within bounds

            const { result } = renderHook(() =>
                useAmountInput(
                    initialAmount,
                    mockOnChangeAmount,
                    minimumAmount,
                    maximumAmount,
                ),
            )

            expect(result.current.validation).toBeUndefined()
        })
    })

    describe('input handlers', () => {
        it('should provide functions to handle input changes', () => {
            const { result } = renderHook(() =>
                useAmountInput(1000 as Sats, mockOnChangeAmount),
            )

            expect(result.current.handleChangeFiat).toBeInstanceOf(Function)
            expect(result.current.handleChangeSats).toBeInstanceOf(Function)
            expect(result.current.handleNumpadPress).toBeInstanceOf(Function)
        })
        it('handleChangeSats invokes expected state changes', () => {
            mockSelectorValues({
                selectAmountInputType: 'sats',
                selectBtcExchangeRate: 100000,
            })
            const { result } = renderHook(() =>
                useAmountInput(0 as Sats, mockOnChangeAmount),
            )
            expect(result.current.satsValue).toBe('0')
            expect(result.current.fiatValue).toBe('0')

            act(() => {
                result.current.handleChangeSats('10000')
            })

            expect(mockOnChangeAmount).toHaveBeenCalled()
            expect(mockOnChangeAmount).toHaveBeenCalledWith(10000)
            expect(result.current.satsValue).toBe('10,000')
            expect(result.current.fiatValue).toBe('10.00') // 10K sats = 10.00 USD
        })
        it('handleChangeFiat invokes expected state changes', () => {
            mockSelectorValues({
                selectAmountInputType: 'fiat',
                selectBtcExchangeRate: 100000,
            })
            const { result } = renderHook(() =>
                useAmountInput(0 as Sats, mockOnChangeAmount),
            )

            act(() => {
                result.current.handleChangeFiat('1000')
            })

            expect(mockOnChangeAmount).toHaveBeenCalled()
            // onChangeAmoutn should always be called with correct sats value
            expect(mockOnChangeAmount).toHaveBeenCalledWith(1000000)
            expect(result.current.fiatValue).toBe('1,000')
            expect(result.current.satsValue).toBe('1,000,000') // 1K USD = 1,000,000 sats
        })
    })

    describe('when amount type is in sats', () => {
        beforeEach(() => {
            mockSelectorValues({
                selectAmountInputType: 'sats',
            })
        })
        describe('typical numpad usage', () => {
            it('numpad sequence: 1 + 0 + 0 + 0 + 0 = 10K sats = 10 USD', () => {
                const initialAmount = 0 as Sats

                const { result } = renderHook(() =>
                    useAmountInput(initialAmount, mockOnChangeAmount),
                )
                expect(result.current.satsValue).toBe('0')
                expect(result.current.fiatValue).toBe('0')
                act(() => {
                    result.current.handleNumpadPress(1)
                })
                expect(result.current.satsValue).toBe('1')
                expect(result.current.fiatValue).toBe('0.00')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.satsValue).toBe('10')
                expect(result.current.fiatValue).toBe('0.01')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.satsValue).toBe('100')
                expect(result.current.fiatValue).toBe('0.10')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.satsValue).toBe('1,000')
                expect(result.current.fiatValue).toBe('1.00')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.satsValue).toBe('10,000')
                expect(result.current.fiatValue).toBe('10.00')
            })
        })
        describe('unusual numpad usage', () => {
            it('ignores leading zeroes (numpad sequence: 0 + 0 + 1 + 0 + 0 + 0 + 0 = 10K sats = 10 USD)', () => {
                const initialAmount = 0 as Sats

                const { result } = renderHook(() =>
                    useAmountInput(initialAmount, mockOnChangeAmount),
                )
                expect(result.current.satsValue).toBe('0')
                expect(result.current.fiatValue).toBe('0')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.satsValue).toBe('0')
                expect(result.current.fiatValue).toBe('0.00')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.satsValue).toBe('0')
                expect(result.current.fiatValue).toBe('0.00')
                act(() => {
                    result.current.handleNumpadPress(1)
                })
                expect(result.current.satsValue).toBe('1')
                expect(result.current.fiatValue).toBe('0.00')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.satsValue).toBe('10')
                expect(result.current.fiatValue).toBe('0.01')
                act(() => {
                    result.current.handleNumpadPress('.')
                })
                expect(result.current.satsValue).toBe('10')
                expect(result.current.fiatValue).toBe('0.01')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.satsValue).toBe('100')
                expect(result.current.fiatValue).toBe('0.10')
                act(() => {
                    result.current.handleNumpadPress('.')
                })
                expect(result.current.satsValue).toBe('100')
                expect(result.current.fiatValue).toBe('0.10')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.satsValue).toBe('1,000')
                expect(result.current.fiatValue).toBe('1.00')
                act(() => {
                    result.current.handleNumpadPress('.')
                })
                expect(result.current.satsValue).toBe('1,000')
                expect(result.current.fiatValue).toBe('1.00')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.satsValue).toBe('10,000')
                expect(result.current.fiatValue).toBe('10.00')
            })
            it('ignores decimals for sats (numpad sequence: 1 + 0 + . + 0 + . + 0 + . + 0 = 10K sats = 10 USD)', () => {
                const initialAmount = 0 as Sats

                const { result } = renderHook(() =>
                    useAmountInput(initialAmount, mockOnChangeAmount),
                )
                expect(result.current.satsValue).toBe('0')
                expect(result.current.fiatValue).toBe('0')
                act(() => {
                    result.current.handleNumpadPress(1)
                })
                expect(result.current.satsValue).toBe('1')
                expect(result.current.fiatValue).toBe('0.00')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.satsValue).toBe('10')
                expect(result.current.fiatValue).toBe('0.01')
                act(() => {
                    result.current.handleNumpadPress('.')
                })
                expect(result.current.satsValue).toBe('10')
                expect(result.current.fiatValue).toBe('0.01')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.satsValue).toBe('100')
                expect(result.current.fiatValue).toBe('0.10')
                act(() => {
                    result.current.handleNumpadPress('.')
                })
                expect(result.current.satsValue).toBe('100')
                expect(result.current.fiatValue).toBe('0.10')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.satsValue).toBe('1,000')
                expect(result.current.fiatValue).toBe('1.00')
                act(() => {
                    result.current.handleNumpadPress('.')
                })
                expect(result.current.satsValue).toBe('1,000')
                expect(result.current.fiatValue).toBe('1.00')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.satsValue).toBe('10,000')
                expect(result.current.fiatValue).toBe('10.00')
            })
        })

        describe('numpad usage across different locales', () => {
            it('should handle decimal separator locales (ex: 1.000 sats)', () => {
                mockSelectorValues({
                    selectAmountInputType: 'sats',
                    // 1000 should become "1.000" in German formatting
                    selectCurrencyLocale: 'de-DE',
                })
                // Mock system locale to use German formatting for number display
                mockSystemLocale('de-DE')

                const { result } = renderHook(() =>
                    useAmountInput(0 as Sats, mockOnChangeAmount),
                )

                act(() => {
                    result.current.handleChangeSats('1000')
                })

                expect(result.current.satsValue).toBe('1.000')
            })

            it('should handle space separators (ex: 1 000 sats)', () => {
                mockSelectorValues({
                    selectAmountInputType: 'sats',
                    // 1000 should become "1 000" in French formatting
                    selectCurrencyLocale: 'fr-FR',
                })
                // Mock system locale to use French formatting for number display
                mockSystemLocale('fr-FR')

                const { result } = renderHook(() =>
                    useAmountInput(0 as Sats, mockOnChangeAmount),
                )

                act(() => {
                    result.current.handleChangeSats('1000')
                })

                expect(result.current.satsValue).toBe('1 000') // test for non-breaking space char
            })
        })
    })

    describe('when amount type is in fiat', () => {
        beforeEach(() => {
            mockSelectorValues({
                selectAmountInputType: 'fiat',
            })
        })
        describe('typical numpad usage', () => {
            it('numpad sequence: 1 + 0 + 0 + 0 + 0 = 1K USD = 1M sats', () => {
                const initialAmount = 0 as Sats

                const { result } = renderHook(() =>
                    useAmountInput(initialAmount, mockOnChangeAmount),
                )
                expect(result.current.fiatValue).toBe('0')
                expect(result.current.satsValue).toBe('0')
                act(() => {
                    result.current.handleNumpadPress(1)
                })
                expect(result.current.fiatValue).toBe('1')
                expect(result.current.satsValue).toBe('1,000')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.fiatValue).toBe('10')
                expect(result.current.satsValue).toBe('10,000')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.fiatValue).toBe('100')
                expect(result.current.satsValue).toBe('100,000')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.fiatValue).toBe('1,000')
                expect(result.current.satsValue).toBe('1,000,000')
            })
            it('numpad sequence: 1 + 2 + . + 3 + 4 = 12.34 USD = 12,340 sats', () => {
                const initialAmount = 0 as Sats

                const { result } = renderHook(() =>
                    useAmountInput(initialAmount, mockOnChangeAmount),
                )
                expect(result.current.fiatValue).toBe('0')
                expect(result.current.satsValue).toBe('0')
                act(() => {
                    result.current.handleNumpadPress(1)
                })
                expect(result.current.fiatValue).toBe('1')
                expect(result.current.satsValue).toBe('1,000')
                act(() => {
                    result.current.handleNumpadPress(2)
                })
                expect(result.current.fiatValue).toBe('12')
                expect(result.current.satsValue).toBe('12,000')
                act(() => {
                    result.current.handleNumpadPress('.')
                })
                expect(result.current.fiatValue).toBe('12.00')
                expect(result.current.satsValue).toBe('12,000')
                act(() => {
                    result.current.handleNumpadPress(3)
                })
                expect(result.current.fiatValue).toBe('12.30')
                expect(result.current.satsValue).toBe('12,300')
                act(() => {
                    result.current.handleNumpadPress(4)
                })
                expect(result.current.fiatValue).toBe('12.34')
                expect(result.current.satsValue).toBe('12,340')
            })
        })
        describe('unusual numpad usage', () => {
            it('ignores leading zeroes (numpad sequence: 0 + 0 + 1 + 0 + 0 + 0 + 0 = 1K USD = 1M sats)', () => {
                const initialAmount = 0 as Sats

                const { result } = renderHook(() =>
                    useAmountInput(initialAmount, mockOnChangeAmount),
                )
                expect(result.current.fiatValue).toBe('0')
                expect(result.current.satsValue).toBe('0')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.fiatValue).toBe('0')
                expect(result.current.satsValue).toBe('0')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.fiatValue).toBe('0')
                expect(result.current.satsValue).toBe('0')
                act(() => {
                    result.current.handleNumpadPress(1)
                })
                expect(result.current.fiatValue).toBe('1')
                expect(result.current.satsValue).toBe('1,000')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.fiatValue).toBe('10')
                expect(result.current.satsValue).toBe('10,000')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.fiatValue).toBe('100')
                expect(result.current.satsValue).toBe('100,000')
                act(() => {
                    result.current.handleNumpadPress(0)
                })
                expect(result.current.fiatValue).toBe('1,000')
                expect(result.current.satsValue).toBe('1,000,000')
            })
        })

        describe('numpad usage across different locales', () => {
            it('should handle locales with inverted thousands & decimal separators (ex: 1.000,00 EUR)', () => {
                // Test German locale where dot is thousands separator, comma is decimal
                mockSelectorValues({
                    selectAmountInputType: 'fiat',
                    selectCurrency: 'EUR',
                    // 1000 should become "1.000" in German formatting
                    selectCurrencyLocale: 'de-DE',
                })
                mockSystemLocale('de-DE')

                const { result } = renderHook(() =>
                    useAmountInput(0 as Sats, mockOnChangeAmount),
                )

                // numpad sequence: 1 + 2 + 3 + 4 + . + 5 + 6 = 1.234,56 EUR
                act(() => {
                    result.current.handleNumpadPress(1)
                })
                expect(result.current.fiatValue).toBe('1')

                act(() => {
                    result.current.handleNumpadPress(2)
                })
                expect(result.current.fiatValue).toBe('12')

                act(() => {
                    result.current.handleNumpadPress(3)
                })
                expect(result.current.fiatValue).toBe('123')

                act(() => {
                    result.current.handleNumpadPress(4)
                })
                expect(result.current.fiatValue).toBe('1.234')

                act(() => {
                    result.current.handleNumpadPress('.')
                })
                expect(result.current.fiatValue).toBe('1.234,00')

                act(() => {
                    result.current.handleNumpadPress(5)
                })
                expect(result.current.fiatValue).toBe('1.234,50')

                act(() => {
                    result.current.handleNumpadPress(6)
                })
                expect(result.current.fiatValue).toBe('1.234,56')
            })

            it('should handle locales with non-breaking space thousands separator (ex: 1 000,00 EUR)', () => {
                mockSelectorValues({
                    selectAmountInputType: 'fiat',
                    selectCurrency: 'EUR',
                    // 1000 should become "1 000" in French formatting
                    selectCurrencyLocale: 'fr-FR',
                })
                mockSystemLocale('fr-FR')

                const { result } = renderHook(() =>
                    useAmountInput(0 as Sats, mockOnChangeAmount),
                )

                // numpad sequence: 1 + 2 + 3 + 4 + 5 + . + 6 + 7 = 12 345,67 EUR
                act(() => {
                    result.current.handleNumpadPress(1)
                })
                expect(result.current.fiatValue).toBe('1')
                act(() => {
                    result.current.handleNumpadPress(2)
                })
                expect(result.current.fiatValue).toBe('12')
                act(() => {
                    result.current.handleNumpadPress(3)
                })
                expect(result.current.fiatValue).toBe('123')
                act(() => {
                    result.current.handleNumpadPress(4)
                })
                expect(result.current.fiatValue).toBe('1 234')
                act(() => {
                    result.current.handleNumpadPress(5)
                })
                expect(result.current.fiatValue).toBe('12 345')
                act(() => {
                    result.current.handleNumpadPress('.')
                })
                expect(result.current.fiatValue).toBe('12 345,00')
                act(() => {
                    result.current.handleNumpadPress(6)
                })
                expect(result.current.fiatValue).toBe('12 345,60')

                act(() => {
                    result.current.handleNumpadPress(7)
                })
                expect(result.current.fiatValue).toBe('12 345,67')
            })

            it('should reject decimal input for zero-decimal currencies (ex: JPY, KRW)', () => {
                mockSelectorValues({
                    selectAmountInputType: 'fiat',
                    selectCurrency: 'JPY',
                    // 123.45 should become "12,345" in Japanese formatting
                    selectCurrencyLocale: 'ja-JP',
                })
                mockSystemLocale('ja-JP')

                const { result } = renderHook(() =>
                    useAmountInput(0 as Sats, mockOnChangeAmount),
                )

                act(() => {
                    result.current.handleNumpadPress(1)
                })
                act(() => {
                    result.current.handleNumpadPress(2)
                })
                act(() => {
                    result.current.handleNumpadPress(3)
                })
                expect(result.current.fiatValue).toBe('123')
                act(() => {
                    result.current.handleNumpadPress('.')
                })
                expect(result.current.fiatValue).toBe('123')

                act(() => {
                    result.current.handleNumpadPress(4)
                })
                expect(result.current.fiatValue).toBe('1,234')
                act(() => {
                    result.current.handleNumpadPress(5)
                })
                expect(result.current.fiatValue).toBe('12,345')
            })
        })
    })
})

describe('useAmountFormatter hook', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('makeFormattedAmountsFromTxn with historical exchange rates', () => {
        it('uses historical exchange rate when txDateFiatInfo is present', () => {
            mockSelectorValues({
                selectBtcExchangeRate: 100000, // Current rate: $100K per BTC
                selectBtcUsdExchangeRate: 100000,
                selectCurrency: 'USD',
                selectCurrencyLocale: 'en-US',
                selectShowFiatTxnAmounts: false,
            })

            const { result } = renderHook(() => useAmountFormatter())

            const txn = createMockTransaction({
                amount: 100000000000, // 1 BTC in msats
                txDateFiatInfo: {
                    btcToFiatHundredths: 4000000, // Historical rate: $40K per BTC
                    fiatCode: 'USD',
                },
            })

            const formatted = result.current.makeFormattedAmountsFromTxn(
                txn,
                'none',
            )

            // Should use historical rate ($40k) not current rate ($100k)
            expect(formatted.formattedFiat).toBe('40,000.00')
            expect(formatted.formattedSats).toBe('100,000,000')
        })

        it('falls back to current exchange rates when txDateFiatInfo is missing', () => {
            mockSelectorValues({
                selectBtcExchangeRate: 100000, // Current rate: $100K per BTC
                selectBtcUsdExchangeRate: 100000,
                selectCurrency: 'USD',
                selectCurrencyLocale: 'en-US',
                selectShowFiatTxnAmounts: false,
            })

            const { result } = renderHook(() => useAmountFormatter())

            const txn = createMockTransaction({
                amount: 100000000000, // 1 BTC, no historical data
            })

            const formatted = result.current.makeFormattedAmountsFromTxn(
                txn,
                'none',
            )

            expect(formatted.formattedFiat).toBe('100,000.00')
            expect(formatted.formattedSats).toBe('100,000,000')
        })

        it('works with different fiat currencies in historical data', () => {
            mockSelectorValues({
                selectBtcExchangeRate: 45000, // Current EUR rate
                selectBtcUsdExchangeRate: 50000,
                selectCurrency: 'EUR',
                selectCurrencyLocale: 'de-DE',
                selectShowFiatTxnAmounts: false,
            })
            mockSystemLocale('de-DE')

            const { result } = renderHook(() => useAmountFormatter())

            const txn = createMockTransaction({
                amount: 10000000000, // 0.1 BTC
                txDateFiatInfo: {
                    btcToFiatHundredths: 4500000, // Historical rate: €45,000.00 per BTC
                    fiatCode: 'EUR',
                },
            })

            const formatted = result.current.makeFormattedAmountsFromTxn(
                txn,
                'none',
            )

            // Should use EUR historical rate and currency
            expect(formatted.formattedFiat).toBe('4.500,00')
            expect(formatted.formattedSats).toBe('10.000.000')
        })

        it('respects showFiatTxnAmounts setting with historical data', () => {
            mockSelectorValues({
                selectBtcExchangeRate: 100000,
                selectBtcUsdExchangeRate: 100000,
                selectCurrency: 'USD',
                selectCurrencyLocale: 'en-US',
                selectShowFiatTxnAmounts: true, // with fiat display preference
            })

            const { result: fiatPrimaryResult } = renderHook(() =>
                useAmountFormatter(),
            )

            const txn = createMockTransaction({
                amount: 1000000000, // 0.01 BTC
                txDateFiatInfo: {
                    btcToFiatHundredths: 6000000, // Historical rate: $60,000.00 per BTC
                    fiatCode: 'USD',
                },
            })

            const fiatPrimaryFormatted =
                fiatPrimaryResult.current.makeFormattedAmountsFromTxn(txn)

            // When fiat is primary, historical fiat should be primary
            expect(fiatPrimaryFormatted.formattedPrimaryAmount).toBe(
                '600.00 USD',
            )
            expect(fiatPrimaryFormatted.formattedSecondaryAmount).toBe(
                '1,000,000 SATS',
            )

            mockSelectorValues({
                selectBtcExchangeRate: 100000,
                selectBtcUsdExchangeRate: 100000,
                selectCurrency: 'USD',
                selectCurrencyLocale: 'en-US',
                selectShowFiatTxnAmounts: false, // don't show fiat display preference
            })

            const { result: satsPrimaryResult } = renderHook(() =>
                useAmountFormatter(),
            )

            const satsPrimaryFormatted =
                satsPrimaryResult.current.makeFormattedAmountsFromTxn(txn)

            // When sats is primary, sats should be primary
            expect(satsPrimaryFormatted.formattedPrimaryAmount).toBe(
                '1,000,000 SATS',
            )
            expect(satsPrimaryFormatted.formattedSecondaryAmount).toBe(
                '600.00 USD',
            )
        })

        it('handles small historical amounts with proper precision', () => {
            mockSelectorValues({
                selectBtcExchangeRate: 100000,
                selectBtcUsdExchangeRate: 100000,
                selectCurrency: 'USD',
                selectCurrencyLocale: 'en-US',
                selectShowFiatTxnAmounts: false,
            })

            const { result } = renderHook(() => useAmountFormatter())

            const txn = createMockTransaction({
                amount: 1000000, // 1000 sats (0.00001 BTC)
                txDateFiatInfo: {
                    btcToFiatHundredths: 5000000, // Historical rate: $50K per BTC
                    fiatCode: 'USD',
                },
            })

            const formatted = result.current.makeFormattedAmountsFromTxn(
                txn,
                'none',
            )

            // 1000 sats * $50K / 100,000,000 sats = $0.50
            expect(formatted.formattedFiat).toBe('0.50')
            expect(formatted.formattedSats).toBe('1,000')
        })
    })
})
