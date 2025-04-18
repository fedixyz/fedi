import { SupportedCurrency } from '../../types'
import { getCurrencyCode } from '../../utils/currency'

describe('currency', () => {
    describe('getCurrencyCode', () => {
        it('correctly returns a three-letter currency code', () => {
            expect(getCurrencyCode(SupportedCurrency.USD)).toBe('USD')
        })

        it('correctly returns a generic currency code for aliases', () => {
            expect(getCurrencyCode('mali')).toBe('XOF')
        })
    })
})
