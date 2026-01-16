import { shouldHideNavigation } from '../../../src/utils/nav'

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

        describe('Scan page route', () => {
            it('should hide the nav bar', () => {
                const result = shouldHideNavigation('/scan')
                expect(result).toBe(true)
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
})
