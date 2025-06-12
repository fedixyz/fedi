// prettier-ignore-end
import { Linking } from 'react-native'

import { FediMod, ShortcutType } from '../../types'
import {
    parseLink,
    isFediDeeplinkType,
    decodeDeepLink,
    getValidScreens,
    handleFediModNavigation,
    ScreenConfig,
} from '../../utils/linking'

/*
//'getValidScreens Tests
*/

describe('getValidScreens', () => {
    it('returns an empty set when no screens are provided', () => {
        expect(getValidScreens(undefined)).toEqual(new Set())
    })

    it('handles flat screen config with string paths', () => {
        const screens = {
            Home: 'home',
            Profile: 'user/:userId',
            Settings: 'settings/preferences',
        }

        expect(getValidScreens(screens)).toEqual(
            new Set(['home', 'user', 'settings']),
        )
    })

    it('handles nested screen configs with paths', () => {
        const screens = {
            Tabs: {
                screens: {
                    Chat: 'chat',
                    Wallet: {
                        path: 'wallet/send',
                        screens: {
                            SendForm: 'form',
                        },
                    },
                },
            },
            Modal: {
                path: 'modal',
            },
        }

        expect(getValidScreens(screens)).toEqual(
            new Set(['chat', 'wallet', 'form', 'modal']),
        )
    })

    it('ignores malformed or null screen entries', () => {
        const screens: Record<string, ScreenConfig | null> = {
            Valid: 'valid/path',
            Broken: null, // now valid!
            AlsoValid: {
                path: 'deep/route',
            },
        }

        expect(getValidScreens(screens)).toEqual(new Set(['valid', 'deep']))
    })
})

/*
//'Deeplink Tests
*/

describe('isFediDeeplinkType', () => {
    it('returns true for Telegram links', () => {
        expect(isFediDeeplinkType('https://t.me/somechannel')).toBe(true)
    })

    it('returns true for WhatsApp links', () => {
        expect(isFediDeeplinkType('https://wa.me/123456789')).toBe(true)
    })

    it('returns true for app.fedi.xyz links', () => {
        expect(
            isFediDeeplinkType(
                'https://app.fedi.xyz/link#screen=user&id=@npub',
            ),
        ).toBe(true)
    })

    it('returns false for non-matching links', () => {
        expect(isFediDeeplinkType('https://example.com')).toBe(false)
    })
})

describe('parseLink', () => {
    const fallback = jest.fn()

    beforeEach(() => {
        fallback.mockClear()
    })

    it('parses a valid fedi.xyz link into a fedi:// deep link', () => {
        const result = parseLink(
            'https://app.fedi.xyz/link#screen=user&id=%40npub123',
            fallback,
        )
        expect(result).toBe('fedi://user/@npub123')
        expect(fallback).not.toHaveBeenCalled()
    })

    it('returns empty string and calls fallback if screen is not valid', () => {
        const result = parseLink(
            'https://app.fedi.xyz/link#screen=invalid&id=%40npub123',
            fallback,
        )
        expect(result).toBe('')
        expect(fallback).toHaveBeenCalledWith(
            'https://app.fedi.xyz/link#screen=invalid&id=%40npub123',
        )
    })

    it('returns empty string and calls fallback if id is missing', () => {
        const result = parseLink(
            'https://app.fedi.xyz/link#screen=user',
            fallback,
        )
        expect(result).toBe('')
        expect(fallback).toHaveBeenCalled()
    })

    it('returns decoded deep link for native fedi:// link', () => {
        const result = parseLink('fedi://room/%21abc%3Amatrix.org', fallback)
        expect(result).toBe('fedi://room/!abc:matrix.org')
        expect(fallback).not.toHaveBeenCalled()
    })

    it('returns empty string and calls fallback for non-fedi, non-app links', () => {
        const result = parseLink('https://example.com/page', fallback)
        expect(result).toBe('')
        expect(fallback).toHaveBeenCalledWith('https://example.com/page')
    })

    it('returns empty string and calls fallback if URI is malformed', () => {
        const result = parseLink('::::', fallback)
        expect(result).toBe('')
        expect(fallback).toHaveBeenCalled()
    })
})

describe('decodeDeepLink', () => {
    it('decodes percent-encoded path segments in fedi URI', () => {
        const result = decodeDeepLink('fedi://room/%21abc%3Amatrix.org')
        expect(result).toBe('fedi://room/!abc:matrix.org')
    })

    it('returns original structure if no percent encoding is present', () => {
        const result = decodeDeepLink('fedi://user/someuser')
        expect(result).toBe('fedi://user/someuser')
    })
})

/*
// Fedi Mod Navigation Tests
// */
describe('handleFediModNavigation', () => {
    const navigateMock = jest.fn()

    const navigation = {
        navigate: navigateMock,
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('opens Telegram URL via Linking.openURL', () => {
        const shortcut = {
            title: 'Telegram',
            icon: {
                url: 'https://example.com/telegram-icon.png',
            },
            type: ShortcutType.fediMod,
            url: 'https://t.me/somechannel',
        } as FediMod

        handleFediModNavigation(shortcut, navigation)

        expect(Linking.openURL).toHaveBeenCalledWith('https://t.me/somechannel')
        expect(navigateMock).not.toHaveBeenCalled()
    })

    it('opens WhatsApp URL via Linking.openURL', () => {
        const shortcut = {
            title: 'WhatsApp',
            icon: {
                url: 'https://example.com/whatsapp-icon.png',
            },
            type: ShortcutType.fediMod,
            url: 'https://wa.me/1234567890',
        } as FediMod

        handleFediModNavigation(shortcut, navigation)

        expect(Linking.openURL).toHaveBeenCalledWith('https://wa.me/1234567890')
        expect(navigateMock).not.toHaveBeenCalled()
    })

    it('opens app.fedi.xyz link via Linking.openURL', () => {
        const shortcut = {
            title: 'Deep Link',
            icon: {
                url: 'https://example.com/fedi-icon.png',
            },
            type: ShortcutType.fediMod,
            url: 'https://app.fedi.xyz/link#screen=user&id=%40npub',
        } as FediMod

        handleFediModNavigation(shortcut, navigation)

        expect(Linking.openURL).toHaveBeenCalledWith(
            'https://app.fedi.xyz/link#screen=user&id=%40npub',
        )
        expect(navigateMock).not.toHaveBeenCalled()
    })

    it('navigates to FediModBrowser for all other links', () => {
        const shortcut = {
            title: 'My Custom Mod',
            icon: {
                url: 'https://example.com/custom-icon.png',
            },
            type: ShortcutType.fediMod,
            url: 'https://fedi.xyz/whatever',
        } as FediMod

        handleFediModNavigation(shortcut, navigation)

        expect(Linking.openURL).not.toHaveBeenCalled()
        expect(navigation.navigate).toHaveBeenCalledWith('FediModBrowser', {
            url: 'https://fedi.xyz/whatever',
        })
    })
})
