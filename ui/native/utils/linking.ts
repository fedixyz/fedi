import notifee, { EventType } from '@notifee/react-native'
import { CommonActions, NavigationContainerRef } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Linking } from 'react-native'

import {
    type NavigationAction,
    type ParsedDeepLink,
    type ScreenConfig,
} from '@fedi/common/types/linking'
import {
    isUniversalLink,
    getValidScreens,
    parseDeepLink,
    isFediDeeplinkType,
    PinAwareDeepLinkQueue,
    setDeepLinkHandler,
} from '@fedi/common/utils/linking'
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

/**
 * React Navigation linking configuration for deep links.
 *
 * Maps URL paths to screen navigation routes. When adding new screens that should
 * be accessible via deep links, update this configuration and ensure the screen
 * name is added to the createNavigationAction() function as well.
 *
 * @see https://reactnavigation.org/docs/configuring-links
 * @see createNavigationAction() function for navigation logic
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
                Send: 'send',
                Transactions: 'transactions',
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
 * React Navigation state management
 */
let navigationRef: NavigationContainerRef<RootStackParamList> | null = null
let isNavigationReady = false
const pinAwareQueue = new PinAwareDeepLinkQueue()

// Set the callback so common can call back to native
setDeepLinkHandler((url: string) => {
    return handleInternalDeepLinkDirect(url)
})

export const setNavigationRef = (
    r: NavigationContainerRef<RootStackParamList> | null,
) => {
    navigationRef = r
    log.debug('Navigation ref set', { hasRef: !!r })
}

export const setNavigationReady = () => {
    log.info('Navigation marked as ready')
    isNavigationReady = true
    pinAwareQueue.setNavigationReady()
}

export const setAppUnlocked = (unlocked: boolean) => {
    log.info('App PIN state changed', { unlocked })
    pinAwareQueue.setAppUnlocked(unlocked)
}

/**
 * Create navigation actions for each screen type.
 */
export function createNavigationAction(
    parsedLink: ParsedDeepLink,
): NavigationAction | null {
    if (!parsedLink.isValid) {
        return null
    }

    const { screen, id } = parsedLink

    switch (screen) {
        case 'room':
            if (!id) return null
            return {
                type: 'navigate',
                screen: 'MainNavigator',
                nested: {
                    screen: 'ChatRoomConversation',
                    params: { roomId: id },
                },
            }

        case 'user':
            if (!id) return null
            return {
                type: 'navigate',
                screen: 'MainNavigator',
                nested: {
                    screen: 'ChatUserConversation',
                    params: { userId: id },
                },
            }

        case 'home':
            return {
                type: 'navigate',
                screen: 'MainNavigator',
                nested: {
                    screen: 'TabsNavigator',
                    params: { screen: 'Home' },
                },
            }

        case 'chat':
            return {
                type: 'navigate',
                screen: 'MainNavigator',
                nested: {
                    screen: 'TabsNavigator',
                    params: { screen: 'Chat' },
                },
            }

        case 'scan':
            return {
                type: 'navigate',
                screen: 'MainNavigator',
                nested: {
                    screen: 'TabsNavigator',
                    params: { screen: 'OmniScanner' },
                },
            }

        case 'send':
            return {
                type: 'navigate',
                screen: 'MainNavigator',
                nested: {
                    screen: 'Send',
                },
            }

        case 'transactions':
            return {
                type: 'navigate',
                screen: 'MainNavigator',
                nested: {
                    screen: 'Transactions',
                },
            }

        case 'share-logs':
            if (!id) return null
            return {
                type: 'navigate',
                screen: 'MainNavigator',
                nested: {
                    screen: 'ShareLogs',
                    params: { ticketNumber: id },
                },
            }

        default:
            return null
    }
}

/**
 * Execute a navigation action using React Navigation
 */
const executeNavigationAction = (action: NavigationAction): boolean => {
    try {
        if (action.nested) {
            navigationRef?.dispatch(
                CommonActions.navigate(action.screen, {
                    screen: action.nested.screen,
                    params: action.nested.params,
                }),
            )
        } else {
            navigationRef?.dispatch(
                CommonActions.navigate(action.screen, action.params),
            )
        }
        return true
    } catch (error) {
        log.error('Navigation dispatch error:', error)
        return false
    }
}

/**
 * Direct handler without queue logic (for processing queued items)
 */
const handleInternalDeepLinkDirect = (u: string): boolean => {
    const startTime = Date.now()
    log.info('handleInternalDeepLinkDirect START', {
        url: u,
        timestamp: startTime,
    })

    if (!navigationRef || !navigationRef.isReady()) {
        log.warn('handleInternalDeepLinkDirect: navigation not ready')
        return false
    }

    const parsed = parseDeepLink(u, validScreens)

    log.info('Parsed deep link:', {
        original: u,
        parsed: {
            screen: parsed.screen,
            id: parsed.id,
            isValid: parsed.isValid,
            fediUrl: parsed.fediUrl,
        },
    })

    if (!parsed.isValid) {
        log.warn('Invalid deep link:', parsed)
        return false
    }

    // Create navigation action
    const action = createNavigationAction(parsed)
    if (!action) {
        log.warn('Could not create navigation action for:', parsed)
        return false
    }

    // Execute navigation
    const dispatchStart = Date.now()
    const success = executeNavigationAction(action)

    log.info('handleInternalDeepLinkDirect END', {
        success,
        screen: parsed.screen,
        id: parsed.id,
        dispatchDuration: Date.now() - dispatchStart,
        totalDuration: Date.now() - startTime,
    })

    return success
}

/**
 * Main entry point - PIN-aware
 */
export const handleInternalDeepLink = (u: string): boolean => {
    const startTime = Date.now()
    log.info('handleInternalDeepLink START', {
        url: u,
        timestamp: startTime,
        isNavigationReady,
        isPinReady: pinAwareQueue.getIsReady(),
        hasNavigationRef: !!navigationRef,
    })

    if (!navigationRef) {
        log.warn('handleInternalDeepLink: no navigationRef, queueing')
        pinAwareQueue.add(u)
        return true
    }

    // Check if both navigation AND PIN are ready
    if (!pinAwareQueue.getIsReady() || !navigationRef.isReady()) {
        log.info('Navigation or PIN not ready, queueing deep link', {
            isNavigationReady,
            isPinReady: pinAwareQueue.getIsReady(),
            navigationReady: navigationRef.isReady(),
        })
        pinAwareQueue.add(u)
        return true
    }

    // If everything is ready, handle directly
    return handleInternalDeepLinkDirect(u)
}

/**
 * Fedi Mod navigation
 */
export const handleFediModNavigation = async (
    shortcut: Shortcut,
    navigation: NavigationProp,
): Promise<void> => {
    const fediMod = shortcut as FediMod
    const { url } = fediMod

    // Check if it's a URL that should be opened externally
    if (
        url.includes('t.me/') ||
        url.includes('wa.me/') ||
        url.includes('app.fedi.xyz')
    ) {
        try {
            await Linking.openURL(url)
        } catch (error) {
            log.error('Failed to open external URL:', url, error)
            navigation.navigate('FediModBrowser', { url })
        }
    } else if (isFediDeeplinkType(url)) {
        await openURL(url)
    } else {
        navigation.navigate('FediModBrowser', { url })
    }
}

export const openURL = async (u: string): Promise<void> => {
    if (!handleInternalDeepLink(u)) {
        await Linking.openURL(u)
    }
}

/**
 * Parse and validate deep links for React Navigation.
 *
 *
 * Handles both Universal Links (https://app.fedi.xyz/link?screen=user&id=...)
 * and native fedi:// links. The function attempts to handle navigation internally
 * when the navigation system is ready, otherwise returns the link for React Navigation
 * to process later.
 *
 **/
export function parseLink(uri: string, fallback: (u: string) => void): string {
    log.debug('parseLink called with', uri)

    const parsed = parseDeepLink(uri, validScreens)

    // Handle universal links
    if (isUniversalLink(uri)) {
        log.debug('parseLink: processing universal link')

        if (!parsed.isValid || !parsed.fediUrl) {
            log.warn('parseLink: invalid universal link', parsed)
            return ''
        }

        log.info('parseLink: converted universal link', {
            original: uri,
            converted: parsed.fediUrl,
        })

        // Check if PIN-aware queue is ready before trying to handle manually
        if (
            isNavigationReady &&
            navigationRef?.isReady() &&
            pinAwareQueue.getIsReady()
        ) {
            log.info('parseLink: navigation and PIN ready, handling internally')
            if (handleInternalDeepLink(parsed.fediUrl)) {
                log.info(
                    'parseLink: successfully handled via handleInternalDeepLink',
                )
                return ''
            } else {
                log.warn(
                    'parseLink: handleInternalDeepLink failed, returning deep link for React Navigation',
                )
                return parsed.fediUrl
            }
        } else {
            log.info(
                'parseLink: navigation or PIN not ready, returning deep link for React Navigation to handle',
            )
            return parsed.fediUrl
        }
    }

    // Handle native fedi:// links
    if (uri.startsWith('fedi://')) {
        if (!parsed.isValid) {
            log.warn('parseLink: invalid fedi link', parsed)
            fallback(uri)
            return ''
        }

        // Check if PIN-aware queue is ready
        if (
            isNavigationReady &&
            navigationRef?.isReady() &&
            pinAwareQueue.getIsReady()
        ) {
            log.info(
                'parseLink: navigation and PIN ready, handling fedi:// link internally',
            )
            const linkToHandle = parsed.fediUrl || uri
            if (handleInternalDeepLink(linkToHandle)) {
                log.info(
                    'parseLink: successfully handled fedi:// link via handleInternalDeepLink',
                )
                return '' // Return empty so React Navigation doesn't try to handle it
            } else {
                log.warn(
                    'parseLink: handleInternalDeepLink failed for fedi:// link, returning for React Navigation',
                )
                return linkToHandle // Let React Navigation try to handle it
            }
        } else {
            log.info(
                'parseLink: navigation or PIN not ready, returning fedi:// link for React Navigation',
            )
            return parsed.fediUrl || uri // Let React Navigation handle it
        }
    }

    // Everything else goes to fallback
    log.debug('parseLink: not a recognized link format, calling fallback')
    fallback(uri)
    return ''
}

/**
 * Generates React Navigation linking configuration for the App Navigator.
 *
 * This configuration handles deep links from multiple sources:
 * - `getInitialURL`: Processes links that open the app from a closed state, including
 *   initial URLs and notification links. Queues deep links for later processing when
 *   navigation isn't ready.
 * - `subscribe`: Handles links received while the app is in the foreground, including
 *   URL events and notification presses. Attempts immediate handling when navigation
 *   is ready, with fallback to React Navigation.
 *
 * @param fallback Function called when a link is not a valid deep link
 */
export const getLinkingConfig = (
    fallback: (url: string) => void,
): NavigationLinkingConfig => ({
    prefixes: [
        'fedi://',
        'fedi:',
        'lightning:',
        'lnurl:',
        'bitcoin:',
        'lnurlw://',
        'lnurlp://',
        'keyauth://',
    ],
    config: deepLinksConfig,

    getInitialURL: async () => {
        try {
            const url = await Linking.getInitialURL()
            if (url != null) {
                log.info('getInitialURL found URL:', url)

                if (isUniversalLink(url) || url.startsWith('fedi://')) {
                    log.info(
                        'getInitialURL: queueing deep link for later processing',
                    )
                    pinAwareQueue.add(url)
                    return null // Don't let React Navigation handle it
                }

                return parseLink(url, fallback)
            }

            const notif = await notifee.getInitialNotification()
            const link = notif?.notification?.data?.link
            if (typeof link === 'string') {
                log.info('getInitialURL found notification link:', link)

                if (isUniversalLink(link) || link.startsWith('fedi://')) {
                    log.info(
                        'getInitialURL: queueing notification link for later processing',
                    )
                    pinAwareQueue.add(link)
                    return null
                }

                return parseLink(link, fallback)
            }

            return null
        } catch (error) {
            log.error('getInitialURL error:', error)
            return null
        }
    },
    // Subscribe to future links that bring the app to the foreground.
    subscribe: listener => {
        const subscription = Linking.addEventListener(
            'url',
            async ({ url }) => {
                log.info('URL received via addEventListener:', url)

                try {
                    await zendeskCloseMessagingView()

                    // For foreground links, try immediate handling if everything is ready
                    if (
                        isNavigationReady &&
                        navigationRef?.isReady() &&
                        pinAwareQueue.getIsReady()
                    ) {
                        if (isUniversalLink(url) || url.startsWith('fedi://')) {
                            log.info(
                                'addEventListener: everything ready, trying direct handling',
                            )
                            const handled = handleInternalDeepLink(url)
                            if (handled) {
                                log.info(
                                    'addEventListener: successfully handled internally',
                                )
                                return // Don't call listener
                            }
                            log.warn(
                                'addEventListener: direct handling failed, falling back to React Navigation',
                            )
                        }
                    }

                    const link = parseLink(url, fallback)
                    if (link) {
                        log.info('Parsed link, notifying listener:', link)
                        listener(link)
                    } else {
                        log.warn('Link parsing failed or returned empty')
                    }
                } catch (error) {
                    log.error('URL handling error:', error)
                }
            },
        )

        const unsubscribe = notifee.onForegroundEvent(async e => {
            if (e.type !== EventType.PRESS) return

            try {
                if (await isZendeskNotification(e.detail?.notification?.data)) {
                    log.info('Zendesk foreground notification pressed')
                    await launchZendeskSupport(err =>
                        log.error('Zendesk error:', err),
                    )
                    return
                }

                const uri = e.detail?.notification?.data?.link
                if (typeof uri !== 'string') {
                    log.warn('Notification lacks "link" field:', e.detail)
                    return
                }

                // Same logic for notifications
                if (
                    isNavigationReady &&
                    navigationRef?.isReady() &&
                    pinAwareQueue.getIsReady()
                ) {
                    if (isUniversalLink(uri) || uri.startsWith('fedi://')) {
                        log.info(
                            'notification: everything ready, trying direct handling',
                        )
                        const handled = handleInternalDeepLink(uri)
                        if (handled) {
                            log.info(
                                'notification: successfully handled internally',
                            )
                            return
                        }
                        log.warn(
                            'notification: direct handling failed, falling back to React Navigation',
                        )
                    }
                }

                const link = parseLink(uri, fallback)
                if (link) {
                    log.info(
                        'Notification link parsed, notifying listener:',
                        link,
                    )
                    listener(link)
                } else {
                    log.warn('Notification link parsing failed:', uri)
                }
            } catch (error) {
                log.error('Notification handling error:', error)
            }
        })

        return () => {
            subscription.remove()
            unsubscribe()
        }
    },
})
