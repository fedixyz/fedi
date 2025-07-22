import * as chat from '../../utils/chat'

describe('chat', () => {
    describe('generateRandomDisplayName', () => {
        describe('When the function is called', () => {
            it('should return a random display name containing two words', () => {
                const displayName = chat.generateRandomDisplayName()
                const words = displayName.split(' ')

                expect(words.length).toBe(2)
            })
        })
    })

    describe('parseMessageText', () => {
        it('should return single text segment for plain text', () => {
            const result = chat.parseMessageText('Hello world')

            expect(result).toEqual([{ type: 'text', content: 'Hello world' }])
        })

        it('should parse URLs correctly', () => {
            const result = chat.parseMessageText(
                'Check out https://example.com for more info',
            )

            expect(result).toEqual([
                { type: 'text', content: 'Check out ' },
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: ' for more info' },
            ])
        })

        it('should handle multiple URLs', () => {
            const result = chat.parseMessageText(
                'Check https://example.com and https://test.com',
            )

            expect(result).toEqual([
                { type: 'text', content: 'Check ' },
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: ' and ' },
                { type: 'url', content: 'https://test.com' },
            ])
        })

        it('should handle empty string', () => {
            const result = chat.parseMessageText('')

            expect(result).toEqual([])
        })

        it('should handle text with only whitespace', () => {
            const result = chat.parseMessageText('   ')

            expect(result).toEqual([{ type: 'text', content: '   ' }])
        })

        it('should handle URL at the beginning of text', () => {
            const result = chat.parseMessageText('https://example.com is great')

            expect(result).toEqual([
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: ' is great' },
            ])
        })

        it('should handle URL at the end of text', () => {
            const result = chat.parseMessageText(
                'Check out https://example.com',
            )

            expect(result).toEqual([
                { type: 'text', content: 'Check out ' },
                { type: 'url', content: 'https://example.com' },
            ])
        })

        it('should handle text with only a URL', () => {
            const result = chat.parseMessageText('https://example.com')

            expect(result).toEqual([
                { type: 'url', content: 'https://example.com' },
            ])
        })

        it('should handle multiple consecutive URLs', () => {
            const result = chat.parseMessageText(
                'https://example.com https://test.com',
            )

            expect(result).toEqual([
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: ' ' },
                { type: 'url', content: 'https://test.com' },
            ])
        })

        it('should handle text with newlines but no URLs', () => {
            const result = chat.parseMessageText('Hello\nWorld\nHow are you?')

            expect(result).toEqual([
                { type: 'text', content: 'Hello\nWorld\nHow are you?' },
            ])
        })

        it('should handle text with newlines and URLs', () => {
            const result = chat.parseMessageText(
                'Hello\nCheck out https://example.com\nIt is great!',
            )

            expect(result).toEqual([
                { type: 'text', content: 'Hello\nCheck out ' },
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: '\nIt is great!' },
            ])
        })

        it('should handle URL after newline', () => {
            const result = chat.parseMessageText('Hello\nhttps://example.com')

            expect(result).toEqual([
                { type: 'text', content: 'Hello\n' },
                { type: 'url', content: 'https://example.com' },
            ])
        })

        it('should handle URL before newline', () => {
            const result = chat.parseMessageText(
                'https://example.com\nGreat site!',
            )

            expect(result).toEqual([
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: '\nGreat site!' },
            ])
        })

        it('should handle multiple URLs separated by newlines', () => {
            const result = chat.parseMessageText(
                'https://example.com\nhttps://test.com',
            )

            expect(result).toEqual([
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: '\n' },
                { type: 'url', content: 'https://test.com' },
            ])
        })

        it('should handle text with multiple newlines', () => {
            const result = chat.parseMessageText(
                'Line 1\n\nLine 3\nhttps://example.com\n\nEnd',
            )

            expect(result).toEqual([
                { type: 'text', content: 'Line 1\n\nLine 3\n' },
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: '\n\nEnd' },
            ])
        })

        it('should handle HTTP URLs', () => {
            const result = chat.parseMessageText('Visit http://example.com')

            expect(result).toEqual([
                { type: 'text', content: 'Visit ' },
                { type: 'url', content: 'http://example.com' },
            ])
        })

        it('should handle duplicate URLs', () => {
            const result = chat.parseMessageText(
                'https://example.com and https://example.com again',
            )

            expect(result).toEqual([
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: ' and ' },
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: ' again' },
            ])
        })

        it('should not match URLs without word boundary', () => {
            const result = chat.parseMessageText('nospacehttps://example.com')

            expect(result).toEqual([
                { type: 'text', content: 'nospacehttps://example.com' },
            ])
        })
    })

    describe('deriveUrlsFromText', () => {
        it('should filter and return only URL segments from parseMessageText', () => {
            const result = chat.deriveUrlsFromText(
                'Check https://example.com and https://test.com out',
            )

            expect(result).toEqual(['https://example.com', 'https://test.com'])
        })

        it('should return empty array when no URLs present', () => {
            const result = chat.deriveUrlsFromText('Hello world')

            expect(result).toEqual([])
        })
    })
})
