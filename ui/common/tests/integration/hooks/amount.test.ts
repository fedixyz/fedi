/**
 * Tests for useAmountInput hook
 * Testing hook logic in isolation without rendering React components
 */
import { act } from '@testing-library/react'

import { useAmountInput } from '@fedi/common/hooks/amount'
import {
    setAmountInputType,
    changeOverrideCurrency,
    setCurrencyLocale,
    fetchCurrencyPrices,
} from '@fedi/common/redux'
import { Sats, SupportedCurrency } from '@fedi/common/types'

import { setupRemoteBridgeTests } from '../../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../../utils/render'
import { mockSystemLocale } from '../../utils/setup'

describe('useAmountInput hook', () => {
    const mockOnChangeAmount = jest.fn()

    const context = setupRemoteBridgeTests()

    describe('initialization', () => {
        const initialAmount = 1000 as Sats

        it('should initialize with correct default values', () => {
            const { store, bridge } = context
            store.dispatch({
                type: fetchCurrencyPrices.fulfilled.type,
                payload: {
                    btcUsdRate: 100000,
                    fiatUsdRates: {},
                },
            })
            store.dispatch(changeOverrideCurrency(SupportedCurrency.USD))
            store.dispatch(setCurrencyLocale('en-US'))
            store.dispatch(setAmountInputType('fiat'))

            const { result } = renderHookWithBridge(
                () => useAmountInput(initialAmount, mockOnChangeAmount),
                store,
                bridge.fedimint,
            )

            expect(result.current.isFiat).toBe(true)
            expect(result.current.satsValue).toBe('1,000')
            expect(result.current.currency).toBe('USD')
            expect(result.current.currencyLocale).toBe('en-US')
            expect(result.current.numpadButtons).toBeDefined()
            expect(result.current.handleNumpadPress).toBeInstanceOf(Function)
        })

        it('should initialize correct fiat mode based on defaultAmountInputType', () => {
            const { store, bridge } = context
            store.dispatch(setAmountInputType('fiat'))

            const { result: resultFiat, unmount } = renderHookWithBridge(
                () => useAmountInput(initialAmount, mockOnChangeAmount),
                store,
                bridge.fedimint,
            )

            expect(resultFiat.current.isFiat).toBe(true)
            unmount()

            store.dispatch(setAmountInputType('sats'))

            const { result: resultSats } = renderHookWithBridge(
                () => useAmountInput(initialAmount, mockOnChangeAmount),
                store,
                bridge.fedimint,
            )

            expect(resultSats.current.isFiat).toBe(false)
        })
    })

    describe('mode switching', () => {
        it('should switch between fiat and sats modes', () => {
            const { store, bridge } = context

            const { result } = renderHookWithBridge(
                () => useAmountInput(1000 as Sats, mockOnChangeAmount),
                store,
                bridge.fedimint,
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
        beforeEach(() => {
            const { store } = context
            store.dispatch({
                type: fetchCurrencyPrices.fulfilled.type,
                payload: {
                    btcUsdRate: 100000,
                    fiatUsdRates: {},
                },
            })
            store.dispatch(changeOverrideCurrency(SupportedCurrency.USD))
        })

        it('should validate minimum amount when initial amount is too low', () => {
            const { store, bridge } = context

            const minimumAmount = 500 as Sats
            const initialAmount = 100 as Sats // Below minimum

            const { result } = renderHookWithBridge(
                () =>
                    useAmountInput(
                        initialAmount,
                        mockOnChangeAmount,
                        minimumAmount,
                    ),
                store,
                bridge.fedimint,
            )

            expect(result.current.validation).toEqual({
                i18nKey: 'errors.invalid-amount-min',
                amount: minimumAmount,
                fiatValue: 0.5, // 500 sats = 0.50 USD
                onlyShowOnSubmit: true,
            })
        })

        it('should validate maximum amount when initial amount is too high', () => {
            const { store, bridge } = context

            const maximumAmount = 1000 as Sats
            const initialAmount = 2000 as Sats // Above maximum

            const { result } = renderHookWithBridge(
                () =>
                    useAmountInput(
                        initialAmount,
                        mockOnChangeAmount,
                        null,
                        maximumAmount,
                    ),
                store,
                bridge.fedimint,
            )

            expect(result.current.validation).toEqual({
                i18nKey: 'errors.invalid-amount-max',
                amount: maximumAmount,
                fiatValue: 1.0, // 1000 sats = 1.00 USD
                onlyShowOnSubmit: false,
            })
        })

        it('should not show validation when amount is within bounds', () => {
            const { store, bridge } = context

            const minimumAmount = 500 as Sats
            const maximumAmount = 2000 as Sats
            const initialAmount = 1000 as Sats // Within bounds

            const { result } = renderHookWithBridge(
                () =>
                    useAmountInput(
                        initialAmount,
                        mockOnChangeAmount,
                        minimumAmount,
                        maximumAmount,
                    ),
                store,
                bridge.fedimint,
            )

            expect(result.current.validation).toBeUndefined()
        })
    })

    describe('input handlers', () => {
        it('should provide functions to handle input changes', () => {
            const { store, bridge } = context

            const { result } = renderHookWithBridge(
                () => useAmountInput(1000 as Sats, mockOnChangeAmount),
                store,
                bridge.fedimint,
            )

            expect(result.current.handleChangeFiat).toBeInstanceOf(Function)
            expect(result.current.handleChangeSats).toBeInstanceOf(Function)
            expect(result.current.handleNumpadPress).toBeInstanceOf(Function)
        })

        it('handleChangeSats invokes expected state changes', () => {
            const { store, bridge } = context

            store.dispatch(setAmountInputType('sats'))
            store.dispatch({
                type: fetchCurrencyPrices.fulfilled.type,
                payload: {
                    btcUsdRate: 100000,
                    fiatUsdRates: {},
                },
            })

            const { result } = renderHookWithBridge(
                () => useAmountInput(0 as Sats, mockOnChangeAmount),
                store,
                bridge.fedimint,
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
            const { store, bridge } = context

            store.dispatch(setAmountInputType('fiat'))
            store.dispatch({
                type: fetchCurrencyPrices.fulfilled.type,
                payload: {
                    btcUsdRate: 100000,
                    fiatUsdRates: {},
                },
            })

            const { result } = renderHookWithBridge(
                () => useAmountInput(0 as Sats, mockOnChangeAmount),
                store,
                bridge.fedimint,
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
            const { store } = context
            store.dispatch(setAmountInputType('sats'))
            // Set exchange rates for numpad tests that need conversions
            store.dispatch({
                type: fetchCurrencyPrices.fulfilled.type,
                payload: {
                    btcUsdRate: 100000,
                    fiatUsdRates: {},
                },
            })
        })

        describe('typical numpad usage', () => {
            it('numpad sequence: 1 + 0 + 0 + 0 + 0 = 10K sats = 10 USD', () => {
                const { store, bridge } = context

                const initialAmount = 0 as Sats

                const { result } = renderHookWithBridge(
                    () => useAmountInput(initialAmount, mockOnChangeAmount),
                    store,
                    bridge.fedimint,
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
                const { store, bridge } = context

                const initialAmount = 0 as Sats

                const { result } = renderHookWithBridge(
                    () => useAmountInput(initialAmount, mockOnChangeAmount),
                    store,
                    bridge.fedimint,
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
                const { store, bridge } = context

                const initialAmount = 0 as Sats

                const { result } = renderHookWithBridge(
                    () => useAmountInput(initialAmount, mockOnChangeAmount),
                    store,
                    bridge.fedimint,
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
                const { store, bridge } = context

                store.dispatch(setCurrencyLocale('de-DE'))
                // Mock system locale to use German formatting for number display
                mockSystemLocale('de-DE')

                const { result } = renderHookWithBridge(
                    () => useAmountInput(0 as Sats, mockOnChangeAmount),
                    store,
                    bridge.fedimint,
                )

                act(() => {
                    result.current.handleChangeSats('1000')
                })

                expect(result.current.satsValue).toBe('1.000')
            })

            it('should handle space separators (ex: 1 000 sats)', () => {
                const { store, bridge } = context

                store.dispatch(setCurrencyLocale('fr-FR'))
                // Mock system locale to use French formatting for number display
                mockSystemLocale('fr-FR')

                const { result } = renderHookWithBridge(
                    () => useAmountInput(0 as Sats, mockOnChangeAmount),
                    store,
                    bridge.fedimint,
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
            const { store } = context
            store.dispatch(setAmountInputType('fiat'))
            // Set exchange rates for numpad tests that need conversions
            store.dispatch({
                type: fetchCurrencyPrices.fulfilled.type,
                payload: {
                    btcUsdRate: 100000,
                    fiatUsdRates: {},
                },
            })
        })

        describe('typical numpad usage', () => {
            it('numpad sequence: 1 + 0 + 0 + 0 + 0 = 1K USD = 1M sats', () => {
                const { store, bridge } = context

                const initialAmount = 0 as Sats

                const { result } = renderHookWithBridge(
                    () => useAmountInput(initialAmount, mockOnChangeAmount),
                    store,
                    bridge.fedimint,
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
                const { store, bridge } = context

                const initialAmount = 0 as Sats

                const { result } = renderHookWithBridge(
                    () => useAmountInput(initialAmount, mockOnChangeAmount),
                    store,
                    bridge.fedimint,
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
                const { store, bridge } = context

                const initialAmount = 0 as Sats

                const { result } = renderHookWithBridge(
                    () => useAmountInput(initialAmount, mockOnChangeAmount),
                    store,
                    bridge.fedimint,
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
                const { store, bridge } = context

                // Test German locale where dot is thousands separator, comma is decimal
                store.dispatch(changeOverrideCurrency(SupportedCurrency.EUR))
                store.dispatch(setCurrencyLocale('de-DE'))
                store.dispatch({
                    type: fetchCurrencyPrices.fulfilled.type,
                    payload: {
                        btcUsdRate: 100000,
                        fiatUsdRates: { EUR: 0.9 },
                    },
                })
                mockSystemLocale('de-DE')

                const { result } = renderHookWithBridge(
                    () => useAmountInput(0 as Sats, mockOnChangeAmount),
                    store,
                    bridge.fedimint,
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
                const { store, bridge } = context

                store.dispatch(changeOverrideCurrency(SupportedCurrency.EUR))
                store.dispatch(setCurrencyLocale('fr-FR'))
                store.dispatch({
                    type: fetchCurrencyPrices.fulfilled.type,
                    payload: {
                        btcUsdRate: 100000,
                        fiatUsdRates: { EUR: 0.9 },
                    },
                })
                mockSystemLocale('fr-FR')

                const { result } = renderHookWithBridge(
                    () => useAmountInput(0 as Sats, mockOnChangeAmount),
                    store,
                    bridge.fedimint,
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

            it('should reject decimal input for zero-decimal currencies (ex: KRW)', () => {
                const { store, bridge } = context

                store.dispatch(changeOverrideCurrency(SupportedCurrency.KRW))
                store.dispatch(setCurrencyLocale('ko-KR'))
                store.dispatch({
                    type: fetchCurrencyPrices.fulfilled.type,
                    payload: {
                        btcUsdRate: 100000,
                        fiatUsdRates: { KRW: 1300 },
                    },
                })
                mockSystemLocale('ko-KR')

                const { result } = renderHookWithBridge(
                    () => useAmountInput(0 as Sats, mockOnChangeAmount),
                    store,
                    bridge.fedimint,
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
