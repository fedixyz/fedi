import notifee, { EventType } from '@notifee/react-native'
// adjust path if needed
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Linking } from 'react-native'

import { makeLog } from '@fedi/common/utils/log'

import { FediMod, Shortcut } from '../types'
import {
    NavigationLinkingConfig,
    RootStackParamList,
} from '../types/navigation'
import { isZendeskNotification } from './notifications'
import { launchZendeskSupport, zendeskCloseMessagingView } from './support'

type NavigationProp = Pick<
    NativeStackNavigationProp<RootStackParamList>,
    'navigate'
>
const log = makeLog('utils/linking')

export type ScreenConfig =
    | string
    | {
          path?: string
          screens?: Record<string, ScreenConfig>
      }

export const isFediDeeplinkType = (url: string): boolean => {
    return (
        url.includes('https://t.me') ||
        url.includes('https://wa.me') ||
        url.includes('https://app.fedi.xyz')
    )
}

export const handleFediModNavigation = (
    shortcut: Shortcut,
    navigation: NavigationProp,
): void => {
    const fediMod = shortcut as FediMod

    if (isFediDeeplinkType(fediMod.url)) {
        Linking.openURL(fediMod.url)
    } else {
        navigation.navigate('FediModBrowser', { url: fediMod.url })
    }
}
/**
 * Recursively extracts the first path segments from all deep linkable screens
 * in a React Navigation linking config.
 */
export function getValidScreens(
    screens: Record<string, ScreenConfig | null> | undefined,
): Set<string> {
    const validScreens = new Set<string>()

    if (!screens) return validScreens

    for (const value of Object.values(screens)) {
        if (typeof value === 'string') {
            validScreens.add(value.split('/')[0])
        } else if (typeof value === 'object' && value !== null) {
            if (value.path) {
                validScreens.add(value.path.split('/')[0])
            }
            const nestedScreens = getValidScreens(value.screens)
            for (const s of nestedScreens) {
                validScreens.add(s)
            }
        }
    }

    return validScreens
}

// decodes `fedi://room/%21SMVoiKbTXICVNDTJKK%3Am1.8fa.in`
// to `fedi://room/!SMVoiKbTXICVNDTJKK:m1.8fa.in`
export const decodeDeepLink = (uri: string) => {
    const url = new URL(uri)
    const scheme = url.protocol
    const host = url.host
    // For each path param, decode it
    const paths = url.pathname
        .split('/')
        .filter(Boolean)
        .map(decodeURIComponent)
    return `${scheme}//${host}/${paths.join('/')}`
}

/**
 * Turn https://app.fedi.xyz/link#screen=user&id=%40npub…
 * into fedi://user/@npub…
 * If navigation is warranted, it returns a properly-formed deep link.
 * Handles URL-safe decoding of the input URI. Otherwise, it returns "" and calls fallback
 * TODO: ensure all deep links are encoded with `encodeURIComponent`
 */
export function parseLink(uri: string, fallback: (u: string) => void): string {
    log.debug('parseLink called with', uri)

    try {
        const url = new URL(uri)
        log.info('Parsed URL', {
            protocol: url.protocol,
            host: url.host,
            path: url.pathname,
        })

        // Web universal link: https://app.fedi.xyz/link#screen=...&id=...
        if (
            url.protocol === 'https:' &&
            (url.host === 'app.fedi.xyz' || url.host === 'www.app.fedi.xyz') &&
            url.pathname === '/link'
        ) {
            const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
            log.debug('Link fragment:', hash)

            const params = new URLSearchParams(hash)
            const screen = params.get('screen')
            const idParam = params.get('id')

            if (screen && idParam) {
                if (!validScreens.has(screen)) {
                    log.warn('parseLink: invalid screen value', { screen })
                    fallback(uri)
                    return ''
                }

                log.info('Deep-link parameters found', { screen, id: idParam })
                const decoded = decodeURIComponent(idParam)
                const deepUrl = `fedi://${screen}/${decoded}`
                log.debug('Constructed deep URL:', deepUrl)
                return deepUrl
            }

            log.warn('parseLink: missing or invalid screen/id', { hash })
            fallback(uri)
            return ''
        }

        // Native fedi:// link → normalize percent-encoding
        if (uri.startsWith('fedi://')) {
            log.debug('Native fedi:// link detected, decoding')
            return decodeDeepLink(uri)
        }

        // All other URLs → fallback
        log.info('Non-app.fedi.xyz link, falling back', uri)
        fallback(uri)
        return ''
    } catch (e) {
        log.error('parseLink error parsing URL', e)
        fallback(uri)
        return ''
    }
}

/**
 * Maps valid deep links. This needs to be updated whenever
 * we add a new link type.
 * ref: https://reactnavigation.org/docs/configuring-links
 */
const deepLinksConfig: NavigationLinkingConfig['config'] = {
    screens: {
        MainNavigator: {
            initialRouteName: 'TabsNavigator',
            screens: {
                TabsNavigator: {
                    screens: {
                        Home: 'home',
                        Chat: 'chat',
                        OmniScanner: 'scan',
                    },
                },
                // Wallet (Send)
                Send: 'send',
                // Modals
                Transactions: 'transactions',
                // Chat
                ChatRoomConversation: { path: 'room/:roomId' },
                ChatUserConversation: 'user/:userId',
                ShareLogs: 'share-logs/:ticketNumber',
            },
        },
    },
}

type MainScreens = Record<string, ScreenConfig>

const validScreens = getValidScreens(
    (
        deepLinksConfig as {
            screens: { MainNavigator: { screens: MainScreens } }
        }
    ).screens.MainNavigator.screens,
)

/**
 * Generates Linking configuration for App Navigator.
 * `getInitialURL` handles all links dispatched while the app is closed.
 * `subscribe` handles links dispatched while the app is open (e.g. tapping a link or notification).
 * Unifies link navigation across the app.
 * @param fallback Function called when a link is not a valid deep link
 */
export const getLinkingConfig = (
    fallback: (url: string) => void,
): NavigationLinkingConfig => ({
    prefixes: [
        'https://app.fedi.xyz',
        'https://www.app.fedi.xyz',
        'fedi://', // treat as deep link
        'fedi:',
        'lightning:',
        'bitcoin:',
        'lnurlw://',
        'lnurlp://',
        'keyauth://',
    ],
    config: deepLinksConfig,
    getInitialURL: async () => {
        // Check if app was opened with deep link
        const url = await Linking.getInitialURL()

        // If navigation is warranted, it return a link.
        // Otherwise, it returns "" and calls fallback
        if (url != null) return parseLink(url, fallback)

        // Check if app was opened with notification
        const message = await notifee.getInitialNotification()
        // Notifications should have a `link` property
        const link = message?.notification?.data?.link
        // If not, we no-op
        if (typeof link !== 'string') return ''

        // If navigation is warranted, it return a link.
        // Otherwise, it returns "" and calls fallback
        return parseLink(link, fallback)
    },
    // Subscribe to future links that bring the app to the foreground.
    subscribe: listener => {
        const subscription = Linking.addEventListener(
            'url',
            async ({ url }) => {
                log.info('URL received', url)

                // Attempt to close Zendesk Messaging View if it's open
                await zendeskCloseMessagingView()

                // If navigation is warranted, it return a link.
                // Otherwise, it returns "" and calls fallback
                const link = parseLink(url, fallback)

                if (link !== '') listener(link)
            },
        )

        const unsubscribe = notifee.onForegroundEvent(async e => {
            if (e.type !== EventType.PRESS) return

            //test for zendesk
            const isZendesk = await isZendeskNotification(
                e.detail?.notification?.data,
            )
            if (isZendesk) {
                log.info('Zendesk foreground notification was pressed')
                await launchZendeskSupport(error =>
                    log.error('Zendesk error:', error),
                )
                return
            }

            // Notifications should have a string `link` property
            const uri = e.detail?.notification?.data?.link
            // If not, we no-op
            if (typeof uri !== 'string') {
                log.warn(
                    'Notification pressed, but "link" is not present (no-op):',
                    e.detail,
                )
                return
            }

            const link = parseLink(uri, fallback)
            if (link !== '') return listener(link)
            log.warn('Notification link could not be parsed (no-op)', link)
        })

        return () => {
            subscription.remove()
            unsubscribe()
        }
    },
})
