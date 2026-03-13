import * as linking from '../../../utils/linking'

describe('linking', () => {
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

    describe('getInternalLinkRoute', () => {
        describe('when a TabsNavigator normalized deep link path with fedi:// prefix and without query string params is passed', () => {
            it('should return the correct route', () => {
                const fediUri = 'fedi://home'
                const result = linking.getInternalLinkRoute(fediUri)

                expect(result).toEqual({
                    routes: [
                        {
                            name: 'TabsNavigator',
                            state: {
                                routes: [
                                    {
                                        name: 'Home',
                                        params: {},
                                    },
                                ],
                            },
                        },
                    ],
                })
            })
        })

        describe('when a TabsNavigator normalized deep link path with fedi: prefix and without query string params is passed', () => {
            it('should return the correct route', () => {
                const fediUri = 'fedi:home'
                const result = linking.getInternalLinkRoute(fediUri)

                expect(result).toEqual({
                    routes: [
                        {
                            name: 'TabsNavigator',
                            state: {
                                routes: [
                                    {
                                        name: 'Home',
                                        params: {},
                                    },
                                ],
                            },
                        },
                    ],
                })
            })
        })

        describe('when a TabsNavigator normalized deep link path without query string params is passed', () => {
            it('should return the correct route', () => {
                const fediUri = 'home'
                const result = linking.getInternalLinkRoute(fediUri)

                expect(result).toEqual({
                    routes: [
                        {
                            name: 'TabsNavigator',
                            state: {
                                routes: [
                                    {
                                        name: 'Home',
                                        params: {},
                                    },
                                ],
                            },
                        },
                    ],
                })
            })
        })

        describe('when a non-TabsNavigator normalized deep link path without query string params is passed', () => {
            it('should return the correct route', () => {
                const fediUri = 'share-logs'
                const result = linking.getInternalLinkRoute(fediUri)

                expect(result).toEqual({
                    routes: [
                        {
                            name: 'ShareLogs',
                            params: {},
                        },
                    ],
                })
            })
        })

        describe('when a non-TabsNavigator normalized deep link path with query string params is passed', () => {
            it('should return the correct route', () => {
                const fediUri = 'ecash?id=12345'
                const result = linking.getInternalLinkRoute(fediUri)

                expect(result).toEqual({
                    routes: [
                        {
                            name: 'ClaimEcash',
                            params: {
                                id: '12345',
                            },
                        },
                    ],
                })
            })
        })
    })
})
