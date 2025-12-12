import { stripAndDeduplicateWhitespace } from '../../../utils/strings'

describe('stripAndDeduplicateWhitespace', () => {
    it('should remove leading and trailing whitespace from a string', () => {
        expect(stripAndDeduplicateWhitespace(' foo ')).toBe('foo')
        expect(stripAndDeduplicateWhitespace(' \nbar  ')).toBe('bar')
    })

    it('should allow up to two consecutive whitespace characters in a string', () => {
        expect(stripAndDeduplicateWhitespace('foo  bar')).toBe('foo  bar')
        expect(stripAndDeduplicateWhitespace('foo\n\nbar')).toBe('foo\n\nbar')
        expect(stripAndDeduplicateWhitespace('foo\n - bar')).toBe('foo\n - bar')
    })

    it('should replace a sequence of more than two consecutive whitespace characters with the first two whitespace characters', () => {
        expect(stripAndDeduplicateWhitespace('foo.   \n  bar')).toBe(
            'foo.  bar',
        )
        expect(stripAndDeduplicateWhitespace('foo \n\n\n  bar')).toBe(
            'foo \nbar',
        )
        expect(stripAndDeduplicateWhitespace('foo\n\n\nbar')).toBe('foo\n\nbar')
    })

    it('should trim and deduplicate a sequence of more than two consecutive whitespace characters', () => {
        expect(stripAndDeduplicateWhitespace('  foo  \n\n  bar  ')).toBe(
            'foo  bar',
        )
        expect(stripAndDeduplicateWhitespace('  foo\n\n\nbar  ')).toBe(
            'foo\n\nbar',
        )
    })
})
