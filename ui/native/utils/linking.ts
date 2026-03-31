import notifee, { EventType } from '@notifee/react-native'
import {
    LinkingOptions,
    getStateFromPath as defaultGetStateFromPath,
    InitialState,
    NavigationContainerRef,
    NavigationState,
    PartialState,
} from '@react-navigation/native'
import { Linking } from 'react-native'

import { setRedirectTo } from '@fedi/common/redux'
import {
    isDeepLink,
    normalizeCommunityInviteCode,
    normalizeDeepLink,
} from '@fedi/common/utils/linking'
import { makeLog } from '@fedi/common/utils/log'

import type { AppDispatch } from '../state/store'
import { RootStackParamList, TabsNavigatorParamList } from '../types/navigation'
import { isZendeskNotification } from './notifications'
import { launchZendeskSupport, zendeskCloseMessagingView } from './support'

const log = makeLog('utils/linking')

type RootState = NavigationState<RootStackParamList>
type TypedInitialState = PartialState<RootState>
type RootScreen = Exclude<keyof RootStackParamList, 'TabsNavigator'>
type TabScreen = keyof TabsNavigatorParamList
type ScreenResult =
    | { screen: RootScreen; params?: Record<string, string> }
    | {
          screen: TabScreen
          parent: 'TabsNavigator'
          params?: Record<string, string>
      }

const SUPPORTED_PREFIXES = [
    'fedi://',
    'fedi:',
    'lightning:',
    'lnurl:',
    'bitcoin:',
    'lnurlw://',
    'lnurlp://',
    'keyauth://',
]

const pendingLinks: string[] = []

// Mapping used to convert path names to screens
export const screenMap: Record<
    string,
    (params: Record<string, string>) => ScreenResult | undefined
> = {
    home: () => ({ screen: 'Home', parent: 'TabsNavigator' }),
    chat: () => ({ screen: 'Chat', parent: 'TabsNavigator' }),
    user: (params: Record<string, string>) => {
        const userId = params?.userId ?? params?.id
        if (userId)
            return { screen: 'ChatUserConversation', params: { userId } }
        return undefined
    },
    room: (params: Record<string, string>) => {
        const roomId = params?.roomId ?? params?.id
        if (roomId)
            return {
                screen: 'ChatRoomConversation',
                params: { roomId },
            }
        return undefined
    },
    wallet: () => ({ screen: 'Wallet', parent: 'TabsNavigator' }),
    // this is for backwards compatibility
    // TODO: remove legacy /federations deeplink after some time...
    federations: () => ({ screen: 'Wallet', parent: 'TabsNavigator' }),
    browser: (params: Record<string, string>) => {
        const raw = params?.url ?? params?.id
        if (!raw) return { screen: 'FediModBrowser' }
        // Ensure bare domains get https:// prefix, matching AddressBarOverlay behavior
        const url = /^https?:\/\//.test(raw) ? raw : `https://${raw}`
        return { screen: 'FediModBrowser', params: { url } }
    },
    ecash: () => ({ screen: 'ClaimEcash' }),
    join: (params: Record<string, string>) => {
        const invite = params?.invite ?? params?.id
        if (invite)
            return {
                screen: 'JoinFederation',
                params: { invite: normalizeCommunityInviteCode(invite) },
            }
        return { screen: 'JoinFederation' }
    },
    'share-logs': () => ({ screen: 'ShareLogs' }),
}

type ScreenKey = keyof typeof screenMap

function navigateToUri(
    navigationRef: NavigationContainerRef<RootStackParamList>,
    uri: string,
) {
    const route = getInternalLinkRoute(uri)
    if (!route) return

    const currentRoute = navigationRef.getCurrentRoute()
    if (!currentRoute) return

    navigationRef.reset({
        index: 1,
        routes: [
            { name: currentRoute.name, params: currentRoute.params },
            ...route.routes,
        ],
    })
}

export function flushPendingLinks(
    navigationRef: NavigationContainerRef<RootStackParamList>,
) {
    while (pendingLinks.length) {
        const uri = pendingLinks.shift()
        if (!uri) continue
        navigateToUri(navigationRef, uri)
    }
}

export function patchLinkingOpenURL(
    navigationRef: NavigationContainerRef<RootStackParamList>,
) {
    log.info('patching Linking.openURL')

    const originalOpenURL = Linking.openURL.bind(Linking)

    Linking.openURL = async (url: string) => {
        if (isDeepLink(url)) {
            const result = normalizeDeepLink(url)
            if (!result) return

            const route = getInternalLinkRoute(result.fediUri)
            if (!route) return

            if (!navigationRef.isReady()) {
                pendingLinks.push(result.fediUri)
                return
            }

            return navigateToUri(navigationRef, result.fediUri)
        }

        return originalOpenURL(url)
    }
}

// Handles fedi:// type links (with or without protocol prefix)
export function getInternalLinkRoute(
    path: string,
    options?: Parameters<typeof defaultGetStateFromPath>[1],
): TypedInitialState | undefined {
    try {
        // Strip any supported prefix from the path
        const [rawScreen, queryString] = SUPPORTED_PREFIXES.reduce(
            (acc, prefix) => {
                return acc.startsWith(prefix) ? acc.slice(prefix.length) : acc
            },
            path,
        ).split('?')

        if (!rawScreen) {
            return defaultGetStateFromPath(path, options) as
                | TypedInitialState
                | undefined
        }

        const mapper = screenMap[rawScreen as ScreenKey]
        if (!mapper) {
            return defaultGetStateFromPath(path, options) as
                | TypedInitialState
                | undefined
        }

        const queryParams: Record<string, string> = {}
        if (queryString) {
            new URLSearchParams(queryString).forEach((value, key) => {
                queryParams[key] = value
            })
        }

        const map = mapper(queryParams)
        if (!map) return undefined

        const resolvedParams = map.params ?? queryParams

        if ('parent' in map) {
            return {
                routes: [
                    {
                        name: 'TabsNavigator',
                        state: {
                            routes: [
                                { name: map.screen, params: resolvedParams },
                            ],
                        },
                    },
                ],
            }
        }

        return {
            routes: [{ name: map.screen, params: resolvedParams }],
        }
    } catch (err) {
        log.error('getStateFromPath: invalid URL', err)
        return undefined
    }
}

export const getLinking = (
    onboardingCompleted: boolean,
    dispatch: AppDispatch,
): LinkingOptions<RootStackParamList> => ({
    prefixes: SUPPORTED_PREFIXES,

    config: {
        screens: {
            TabsNavigator: {
                // @ts-expect-error: Nested screens are not allowed with the
                // current TabsNavigator param type ({ initialRouteName }),
                // but we need it here for deep linking to individual tabs
                // while preserving initialRouteName usage in RootStackParamList
                screens: {
                    Wallet: 'wallet',
                    Chat: 'chat',
                    Mods: 'mods',
                    Home: 'home',
                },
            },
            ChatRoomConversation: 'room/:roomId',
            ChatUserConversation: 'user/:userId',
            ShareLogs: 'share-logs/:ticketNumber',
            ClaimEcash: 'ecash/:id',
            JoinFederation: 'join/:invite',
            FediModBrowser: 'browser/:url',
        },
    },

    getStateFromPath(
        path: string,
        options?: Parameters<typeof defaultGetStateFromPath>[1],
    ): InitialState | undefined {
        return getInternalLinkRoute(path, options)
    },

    subscribe(listener: (url: string) => void) {
        const handleUrl = (url: string | null) => {
            if (!url) return

            if (isDeepLink(url)) {
                log.info('Received deeplink', url)

                if (!onboardingCompleted) {
                    dispatch(setRedirectTo(url))
                    return
                }

                const result = normalizeDeepLink(url)
                if (!result) return

                listener(result.fediUri)
                return
            }

            listener(url)
        }

        Linking.getInitialURL()
            .then(handleUrl)
            .catch(err => log.error(err))

        notifee
            .getInitialNotification()
            .then(notif => {
                const link = notif?.notification?.data?.link
                if (typeof link === 'string') handleUrl(link)
            })
            .catch(err => log.error(err))

        const subscription = Linking.addEventListener(
            'url',
            async ({ url }) => {
                await zendeskCloseMessagingView()
                handleUrl(url)
            },
        )

        const unsubscribeNotifee = notifee.onForegroundEvent(async e => {
            if (e.type !== EventType.PRESS) return

            if (await isZendeskNotification(e.detail?.notification?.data)) {
                await launchZendeskSupport(err =>
                    log.error('Zendesk error:', err),
                )
                return
            }

            const uri = e.detail?.notification?.data?.link
            if (typeof uri === 'string') handleUrl(uri)
        })

        return () => {
            subscription.remove()
            unsubscribeNotifee()
        }
    },
})
