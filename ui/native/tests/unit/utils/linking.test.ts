// prettier-ignore-end
import { Linking } from 'react-native'

import { type ScreenConfig } from '@fedi/common/types/linking'
import {
    universalToFedi,
    isUniversalLink,
    isFediDeeplinkType,
    decodeFediDeepLink,
    parseDeepLink,
    getValidScreens,
} from '@fedi/common/utils/linking'

import { FediMod, ShortcutType } from '../../../types'
import { handleFediModNavigation } from '../../../utils/linking'

/**
 * getValidScreens Tests
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
            Broken: null,
            AlsoValid: {
                path: 'deep/route',
            },
        }

        expect(getValidScreens(screens)).toEqual(new Set(['valid', 'deep']))
    })
})

/**
 * Universal Link Tests
 */
describe('isUniversalLink', () => {
    it('returns true for valid universal links', () => {
        expect(
            isUniversalLink('https://app.fedi.xyz/link?screen=user&id=123'),
        ).toBe(true)
    })

    it('returns false for non-universal links', () => {
        expect(isUniversalLink('https://example.com/page')).toBe(false)
    })

    it('returns false for malformed URLs', () => {
        expect(isUniversalLink('::::')).toBe(false)
    })
})

describe('universalToFedi', () => {
    it('converts a valid universal link to fedi:// format', () => {
        const result = universalToFedi(
            'https://app.fedi.xyz/link?screen=user&id=%40npub123',
        )
        expect(result).toBe('fedi://user/@npub123')
    })

    it('returns empty string for invalid universal links', () => {
        const result = universalToFedi('https://example.com/page')
        expect(result).toBe('')
    })

    it('returns empty string when screen parameter is missing', () => {
        const result = universalToFedi(
            'https://app.fedi.xyz/link?id=%40npub123',
        )
        expect(result).toBe('')
    })

    it('returns valid fedi URL when id parameter is missing', () => {
        const result = universalToFedi('https://app.fedi.xyz/link?screen=user')
        expect(result).toBe('fedi://user')
    })
})

/**
 * Deep Link Tests
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
                'https://app.fedi.xyz/link?screen=user&id=@npub',
            ),
        ).toBe(true)
    })

    it('returns false for non-matching links', () => {
        expect(isFediDeeplinkType('https://example.com')).toBe(false)
    })
})

describe('parseDeepLink', () => {
    const validScreens = new Set(['user', 'room', 'chat'])

    it('parses a valid universal link', () => {
        const result = parseDeepLink(
            'https://app.fedi.xyz/link?screen=user&id=%40npub123',
            validScreens,
        )

        expect(result.screen).toBe('user')
        expect(result.id).toBe('@npub123')
        expect(result.isValid).toBe(true)
        expect(result.originalUrl).toBe(
            'https://app.fedi.xyz/link?screen=user&id=%40npub123',
        )
        expect(result.fediUrl).toBe('fedi://user/@npub123')
    })

    it('parses a valid fedi:// link', () => {
        const result = parseDeepLink(
            'fedi://room/%21abc%3Amatrix.org',
            validScreens,
        )

        expect(result.screen).toBe('room')
        expect(result.id).toBe('!abc:matrix.org')
        expect(result.isValid).toBe(true)
        expect(result.originalUrl).toBe('fedi://room/%21abc%3Amatrix.org')
        expect(result.fediUrl).toBe('fedi://room/!abc:matrix.org')
    })

    it('marks invalid screen as invalid', () => {
        const result = parseDeepLink(
            'https://app.fedi.xyz/link?screen=invalid&id=%40npub123',
            validScreens,
        )

        expect(result.screen).toBe('invalid')
        expect(result.id).toBe('@npub123')
        expect(result.isValid).toBe(false)
    })

    it('handles malformed URLs', () => {
        const result = parseDeepLink('::::', validScreens)

        expect(result.screen).toBe('')
        expect(result.isValid).toBe(false)
        expect(result.originalUrl).toBe('::::')
    })

    it('handles non-fedi URLs', () => {
        const result = parseDeepLink('https://example.com/page', validScreens)

        expect(result.screen).toBe('')
        expect(result.isValid).toBe(false)
        expect(result.originalUrl).toBe('https://example.com/page')
    })
})

describe('decodeFediDeepLink', () => {
    it('decodes percent-encoded path segments in fedi URI', () => {
        const result = decodeFediDeepLink('fedi://room/%21abc%3Amatrix.org')
        expect(result).toBe('fedi://room/!abc:matrix.org')
    })

    it('returns original URI if no percent encoding is present', () => {
        const result = decodeFediDeepLink('fedi://user/someuser')
        expect(result).toBe('fedi://user/someuser')
    })

    it('returns original URI if not a fedi:// link', () => {
        const result = decodeFediDeepLink('https://example.com')
        expect(result).toBe('https://example.com')
    })

    it('handles malformed URIs gracefully', () => {
        const result = decodeFediDeepLink(':::malformed:::')
        expect(result).toBe(':::malformed:::')
    })
})

/**
 * FediMod Navigation Tests
 */
describe('handleFediModNavigation', () => {
    const navigateMock = jest.fn()
    const navigation = {
        navigate: navigateMock,
    }

    // Store original Linking.openURL
    const originalOpenURL = Linking.openURL

    // Mock Linking.openURL - this will be the actual implementation called
    const mockOpenURL = jest
        .fn()
        .mockImplementation(() => Promise.resolve(true))

    beforeEach(() => {
        jest.clearAllMocks()
        // Reset Linking.openURL to our mock before each test
        Linking.openURL = mockOpenURL
    })

    afterEach(() => {
        // Restore original implementation after each test
        Linking.openURL = originalOpenURL
    })

    it('opens Telegram URL via Linking.openURL', async () => {
        const shortcut = {
            title: 'Telegram',
            icon: {
                url: 'https://example.com/telegram-icon.png',
            },
            type: ShortcutType.fediMod,
            url: 'https://t.me/somechannel',
        } as FediMod

        await handleFediModNavigation(shortcut, navigation)

        expect(mockOpenURL).toHaveBeenCalledWith('https://t.me/somechannel')
        expect(navigateMock).not.toHaveBeenCalled()
    })

    it('opens WhatsApp URL via Linking.openURL', async () => {
        const shortcut = {
            title: 'WhatsApp',
            icon: {
                url: 'https://example.com/whatsapp-icon.png',
            },
            type: ShortcutType.fediMod,
            url: 'https://wa.me/1234567890',
        } as FediMod

        await handleFediModNavigation(shortcut, navigation)

        expect(mockOpenURL).toHaveBeenCalledWith('https://wa.me/1234567890')
        expect(navigateMock).not.toHaveBeenCalled()
    })

    it('opens app.fedi.xyz link via Linking.openURL', async () => {
        const shortcut = {
            title: 'Deep Link',
            icon: {
                url: 'https://example.com/fedi-icon.png',
            },
            type: ShortcutType.fediMod,
            url: 'https://app.fedi.xyz/link?screen=user&id=%40npub',
        } as FediMod

        await handleFediModNavigation(shortcut, navigation)

        expect(mockOpenURL).toHaveBeenCalledWith(
            'https://app.fedi.xyz/link?screen=user&id=%40npub',
        )
        expect(navigateMock).not.toHaveBeenCalled()
    })

    it('navigates to FediModBrowser for all other links', async () => {
        const shortcut = {
            title: 'My Custom Mod',
            icon: {
                url: 'https://example.com/custom-icon.png',
            },
            type: ShortcutType.fediMod,
            url: 'https://fedi.xyz/whatever',
        } as FediMod

        await handleFediModNavigation(shortcut, navigation)

        expect(mockOpenURL).not.toHaveBeenCalled()
        expect(navigation.navigate).toHaveBeenCalledWith('FediModBrowser')
    })
})
