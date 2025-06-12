import { shouldHideNavigation } from '../../utils/nav'

describe('utils/nav', () => {
    describe('shouldHideNavigation', () => {
        describe('Desktop routes', () => {
            describe('Welcome page route', () => {
                it('should hide the nav bar', () => {
                    const result = shouldHideNavigation('/', false)
                    expect(result).toBe(true)
                })
            })

            // Users can access the welcome page with an invite code
            // for a quicker flow to join a federation
            describe('Welcome page route with a query string param', () => {
                it('should hide the nav bar', () => {
                    const result = shouldHideNavigation(
                        '/?invite_code=123',
                        false,
                    )
                    expect(result).toBe(true)
                })
            })

            describe('Home page route', () => {
                it('should show the nav bar', () => {
                    const result = shouldHideNavigation('/home', false)
                    expect(result).toBe(false)
                })
            })

            describe('Onboarding page route', () => {
                it('should hide the nav bar', () => {
                    const result = shouldHideNavigation('/onboarding', false)
                    expect(result).toBe(true)
                })
            })

            describe('SettingsNostr page route', () => {
                it('should show the nav bar', () => {
                    const result = shouldHideNavigation(
                        '/settings/nostr',
                        false,
                    )
                    expect(result).toBe(false)
                })
            })

            describe('ChatRoom page route', () => {
                it('should show the nav bar', () => {
                    const result = shouldHideNavigation('/chat/room/123', false)
                    expect(result).toBe(false)
                })
            })
        })

        describe('Mobile routes', () => {
            describe('Welcome page route', () => {
                it('should hide the nav bar', () => {
                    const result = shouldHideNavigation('/', true)
                    expect(result).toBe(true)
                })
            })

            // Users can access the welcome page with an invite code
            // for a quicker flow to join a federation
            describe('Welcome page route with a query string param', () => {
                it('should hide the nav bar', () => {
                    const result = shouldHideNavigation(
                        '/?invite_code=123',
                        false,
                    )
                    expect(result).toBe(true)
                })
            })

            describe('Home page route', () => {
                it('should show the nav bar', () => {
                    const result = shouldHideNavigation('/home', true)
                    expect(result).toBe(false)
                })
            })

            describe('Onboarding page route', () => {
                it('should hide the nav bar', () => {
                    const result = shouldHideNavigation('/onboarding', true)
                    expect(result).toBe(true)
                })
            })

            describe('SettingsNostr page route', () => {
                it('should hide the nav bar', () => {
                    const result = shouldHideNavigation('/settings/nostr', true)
                    expect(result).toBe(true)
                })
            })

            describe('ChatRoom page route', () => {
                it('should show the nav bar', () => {
                    const result = shouldHideNavigation('/chat/room/123', true)
                    expect(result).toBe(true)
                })
            })
        })
    })
})
