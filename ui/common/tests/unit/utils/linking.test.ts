import * as linking from '../../../utils/linking'

describe('common/utils/linking', () => {
    describe('isDeepLink', () => {
        describe('when a url is passed without a link pathname', () => {
            it('should return false', () => {
                const url = 'https://app.fedi.xyz'
                expect(linking.isDeepLink(url)).toBe(false)
            })
        })

        describe('when a url is passed without a screen parameter', () => {
            it('should return false', () => {
                const url = 'https://app.fedi.xyz/link'
                expect(linking.isDeepLink(url)).toBe(false)
            })
        })

        describe('when a url is passed with a screen parameter', () => {
            it('should return true', () => {
                const url = 'https://app.fedi.xyz/link?screen=chat'
                expect(linking.isDeepLink(url)).toBe(true)
            })
        })

        describe('when a url is passed with a screen parameter and # delimiter', () => {
            it('should return true', () => {
                const url = 'https://app.fedi.xyz/link#screen=chat'
                expect(linking.isDeepLink(url)).toBe(true)
            })
        })
    })

    describe('normalizeDeepLink', () => {
        describe('when a url is passed without a screen parameter', () => {
            it('should return undefined', () => {
                const url = 'https://app.fedi.xyz/link'
                expect(linking.normalizeDeepLink(url)).toBeUndefined()
            })
        })

        describe('when a url is passed with a screen parameter', () => {
            it('should return the screen', () => {
                const url = 'https://app.fedi.xyz/link?screen=test'

                const result = linking.normalizeDeepLink(url)
                expect(result?.fediUri).toBe('fedi://test')
                expect(result?.screen).toBe('test')
            })
        })

        describe('when a url is passed with a screen parameter and a hash delimiter', () => {
            it('should return the screen', () => {
                const url = 'https://app.fedi.xyz/link#screen=test'

                const result = linking.normalizeDeepLink(url)
                expect(result?.fediUri).toBe('fedi://test')
                expect(result?.screen).toBe('test')
            })
        })

        describe('when a url is passed with a screen parameter and a query parameter', () => {
            it('should return the screen and query param', () => {
                const url = 'https://app.fedi.xyz/link?screen=test&query=value1'

                const result = linking.normalizeDeepLink(url)
                expect(result?.fediUri).toBe('fedi://test?query=value1')
                expect(result?.screen).toBe('test')
                expect(result?.params.get('query')).toBe('value1')
            })
        })

        describe('when a url is passed with a screen parameter and multiple query parameters', () => {
            it('should return the screen and query params', () => {
                const url =
                    'https://app.fedi.xyz/link?screen=test&query=value1&query2=value2'

                const result = linking.normalizeDeepLink(url)
                expect(result?.fediUri).toBe(
                    'fedi://test?query=value1&query2=value2',
                )
                expect(result?.screen).toBe('test')
                expect(result?.params.get('query')).toBe('value1')
                expect(result?.params.get('query2')).toBe('value2')
            })
        })
    })

    describe('isFediInternalLink', () => {
        it('should return true for fedi:// links', () => {
            const url = 'fedi://chat'

            expect(linking.isFediInternalLink(url)).toBe(true)
        })

        it('should return true for fedi: links', () => {
            const url = 'fedi:chat'

            expect(linking.isFediInternalLink(url)).toBe(true)
        })

        it('should return true for uppercase Fedi links', () => {
            const url = 'FEDI://chat'

            expect(linking.isFediInternalLink(url)).toBe(true)
        })

        it('should return false for web deeplinks', () => {
            const url = 'https://app.fedi.xyz/link?screen=chat'

            expect(linking.isFediInternalLink(url)).toBe(false)
        })

        it('should return false for non-Fedi links', () => {
            const url = 'lightning:lnbc123'

            expect(linking.isFediInternalLink(url)).toBe(false)
        })
    })

    describe('isFediDeeplinkType', () => {
        it('should return true for telegram links', () => {
            const url = 'https://t.me/fedibtc'

            expect(linking.isFediDeeplinkType(url)).toBe(true)
        })

        it('should return true for whatsapp links', () => {
            const url = 'https://wa.me/123456789'

            expect(linking.isFediDeeplinkType(url)).toBe(true)
        })

        it('should return true for universal deeplinks', () => {
            const url = 'https://app.fedi.xyz/link?screen=chat'

            expect(linking.isFediDeeplinkType(url)).toBe(true)
        })

        it('should return true for universal deeplinks with a # delimiter', () => {
            const url = 'https://app.fedi.xyz/link#screen=chat'

            expect(linking.isFediDeeplinkType(url)).toBe(true)
        })

        it('should return false for fedi-hosted web app pages', () => {
            const url = 'https://app.fedi.xyz/internal/deeplink-builder'

            expect(linking.isFediDeeplinkType(url)).toBe(false)
        })

        it('should return false for deeplinks without a screen', () => {
            const url = 'https://app.fedi.xyz/link'

            expect(linking.isFediDeeplinkType(url)).toBe(false)
        })

        it('should return false for external links', () => {
            const url = 'https://example.com/app'

            expect(linking.isFediDeeplinkType(url)).toBe(false)
        })
    })

    describe('getNavigationLink', () => {
        it('should normalize a Fedi web deeplink to an internal navigation link', () => {
            const url = 'https://app.fedi.xyz/link?screen=chat'

            expect(linking.getNavigationLink(url)).toBe('fedi://chat')
        })

        it('should normalize a Fedi web deeplink with params to an internal navigation link', () => {
            const url = 'https://app.fedi.xyz/link?screen=room&id=123'

            expect(linking.getNavigationLink(url)).toBe('fedi://room?id=123')
        })

        it('should return a Fedi internal link as-is', () => {
            const url = 'fedi://chat'

            expect(linking.getNavigationLink(url)).toBe(url)
        })

        it('should return undefined for non-navigation links', () => {
            const url = 'lightning:lnbc123'

            expect(linking.getNavigationLink(url)).toBeUndefined()
        })
    })

    describe('normalizeBrowserUrl', () => {
        it('should preserve http and https urls', () => {
            expect(linking.normalizeBrowserUrl('https://example.com/app')).toBe(
                'https://example.com/app',
            )
            expect(linking.normalizeBrowserUrl('http://example.com/app')).toBe(
                'http://example.com/app',
            )
        })

        it('should add https to bare urls', () => {
            expect(linking.normalizeBrowserUrl('example.com/app')).toBe(
                'https://example.com/app',
            )
        })
    })

    describe('parseTextWithUrls', () => {
        it.each([
            'https://example.com/?token=claim!',
            'https://example.com/file.',
            'https://example.com/?expression=value)',
            `https://app.fedi.xyz/link#screen=browser&url=${encodeURIComponent('https://example.com/?token=claim!')}`,
        ])('should preserve every character of a valid URL: %s', url => {
            expect(linking.parseTextWithUrls(url)).toEqual([
                { type: 'url', content: url },
            ])
            expect(linking.deriveUrlsFromText(url)).toEqual([url])
        })

        it('should leave fedi:// links as text', () => {
            expect(linking.parseTextWithUrls('Open fedi://chat')).toEqual([
                { type: 'text', content: 'Open fedi://chat' },
            ])
        })

        it('should preserve balanced parentheses in a URL', () => {
            const url = 'https://en.wikipedia.org/wiki/Fedi_(app)'
            expect(linking.parseTextWithUrls(url)).toEqual([
                { type: 'url', content: url },
            ])
        })

        it('should return single text segment for plain text', () => {
            const result = linking.parseTextWithUrls('Hello world')

            expect(result).toEqual([{ type: 'text', content: 'Hello world' }])
        })

        it('should parse URLs correctly', () => {
            const result = linking.parseTextWithUrls(
                'Check out https://example.com for more info',
            )

            expect(result).toEqual([
                { type: 'text', content: 'Check out ' },
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: ' for more info' },
            ])
        })

        it('should handle multiple URLs', () => {
            const result = linking.parseTextWithUrls(
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
            const result = linking.parseTextWithUrls('')

            expect(result).toEqual([])
        })

        it('should handle text with only whitespace', () => {
            const result = linking.parseTextWithUrls('   ')

            expect(result).toEqual([{ type: 'text', content: '   ' }])
        })

        it('should handle URL at the beginning of text', () => {
            const result = linking.parseTextWithUrls(
                'https://example.com is great',
            )

            expect(result).toEqual([
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: ' is great' },
            ])
        })

        it('should handle URL at the end of text', () => {
            const result = linking.parseTextWithUrls(
                'Check out https://example.com',
            )

            expect(result).toEqual([
                { type: 'text', content: 'Check out ' },
                { type: 'url', content: 'https://example.com' },
            ])
        })

        it('should handle text with only a URL', () => {
            const result = linking.parseTextWithUrls('https://example.com')

            expect(result).toEqual([
                { type: 'url', content: 'https://example.com' },
            ])
        })

        it('should handle multiple consecutive URLs', () => {
            const result = linking.parseTextWithUrls(
                'https://example.com https://test.com',
            )

            expect(result).toEqual([
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: ' ' },
                { type: 'url', content: 'https://test.com' },
            ])
        })

        it('should handle text with newlines but no URLs', () => {
            const result = linking.parseTextWithUrls(
                'Hello\nWorld\nHow are you?',
            )

            expect(result).toEqual([
                { type: 'text', content: 'Hello\nWorld\nHow are you?' },
            ])
        })

        it('should handle text with newlines and URLs', () => {
            const result = linking.parseTextWithUrls(
                'Hello\nCheck out https://example.com\nIt is great!',
            )

            expect(result).toEqual([
                { type: 'text', content: 'Hello\nCheck out ' },
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: '\nIt is great!' },
            ])
        })

        it('should handle URL after newline', () => {
            const result = linking.parseTextWithUrls(
                'Hello\nhttps://example.com',
            )

            expect(result).toEqual([
                { type: 'text', content: 'Hello\n' },
                { type: 'url', content: 'https://example.com' },
            ])
        })

        it('should handle URL before newline', () => {
            const result = linking.parseTextWithUrls(
                'https://example.com\nGreat site!',
            )

            expect(result).toEqual([
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: '\nGreat site!' },
            ])
        })

        it('should handle multiple URLs separated by newlines', () => {
            const result = linking.parseTextWithUrls(
                'https://example.com\nhttps://test.com',
            )

            expect(result).toEqual([
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: '\n' },
                { type: 'url', content: 'https://test.com' },
            ])
        })

        it('should handle text with multiple newlines', () => {
            const result = linking.parseTextWithUrls(
                'Line 1\n\nLine 3\nhttps://example.com\n\nEnd',
            )

            expect(result).toEqual([
                { type: 'text', content: 'Line 1\n\nLine 3\n' },
                { type: 'url', content: 'https://example.com' },
                { type: 'text', content: '\n\nEnd' },
            ])
        })

        it('should handle HTTP URLs', () => {
            const result = linking.parseTextWithUrls('Visit http://example.com')

            expect(result).toEqual([
                { type: 'text', content: 'Visit ' },
                { type: 'url', content: 'http://example.com' },
            ])
        })

        it('should handle duplicate URLs', () => {
            const result = linking.parseTextWithUrls(
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
            const result = linking.parseTextWithUrls(
                'nospacehttps://example.com',
            )

            expect(result).toEqual([
                { type: 'text', content: 'nospacehttps://example.com' },
            ])
        })
    })

    describe('deriveUrlsFromText', () => {
        it('should filter and return only URL segments from parseTextWithUrls', () => {
            const result = linking.deriveUrlsFromText(
                'Check https://example.com and https://test.com out',
            )

            expect(result).toEqual(['https://example.com', 'https://test.com'])
        })

        it('should return empty array when no URLs present', () => {
            const result = linking.deriveUrlsFromText('Hello world')

            expect(result).toEqual([])
        })
    })
})
