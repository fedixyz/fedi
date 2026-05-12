import { HomeNavigationTab } from '@fedi/common/types/linking'
import {
    getRecoveryRedirectPath,
    getRedirectPath,
    getUnauthenticatedRedirectPath,
    shouldHideNavigation,
} from '@fedi/web/src/utils/nav'

describe('utils/nav', () => {
    describe('shouldHideNavigation', () => {
        describe('Welcome page route', () => {
            it('should hide the nav bar', () => {
                const result = shouldHideNavigation('/')
                expect(result).toBe(true)
            })
        })

        // Users can access the welcome page with an invite code
        // for a quicker flow to join a federation
        describe('Welcome page route with a query string param', () => {
            it('should hide the nav bar', () => {
                const result = shouldHideNavigation('/?id=123')
                expect(result).toBe(true)
            })
        })

        describe('Home page route', () => {
            it('should not hide the nav bar', () => {
                const result = shouldHideNavigation('/home')
                expect(result).toBe(false)
            })
        })

        describe('Onboarding page route', () => {
            it('should hide the nav bar', () => {
                const result = shouldHideNavigation('/onboarding')
                expect(result).toBe(true)
            })
        })

        describe('Settings page route', () => {
            it('should hide the nav bar', () => {
                const result = shouldHideNavigation('/settings')
                expect(result).toBe(true)
            })
        })

        describe('Settings Nostr page route', () => {
            it('should hide the nav bar', () => {
                const result = shouldHideNavigation('/settings/nostr')
                expect(result).toBe(true)
            })
        })

        describe('Chat page route', () => {
            it('should not hide the nav bar', () => {
                const result = shouldHideNavigation('/chat')
                expect(result).toBe(false)
            })
        })

        describe('ChatRoom page route', () => {
            it('should hide the nav bar', () => {
                const result = shouldHideNavigation('/chat/room/123')
                expect(result).toBe(true)
            })
        })

        describe('Transactions page route', () => {
            it('should hide the nav bar', () => {
                const result = shouldHideNavigation('/transactions')
                expect(result).toBe(true)
            })
        })
    })

    describe('getRecoveryRedirectPath', () => {
        it('should force device index selection when required', () => {
            const result = getRecoveryRedirectPath({
                asPath: '/chat',
                pathname: '/chat',
                deviceIndexRequired: true,
                socialRecoveryId: null,
            })

            expect(result).toBe('/onboarding/recover/wallet-transfer')
        })

        it('should force social recovery when in progress', () => {
            const result = getRecoveryRedirectPath({
                asPath: '/chat',
                pathname: '/chat',
                deviceIndexRequired: false,
                socialRecoveryId: 'recovery-id',
            })

            expect(result).toBe('/onboarding/recover/social')
        })

        it('should not redirect when no recovery flow is active', () => {
            const result = getRecoveryRedirectPath({
                asPath: '/chat',
                pathname: '/chat',
                deviceIndexRequired: false,
                socialRecoveryId: null,
            })

            expect(result).toBeUndefined()
        })
    })

    describe('getRedirectPath', () => {
        const defaultParams = {
            asPath: '/',
            pathname: '/',
            hasLoadedStorage: true,
            lastUsedTab: HomeNavigationTab.Wallet,
        }

        it('should redirect onboarded users from root to their last used tab', () => {
            const result = getRedirectPath(defaultParams)

            expect(result).toBe('/wallet')
        })

        it('should redirect onboarded users from a deferred chat screen hash', () => {
            const result = getRedirectPath({
                ...defaultParams,
                asPath: '/#screen=chat',
            })

            expect(result).toBe('/chat')
        })

        it('should keep ecash ids in the hash when replaying a deferred ecash screen', () => {
            const result = getRedirectPath({
                ...defaultParams,
                asPath: '/#screen=ecash&id=test-token',
            })

            expect(result).toBe('/ecash#id=test-token')
        })

        it('should replay deferred onboarding links with all params in the hash', () => {
            const result = getRedirectPath({
                ...defaultParams,
                asPath: '/#screen=onboarding%2Fjoin&id=fed1abc123&afterJoinUrl=https%3A%2F%2Fexample.com',
            })

            expect(result).toBe(
                '/onboarding/join#id=fed1abc123&afterJoinUrl=https%3A%2F%2Fexample.com',
            )
        })

        it('should replay deferred browser links with url in the hash', () => {
            const result = getRedirectPath({
                ...defaultParams,
                asPath: '/#screen=browser&url=https%3A%2F%2Fexample.com',
            })

            expect(result).toBe('/browser#url=https%3A%2F%2Fexample.com')
        })

        it('should not redirect away from non-root pages', () => {
            const result = getRedirectPath({
                ...defaultParams,
                asPath: '/chat',
                pathname: '/chat',
            })

            expect(result).toBeUndefined()
        })
    })

    describe('getUnauthenticatedRedirectPath', () => {
        it('should preserve target screens when users have not onboarded yet', () => {
            const result = getUnauthenticatedRedirectPath({
                asPath: '/chat',
                pathname: '/chat',
                href: 'https://app.fedi.xyz/chat',
            })

            expect(result).toBe('/#screen=chat')
        })

        it('should preserve all query and hash params when users have not onboarded yet', () => {
            const result = getUnauthenticatedRedirectPath({
                asPath: '/onboarding/join#id=fed1abc123&afterJoinUrl=https%3A%2F%2Fexample.com',
                pathname: '/onboarding/join',
                href: 'https://app.fedi.xyz/onboarding/join#id=fed1abc123&afterJoinUrl=https%3A%2F%2Fexample.com',
            })

            expect(result).toBe(
                '/#screen=onboarding%2Fjoin&id=fed1abc123&afterJoinUrl=https%3A%2F%2Fexample.com',
            )
        })

        it('should not redirect root routes', () => {
            const result = getUnauthenticatedRedirectPath({
                asPath: '/',
                pathname: '/',
                href: 'https://app.fedi.xyz/',
            })

            expect(result).toBeUndefined()
        })
    })
})
