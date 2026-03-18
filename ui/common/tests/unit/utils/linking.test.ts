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
})
