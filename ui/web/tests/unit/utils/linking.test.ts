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
                    'https://app.fedi.xyz/link?screen=share-logs&ticketNumber=123',
                ),
            ).toBe('/share-logs?ticketNumber=123')
        })

        it('should return fallback url for invalid deep links', () => {
            expect(getDeepLinkPath('https://app.fedi.xyz/link')).toBe('/')
            expect(getDeepLinkPath('https://app.fedi.xyz/home')).toBe('/')
        })
    })
})
