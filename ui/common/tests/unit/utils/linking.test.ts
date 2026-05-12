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
})
