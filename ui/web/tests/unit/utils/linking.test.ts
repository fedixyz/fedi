import { isDeepLink, getDeepLinkPath } from '../../../src/utils/linking'

describe('utils/linking', () => {
    describe('isDeepLink', () => {
        it('should return true for deep links', () => {
            expect(isDeepLink('/link')).toBe(true)
            expect(isDeepLink('/link#screen=home')).toBe(true)
            expect(isDeepLink('/link#screen=chat')).toBe(true)
            expect(isDeepLink('/link#screen=scan')).toBe(true)
            expect(isDeepLink('/link#screen=transactions')).toBe(true)
            expect(isDeepLink('/link#screen=send')).toBe(true)
            expect(isDeepLink('/link#screen=user&id=123')).toBe(true)
            expect(isDeepLink('/link#screen=room&id=123')).toBe(true)
        })

        it('should return false for non deep links', () => {
            expect(isDeepLink('/home')).toBe(false)
            expect(isDeepLink('/chat')).toBe(false)
            expect(isDeepLink('/scan')).toBe(false)
            expect(isDeepLink('/transactions')).toBe(false)
            expect(isDeepLink('/send')).toBe(false)
            expect(isDeepLink('/user/123')).toBe(false)
            expect(isDeepLink('/room/123')).toBe(false)
        })
    })

    describe('processDeepLink', () => {
        it('should return the correct path for valid deep links', () => {
            expect(getDeepLinkPath('/link#screen=home')).toBe('/home')
            expect(getDeepLinkPath('/link#screen=chat')).toBe('/chat')
            expect(getDeepLinkPath('/link#screen=scan')).toBe('/scan')
            expect(getDeepLinkPath('/link#screen=transactions')).toBe(
                '/transactions',
            )
            expect(getDeepLinkPath('/link#screen=send')).toBe('/send')
            expect(getDeepLinkPath('/link#screen=user&id=123')).toBe(
                '/chat/user/123',
            )
            expect(getDeepLinkPath('/link#screen=room&id=123')).toBe(
                '/chat/room/123',
            )
        })

        it('should return fallback url for invalid deep links', () => {
            expect(getDeepLinkPath('/link')).toBe('/')
            expect(getDeepLinkPath('/link?screen=none')).toBe('/')
        })
    })
})
