import notifee, { EventType } from '@notifee/react-native'
import { Linking } from 'react-native'

import { makeLog } from '@fedi/common/utils/log'

import { NavigationLinkingConfig } from '../types/navigation'
import { isZendeskNotification } from './notifications'
import { launchZendeskSupport, zendeskCloseMessagingView } from './support'

const log = makeLog('utils/linking')

// decodes `fedi://room/%21SMVoiKbTXICVNDTJKK%3Am1.8fa.in`
// to `fedi://room/!SMVoiKbTXICVNDTJKK:m1.8fa.in`
const decodeDeepLink = (uri: string) => {
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
 * If navigation is warranted, it returns a properly-formed deep link.
 * Handles URL-safe decoding of the input URI.
 *
 * Otherwise, it returns "" and calls fallback
 *
 * TODO: ensure all deep links are encoded with `encodeURIComponent`
 */
const parseLink = (uri: string, fallback: (uri: string) => void): string => {
    try {
        if (uri.startsWith('fedi://')) return decodeDeepLink(uri)

        // If it's not a deep link (e.g. fedi:...), don't navigate the user
        // and parse with the fallbackHandler (ie. the Omni Parser)
        fallback(uri)
        return ''
    } catch (error) {
        // TODO: handle malformed URI errors
        log.warn('Failed to parse link:', error)
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
                ChatRoomConversation: {
                    path: 'room/:roomId',
                },
                ChatUserConversation: 'user/:userId',
                ShareLogs: 'share-logs/:ticketNumber',
            },
        },
    },
}

/**
 * Generates Linking configuration for App Navigator.
 *
 * `getInitialURL` handles all links that are dispatched
 * while the app is closed (which opens the app).
 *
 * `subscribe` handles links that are dispatched while the app
 * is open. (ex. user taps notification while app is open,
 * user taps link in Fedi Mod, user trigger deep link in another part
 * of the application). This architecture lets us unify IDs (share link)
 * with navigation throughout the app.
 *
 * @param fallback Function called whenever a pressed link is not a
 * valid deep link
 */
export const getLinkingConfig = (
    fallback: (url: string) => void,
): NavigationLinkingConfig => {
    return {
        prefixes: [
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
    }
}
