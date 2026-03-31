import {
    normalizeCommunityInviteCode,
    normalizeDeepLink,
    stripFediPrefix,
} from '@fedi/common/utils/linking'

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

    describe('join deep link end-to-end (normalizeDeepLink + getInternalLinkRoute)', () => {
        it.each([
            // federation
            [
                'https://app.fedi.xyz/link#screen=join&id=fed1abc123',
                { invite: 'fed1abc123' },
            ],
            [
                'https://app.fedi.xyz/link?screen=join&id=fed1abc123',
                { invite: 'fed1abc123' },
            ],
            // community (prefixed)
            [
                'https://app.fedi.xyz/link#screen=join&id=fedi%3Acommunity10abc',
                { invite: 'fedi:community10abc' },
            ],
            [
                'https://app.fedi.xyz/link?screen=join&id=fedi%3Acommunity10abc',
                { invite: 'fedi:community10abc' },
            ],
            // community (unprefixed)
            [
                'https://app.fedi.xyz/link#screen=join&id=community10abc',
                { invite: 'fedi:community10abc' },
            ],
            [
                'https://app.fedi.xyz/link?screen=join&id=community10abc',
                { invite: 'fedi:community10abc' },
            ],
            // federation via invite= param (backwards compat)
            [
                'https://app.fedi.xyz/link#screen=join&invite=fed1abc123',
                { invite: 'fed1abc123' },
            ],
            [
                'https://app.fedi.xyz/link?screen=join&invite=fed1abc123',
                { invite: 'fed1abc123' },
            ],
            // community via invite= param (backwards compat)
            [
                'https://app.fedi.xyz/link#screen=join&invite=fedi%3Acommunity10abc',
                { invite: 'fedi:community10abc' },
            ],
            [
                'https://app.fedi.xyz/link?screen=join&invite=fedi%3Acommunity10abc',
                { invite: 'fedi:community10abc' },
            ],
        ])(
            'should navigate to JoinFederation for %s',
            (deepLink, expectedParams) => {
                const normalized = normalizeDeepLink(deepLink)
                expect(normalized).toBeDefined()

                if (!normalized) return
                const result = linking.getInternalLinkRoute(normalized.fediUri)
                expect(result).toEqual({
                    routes: [
                        {
                            name: 'JoinFederation',
                            params: expectedParams,
                        },
                    ],
                })
            },
        )
    })

    describe('join deep link without invite code', () => {
        it('should navigate to JoinFederation without params for https://app.fedi.xyz/link?screen=join', () => {
            const deepLink = 'https://app.fedi.xyz/link?screen=join'
            const normalized = normalizeDeepLink(deepLink)
            expect(normalized).toBeDefined()

            if (!normalized) return
            const result = linking.getInternalLinkRoute(normalized.fediUri)
            expect(result).toEqual({
                routes: [
                    {
                        name: 'JoinFederation',
                        params: {},
                    },
                ],
            })
        })
    })

    describe('community invite shared and parsed as deep link', () => {
        it('should restore the fedi: prefix after stripping it', () => {
            const inviteCode =
                'fedi:community10v3xxmmdd46ku6u6t5090k6et5t5090ku6t5090k6et56et5v90h2unvygazy6r5w3u6t5090k6et5u6t5090k6et5c8xw309a4x76tw'
            // Outgoing: strip prefix for share link
            const stripped = stripFediPrefix(inviteCode)
            expect(stripped).not.toMatch(/^fedi:/i)

            const shareUrl = `https://app.fedi.xyz/link#screen=join&id=${encodeURIComponent(stripped)}`

            // Incoming: parse deeplink
            const normalized = normalizeDeepLink(shareUrl)
            expect(normalized).toBeDefined()
            if (!normalized) return

            const result = linking.getInternalLinkRoute(normalized.fediUri)
            expect(result).toEqual({
                routes: [
                    {
                        name: 'JoinFederation',
                        params: { invite: inviteCode },
                    },
                ],
            })
        })

        it('should not affect federation invite codes', () => {
            const fedCode = 'fed1abc123'
            const stripped = stripFediPrefix(fedCode)
            expect(stripped).toBe(fedCode)

            const normalized = normalizeCommunityInviteCode(stripped)
            expect(normalized).toBe(fedCode)
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
