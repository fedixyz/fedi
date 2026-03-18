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
    })
})
