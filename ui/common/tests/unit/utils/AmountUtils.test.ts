import {
    Btc,
    MSats,
    Sats,
    SelectableCurrency,
    SupportedCurrency,
} from '../../../types'
import amountUtils from '../../../utils/AmountUtils'

describe('AmountUtils', () => {
    describe('msatToSat', () => {
        it('should convert millisats to sats', () => {
            const result = amountUtils.msatToSat(10000 as MSats)

            expect(result).toEqual(10)
        })
        it('should convert millisats to sats and round down', () => {
            const result = amountUtils.msatToSat(12345 as MSats)

            expect(result).toEqual(12)
        })
        it('should convert millisats to sats and still round down', () => {
            const result = amountUtils.msatToSat(98765 as MSats)

            expect(result).toEqual(98)
        })
    })
    describe('satToMsat', () => {
        it('should convert sats to millisats', () => {
            const result = amountUtils.satToMsat(10 as Sats)

            expect(result).toEqual(10000)
        })
    })
    describe('satToBtc', () => {
        it('should convert sats to bitcoins', () => {
            const result = amountUtils.satToBtc(10 as Sats)

            expect(result).toEqual(0.0000001)
        })
    })
    describe('btcToSat', () => {
        it('should convert bitcoins to sats', () => {
            const result = amountUtils.btcToSat(10 as Btc)

            expect(result).toEqual(1000000000)
        })
        it('should convert a fraction of a bitcoin to sats', () => {
            const result = amountUtils.btcToSat(0.01 as Btc)

            expect(result).toEqual(1000000)
        })
    })
    describe('btcToMsat', () => {
        it('should convert bitcoins to millisats', () => {
            const result = amountUtils.btcToMsat(10 as Btc)

            expect(result).toEqual(1000000000000)
        })
        it('should convert 0 bitcoins to 0 millisats', () => {
            const result = amountUtils.btcToMsat(0 as Btc)

            expect(result).toEqual(0)
        })
        it('should convert a fraction of a bitcoin to millisats', () => {
            const result = amountUtils.btcToMsat(0.01 as Btc)

            expect(result).toEqual(1000000000)
        })
    })
    describe('msatToBtc', () => {
        it('should convert 10 millisats to 0 bitcoins (rounded down)', () => {
            const result = amountUtils.msatToBtc(10 as MSats)

            expect(result).toEqual(0)
        })
        it('should convert 100 millisats to 0 bitcoins (rounded down)', () => {
            const result = amountUtils.msatToBtc(100 as MSats)

            expect(result).toEqual(0)
        })
        it('should convert 1000 millisats to 0.00000001 bitcoin', () => {
            const result = amountUtils.msatToBtc(1000 as MSats)

            expect(result).toEqual(0.00000001)
        })
        it('should convert 10K millisats to bitcoins', () => {
            const result = amountUtils.msatToBtc(10000 as MSats)

            expect(result).toEqual(0.0000001)
        })
        it('should convert 1M millisats to bitcoins', () => {
            const result = amountUtils.msatToBtc(1000000 as MSats)

            expect(result).toEqual(0.00001)
        })
    })
    describe('msatToSatString', () => {
        it('should convert millisats to sats', () => {
            const result = amountUtils.msatToSatString(10000 as MSats)

            expect(result).toEqual('10')
        })
        it('should convert millisats to sats and round down', () => {
            const result = amountUtils.msatToSatString(12345 as MSats)

            expect(result).toEqual('12')
        })
        it('should convert millisats to sats and still round down', () => {
            const result = amountUtils.msatToSatString(98765 as MSats)

            expect(result).toEqual('98')
        })
    })
    describe('satToMsatString', () => {
        it('should convert sats to millisats', () => {
            const result = amountUtils.satToMsatString(10 as Sats)

            expect(result).toEqual('10000')
        })
    })
    describe('satToBtcString', () => {
        it('should convert 1 sats to bitcoins', () => {
            const result = amountUtils.satToBtcString(1 as Sats)

            expect(result).toEqual('0.00000001')
        })
        it('should convert 10 sats to bitcoins with 1 trailing zero', () => {
            const result = amountUtils.satToBtcString(10 as Sats)

            expect(result).toEqual('0.00000010')
        })
        it('should convert 10M sats to bitcoins with all trailing zeros', () => {
            const result = amountUtils.satToBtcString(10000000 as Sats)

            expect(result).toEqual('0.10000000')
        })
    })
    describe('btcToSatString', () => {
        it('should convert bitcoins to sats', () => {
            const result = amountUtils.btcToSatString(10 as Btc)

            expect(result).toEqual('1000000000')
        })
        it('should convert a fraction of a bitcoin to sats', () => {
            const result = amountUtils.btcToSatString(0.01 as Btc)

            expect(result).toEqual('1000000')
        })
    })
    describe('btcToMsatString', () => {
        it('should convert bitcoins to millisats', () => {
            const result = amountUtils.btcToMsatString(10 as Btc)

            expect(result).toEqual('1000000000000')
        })
        it('should convert 0 bitcoins to 0 millisats', () => {
            const result = amountUtils.btcToMsatString(0 as Btc)

            expect(result).toEqual('0')
        })
        it('should convert a fraction of a bitcoin to millisats', () => {
            const result = amountUtils.btcToMsatString(0.01 as Btc)

            expect(result).toEqual('1000000000')
        })
    })
    describe('msatToBtcString', () => {
        it('should convert 10 millisats to 0 bitcoins (rounded down)', () => {
            const result = amountUtils.msatToBtcString(10 as MSats)

            expect(result).toEqual('0')
        })
        it('should convert 100 millisats to 0 bitcoins (rounded down)', () => {
            const result = amountUtils.msatToBtcString(100 as MSats)

            expect(result).toEqual('0')
        })
        it('should convert 1000 millisats to 0.00000001 bitcoin', () => {
            const result = amountUtils.msatToBtcString(1000 as MSats)

            expect(result).toEqual('0.00000001')
        })
        it('should convert 1M millisats to bitcoins', () => {
            const result = amountUtils.msatToBtcString(1000000 as MSats)

            expect(result).toEqual('0.00001000')
        })
    })
    describe('formatFiat', () => {
        const amount = 1234.567
        const testCases = [
            {
                currency: SupportedCurrency.USD,
                locale: 'en-US',
                expectedResult: 'USD\xa01,234.57',
                expectedResultNoSymbol: '1,234.57',
            },
            {
                currency: SupportedCurrency.USD,
                locale: 'en-CA',
                expectedResult: 'USD\xa01,234.57', // test for non-breaking space char
                expectedResultNoSymbol: '1,234.57',
            },
            {
                currency: SupportedCurrency.EUR,
                locale: 'de-DE',
                expectedResult: '1.234,57\xa0EUR', // test for non-breaking space char
                expectedResultNoSymbol: '1.234,57',
            },
        ]

        testCases.forEach(
            ({ currency, locale, expectedResult, expectedResultNoSymbol }) => {
                it(`should format ${amount} to ${expectedResult} for ${currency} in ${locale} locale`, () => {
                    const result = amountUtils.formatFiat(
                        amount,
                        currency as SelectableCurrency,
                        {
                            locale: locale,
                        },
                    )
                    expect(result).toEqual(expectedResult)
                })
                it(`should format ${amount} to ${expectedResultNoSymbol} for ${currency} in ${locale} locale with no symbol`, () => {
                    const result = amountUtils.formatFiat(
                        amount,
                        currency as SelectableCurrency,
                        {
                            locale: locale,
                            symbolPosition: 'none',
                        },
                    )
                    expect(result).toEqual(expectedResultNoSymbol)
                })
            },
        )
    })
    describe('formatFiat - minimum/maximumFractionDigits options', () => {
        it('should allow forcing decimals for a zero-decimal currency (XOF)', () => {
            const result = amountUtils.formatFiat(
                1234,
                'XOF' as SelectableCurrency,
                {
                    locale: 'en-US',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                },
            )
            expect(result.replace(/\s/g, '\xa0')).toMatch(/^XOF\xa01,234.00$/)
        })

        it('should allow suppressing decimals for a two-decimal currency (USD)', () => {
            const result = amountUtils.formatFiat(
                1234.56,
                'USD' as SelectableCurrency,
                {
                    locale: 'en-US',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                },
            )
            expect(result.replace(/\s/g, '\xa0')).toMatch(/^USD\xa01,235$/)
        })
        it('should pad USD to FOUR decimals when minimumFractionDigits = 4', () => {
            const result = amountUtils.formatFiat(
                1234.56,
                'USD' as SelectableCurrency,
                {
                    locale: 'en-US',
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 4,
                },
            )
            expect(result.replace(/\s/g, '\xa0')).toMatch(
                /^USD\xa01,234\.5600$/,
            )
        })

        it('should round EUR to ONE decimal when maximumFractionDigits = 1', () => {
            const result = amountUtils.formatFiat(
                1234.56,
                'EUR' as SelectableCurrency,
                {
                    locale: 'de-DE',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 1,
                },
            )
            // example output: "1.234,6 EUR" or "1 234,6 EUR" depending on NBSP-type
            expect(result.replace(/\s/g, '\xa0')).toMatch(
                /^1\.234,6[\u00a0\u202f]?EUR$/,
            )
        })

        it('should keep XOF integer when maximumFractionDigits > 0 but minimumFractionDigits = 0', () => {
            const result = amountUtils.formatFiat(
                1234,
                'XOF' as SelectableCurrency,
                {
                    locale: 'en-US',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                },
            )
            expect(result.replace(/\s/g, '\xa0')).toMatch(/^XOF\xa01,234$/)
        })
    })

    describe('formatFiat - symbolPosition: end', () => {
        it('should place the code at the end (USD, en-US)', () => {
            const result = amountUtils.formatFiat(
                1234.56,
                'USD' as SelectableCurrency,
                {
                    locale: 'en-US',
                    symbolPosition: 'end',
                },
            )
            expect(result).toMatch(/^1,234\.56 USD$/)
        })

        it('should place the code at the end (XOF, en-US)', () => {
            const result = amountUtils.formatFiat(
                500,
                'XOF' as SelectableCurrency,
                {
                    locale: 'en-US',
                    symbolPosition: 'end',
                },
            )
            expect(result).toMatch(/^500 XOF$/)
        })

        it('should place the code at the end (EUR, de-DE)', () => {
            const result = amountUtils.formatFiat(
                789.1,
                'EUR' as SelectableCurrency,
                {
                    locale: 'de-DE',
                    symbolPosition: 'end',
                },
            )
            // Example: "789,10 EUR"
            expect(result).toMatch(/^789,10[\s\u202f\u00a0]?EUR$/)
        })
    })
    describe('formatFiat - edge cases', () => {
        it('should format zero correctly for XOF', () => {
            const result = amountUtils.formatFiat(
                0,
                'XOF' as SelectableCurrency,
                { locale: 'fr-TG' },
            )
            expect(result).toMatch(/^0[\s\u202f\u00a0]?XOF$/)
        })

        it('should format large numbers correctly', () => {
            const result = amountUtils.formatFiat(
                123456789,
                'USD' as SelectableCurrency,
                { locale: 'en-US' },
            )
            expect(result).toMatch(/^USD\xa0123,456,789\.00$/)
        })
    })
    describe('formatFiat – additional default cases', () => {
        it('should format XOF with NO decimals by default', () => {
            const result = amountUtils.formatFiat(
                1234,
                'XOF' as SelectableCurrency,
                { locale: 'en-US' },
            )
            // normalise to NBSP to avoid hard-space issues
            expect(result.replace(/\s/g, '\xa0')).toMatch(/^XOF\xa01,234$/)
        })
    })
    describe('getCurrencySymbol', () => {
        const testCases = [
            {
                locale: 'en-US',
                currency: SupportedCurrency.USD,
                expectedResult: '$',
            },
            {
                locale: 'en-CA',
                currency: SupportedCurrency.USD,
                expectedResult: 'US$',
            },
            {
                locale: 'de-DE',
                currency: SupportedCurrency.EUR,
                expectedResult: '€',
            },
        ]

        testCases.forEach(({ currency, locale, expectedResult }) => {
            it(`should give us the symbol ${expectedResult} for ${currency} in ${locale} locale`, () => {
                const result = amountUtils.getCurrencySymbol(
                    currency as SelectableCurrency,
                    {
                        locale,
                    },
                )
                expect(result).toEqual(expectedResult)
            })
        })
    })
    describe('getCurrencyDecimals', () => {
        const testCases = [
            { currency: SupportedCurrency.USD, expectedResult: 2 },
            { currency: SupportedCurrency.EUR, expectedResult: 2 },
            { currency: 'JPY' as SupportedCurrency, expectedResult: 0 },
        ]

        testCases.forEach(({ currency, expectedResult }) => {
            expect(
                amountUtils.getCurrencyDecimals(currency as SelectableCurrency),
            ).toEqual(expectedResult)
        })
    })
    describe('parseFiatString', () => {
        const testCases = [
            {
                locale: 'en-US',
                fiat: '$1,234.56',
                expectedResult: 1234.56,
            },
            {
                locale: 'en-CA',
                fiat: 'US$1,234.56',
                expectedResult: 1234.56,
            },
            {
                locale: 'de-DE',
                fiat: '1.234,56 €', // careful for non-standard whitespace char
                expectedResult: 1234.56,
            },
            {
                locale: 'fr-TG',
                fiat: '1 234,56 CFA', // careful for non-standard whitespace char
                expectedResult: 1234.56,
            },
            {
                locale: 'en-US',
                fiat: '$0.05',
                expectedResult: 0.05,
            },
            {
                locale: 'en-CA',
                fiat: 'US$0.05',
                expectedResult: 0.05,
            },
            {
                locale: 'de-DE',
                fiat: '0,05 €', // careful for non-standard whitespace char
                expectedResult: 0.05,
            },
            {
                locale: 'fr-TG',
                fiat: '0,05 CFA', // careful for non-standard whitespace char
                expectedResult: 0.05,
            },
        ]

        testCases.forEach(({ locale, fiat, expectedResult }) => {
            it(`should parse ${expectedResult} from ${fiat} in ${locale} locale`, () => {
                const result = amountUtils.parseFiatString(fiat, { locale })
                expect(result).toEqual(expectedResult)
            })
        })

        // Note: there used to be a bug where getThousandsSeparator returned
        // an empty string, breaking the RegExp in parseFiatString. this
        // shouldn't happen if a valid locale is provided but keep this
        // test as a safeguard
        it('should handle locale if thousands separator is empty', () => {
            // Mock getThousandsSeparator to return an empty string
            const originalGetThousandsSeparator =
                amountUtils.getThousandsSeparator
            amountUtils.getThousandsSeparator = jest.fn().mockReturnValue('')

            const result = amountUtils.parseFiatString('0.005')
            expect(result).toEqual(0.005)
            amountUtils.getThousandsSeparator = originalGetThousandsSeparator
        })
    })
    describe('getThousandsSeparator', () => {
        const testCases = [
            { locale: 'en-US', expectedResult: ',' },
            { locale: 'de-DE', expectedResult: '.' },
            { locale: 'fr-FR', expectedResult: ' ' }, // careful for non-standard whitespace char
        ]

        testCases.forEach(({ locale, expectedResult }) => {
            it(`should return '${expectedResult}' for ${locale} locale`, () => {
                const result = amountUtils.getThousandsSeparator({ locale })
                expect(result).toEqual(expectedResult)
            })
        })

        it('should use the system default locale when no locale is provided', () => {
            const defaultSeparator = amountUtils.getThousandsSeparator({
                locale: undefined,
            })
            expect(typeof defaultSeparator).toBe('string')
            expect(defaultSeparator.length).toBe(1)
        })
    })
    describe('getDecimalSeparator', () => {
        const testCases = [
            { locale: 'en-US', expectedResult: '.' },
            { locale: 'de-DE', expectedResult: ',' },
            { locale: 'fr-FR', expectedResult: ',' },
        ]

        testCases.forEach(({ locale, expectedResult }) => {
            it(`should return '${expectedResult}' for ${locale} locale`, () => {
                const result = amountUtils.getDecimalSeparator({ locale })
                expect(result).toEqual(expectedResult)
            })
        })

        it('should use the system default locale when no locale is provided', () => {
            const defaultSeparator = amountUtils.getDecimalSeparator()
            expect(typeof defaultSeparator).toBe('string')
            expect(defaultSeparator.length).toBe(1)
        })
    })
    describe('stripTrailingZerosWithSuffix', () => {
        it('should remove trailing zeros after decimal', () => {
            const result = amountUtils.stripTrailingZerosWithSuffix('123.45000')
            expect(result).toEqual('123.45')
        })

        it('should strip the entire decimal part if it’s all zeros', () => {
            expect(amountUtils.stripTrailingZerosWithSuffix('123.000')).toEqual(
                '123',
            )
            expect(amountUtils.stripTrailingZerosWithSuffix('0.0')).toEqual('0')
        })

        it('should leave an integer without decimal intact', () => {
            expect(amountUtils.stripTrailingZerosWithSuffix('456')).toEqual(
                '456',
            )
        })

        it('should preserve a single non-zero decimal digit', () => {
            expect(amountUtils.stripTrailingZerosWithSuffix('78.900')).toEqual(
                '78.9',
            )
        })

        it('should preserve suffix after stripping zeros', () => {
            expect(
                amountUtils.stripTrailingZerosWithSuffix('100.5000 USD'),
            ).toEqual('100.5 USD')
            expect(
                amountUtils.stripTrailingZerosWithSuffix('250.000 BTC'),
            ).toEqual('250 BTC')
            expect(
                amountUtils.stripTrailingZerosWithSuffix('42 satoshi'),
            ).toEqual('42 satoshi')
        })

        it('should handle numbers with multiple-word suffixes', () => {
            expect(
                amountUtils.stripTrailingZerosWithSuffix(
                    '3.14000 miles per hour',
                ),
            ).toEqual('3.14 miles per hour')
        })

        it('should handle a zero input correctly', () => {
            expect(amountUtils.stripTrailingZerosWithSuffix('0.0000')).toEqual(
                '0',
            )
            expect(amountUtils.stripTrailingZerosWithSuffix('0')).toEqual('0')
        })
    })

    describe('clampSats', () => {
        it('should return 0 for non-numbers', () => {
            // typecast to trick the type checker
            expect(amountUtils.clampSats('0' as unknown as number)).toEqual(0)
        })
        it('should return 0 for negative numbers', () => {
            expect(amountUtils.clampSats(-1 as Sats)).toEqual(0)
        })
        it('should return the value if it is a valid sats value', () => {
            expect(amountUtils.clampSats(1 as Sats)).toEqual(1)
        })
        it('should round to the nearest integer', () => {
            expect(amountUtils.clampSats(1.5 as Sats)).toEqual(2)
        })
    })
    describe('stripSatsValue', () => {
        it('should return correctly stripped values for numpad string inputs', () => {
            expect(amountUtils.stripSatsValue('0', 'en-US')).toEqual(0)
            expect(amountUtils.stripSatsValue('1', 'en-US')).toEqual(1)
            expect(amountUtils.stripSatsValue('1,000', 'en-US')).toEqual(1000)
            expect(amountUtils.stripSatsValue('1,000.00', 'en-US')).toEqual(
                1000,
            )
            expect(amountUtils.stripSatsValue('1.000', 'de-DE')).toEqual(1000)
            expect(amountUtils.stripSatsValue('1.000,00', 'de-DE')).toEqual(
                1000,
            )
        })
    })
})
