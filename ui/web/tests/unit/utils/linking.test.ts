import { getDeepLinkPath } from '../../../src/utils/linking'

describe('utils/linking', () => {
    describe('processDeepLink', () => {
        it('should return the correct path for valid deep links', () => {
            expect(
                getDeepLinkPath('https://app.fedi.xyz/link?screen=chat'),
            ).toBe('/chat')

            expect(
                getDeepLinkPath('https://app.fedi.xyz/link?screen=room&id=123'),
            ).toBe('/chat/room/123')

            expect(
                getDeepLinkPath(
                    'https://app.fedi.xyz/link?screen=room&roomId=123',
                ),
            ).toBe('/chat/room/123')

            expect(
                getDeepLinkPath('https://app.fedi.xyz/link?screen=user&id=123'),
            ).toBe('/chat/user/123')

            expect(
                getDeepLinkPath(
                    'https://app.fedi.xyz/link?screen=user&userId=123',
                ),
            ).toBe('/chat/user/123')

            expect(
                getDeepLinkPath(
                    'https://app.fedi.xyz/link#screen=ecash&id=123',
                ),
            ).toBe('/ecash#id=123')

            expect(
                getDeepLinkPath(
                    'https://app.fedi.xyz/link#screen=browser&url=https%3A%2F%2Fexample.com%2Fapp',
                ),
            ).toBe('/browser#url=https%3A%2F%2Fexample.com%2Fapp')

            expect(
                getDeepLinkPath(
                    'https://app.fedi.xyz/link#screen=browser&url=example.com%2Fapp',
                ),
            ).toBe('/browser#url=https%3A%2F%2Fexample.com%2Fapp')

            expect(
                getDeepLinkPath(
                    'https://app.fedi.xyz/link?screen=browser&url=example.com%2Fapp',
                ),
            ).toBe('/browser#url=https%3A%2F%2Fexample.com%2Fapp')

            expect(
                getDeepLinkPath(
                    'https://app.fedi.xyz/link?screen=share-logs&ticketNumber=123',
                ),
            ).toBe('/share-logs?ticketNumber=123')

            expect(
                getDeepLinkPath(
                    'https://app.fedi.xyz/link#screen=join-then-ecash&invite=fed1abc123&ecash=cashutoken123',
                ),
            ).toBe(
                '/onboarding/join#id=fed1abc123&afterJoinEcash=cashutoken123',
            )

            expect(
                getDeepLinkPath(
                    'https://app.fedi.xyz/link?screen=join-then-ecash&invite=fed1abc123&ecash=cashutoken123',
                ),
            ).toBe(
                '/onboarding/join#id=fed1abc123&afterJoinEcash=cashutoken123',
            )

            expect(
                getDeepLinkPath(
                    'https://app.fedi.xyz/link#screen=join-then-browse&invite=fed1abc123&url=https%3A%2F%2Fexample.com%2Fapp',
                ),
            ).toBe(
                '/onboarding/join#id=fed1abc123&afterJoinUrl=https%3A%2F%2Fexample.com%2Fapp',
            )

            expect(
                getDeepLinkPath(
                    'https://app.fedi.xyz/link#screen=join-then-browse&invite=fed1abc123&url=example.com%2Fapp',
                ),
            ).toBe(
                '/onboarding/join#id=fed1abc123&afterJoinUrl=https%3A%2F%2Fexample.com%2Fapp',
            )

            expect(
                getDeepLinkPath(
                    'https://app.fedi.xyz/link?screen=join-then-browse&invite=fed1abc123&url=example.com%2Fapp',
                ),
            ).toBe(
                '/onboarding/join#id=fed1abc123&afterJoinUrl=https%3A%2F%2Fexample.com%2Fapp',
            )
        })

        it('should return fallback url for invalid deep links', () => {
            expect(getDeepLinkPath('https://app.fedi.xyz/link')).toBe('/')
            expect(getDeepLinkPath('https://app.fedi.xyz/home')).toBe('/')
            expect(
                getDeepLinkPath(
                    'https://app.fedi.xyz/link?screen=join-then-ecash&invite=fed1abc123',
                ),
            ).toBe('/home')
            expect(
                getDeepLinkPath(
                    'https://app.fedi.xyz/link?screen=join-then-ecash&ecash=cashutoken123',
                ),
            ).toBe('/home')
            expect(
                getDeepLinkPath(
                    'https://app.fedi.xyz/link?screen=join-then-browse&invite=fed1abc123',
                ),
            ).toBe('/home')
            expect(
                getDeepLinkPath(
                    'https://app.fedi.xyz/link?screen=join-then-browse&url=example.com%2Fapp',
                ),
            ).toBe('/home')
        })
    })
})
