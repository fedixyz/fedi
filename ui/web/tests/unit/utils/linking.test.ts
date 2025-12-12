import { isDeepLink, getDeepLinkPath } from '../../../src/utils/linking'

describe('utils/linking', () => {
    describe('isDeepLink', () => {
        it('should return true for valid deep links', () => {
            expect(isDeepLink('https://app.fedi.xyz/link?screen=chat')).toBe(
                true,
            )
            expect(
                isDeepLink('https://app.fedi.xyz/link?screen=user&id=123'),
            ).toBe(true)
        })

        it('should return false for non deep links', () => {
            expect(isDeepLink('https://app.fedi.xyz/chat')).toBe(false)
            expect(isDeepLink('https://app.fedi.xyz/user/123')).toBe(false)
        })
    })

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
                    'https://app.fedi.xyz/link#screen=ecash&id=123',
                ),
            ).toBe('/ecash#id=123')
        })

        it('should return fallback url for invalid deep links', () => {
            expect(getDeepLinkPath('https://app.fedi.xyz/home')).toBe('/')
        })
    })
})
