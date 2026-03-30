import { normalizeDeepLink } from '@fedi/common/utils/linking'

import * as linking from '../../../utils/linking'

describe('linking', () => {
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

        describe('browser deep link', () => {
            it('should open FediModBrowser with url param', () => {
                const result = linking.getInternalLinkRoute(
                    'fedi://browser?url=https://google.com',
                )

                expect(result).toEqual({
                    routes: [
                        {
                            name: 'FediModBrowser',
                            params: { url: 'https://google.com' },
                        },
                    ],
                })
            })

            it('should open FediModBrowser with legacy id param', () => {
                const result = linking.getInternalLinkRoute(
                    'fedi://browser?id=https://google.com',
                )

                expect(result).toEqual({
                    routes: [
                        {
                            name: 'FediModBrowser',
                            params: { url: 'https://google.com' },
                        },
                    ],
                })
            })
        })
    })

    describe('browser deep link end-to-end (normalizeDeepLink + getInternalLinkRoute)', () => {
        const expectedRoute = {
            routes: [
                {
                    name: 'FediModBrowser',
                    params: { url: 'https://google.com' },
                },
            ],
        }

        it.each([
            'https://app.fedi.xyz/link#screen=browser&url=https://google.com',
            'https://app.fedi.xyz/link#screen=browser&url=google.com',
            'https://app.fedi.xyz/link#screen=browser&url=https%3A%2F%2Fgoogle.com',
            'https://app.fedi.xyz/link#screen=browser&id=https://google.com',
            'https://app.fedi.xyz/link#screen=browser&id=google.com',
            'https://app.fedi.xyz/link#screen=browser&id=https%3A%2F%2Fgoogle.com',
        ])(
            'should navigate to FediModBrowser with https://google.com for %s',
            deepLink => {
                const normalized = normalizeDeepLink(deepLink)
                expect(normalized).toBeDefined()

                if (!normalized) return
                const result = linking.getInternalLinkRoute(normalized.fediUri)
                expect(result).toEqual(expectedRoute)
            },
        )
    })
})
