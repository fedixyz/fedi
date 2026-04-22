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
    getNavigationLink,
    isFediInternalLink,
    normalizeCommunityInviteCode,
} from '@fedi/common/utils/linking'
import { makeLog } from '@fedi/common/utils/log'

import { reset, resetToHomeWithScreen } from '../state/navigation'
import type { AppDispatch } from '../state/store'
import {
    NavigationArgs,
    RootStackParamList,
    TabsNavigatorParamList,
    TypedRoute,
} from '../types/navigation'
import { isZendeskNotification } from './notifications'
import { launchZendeskSupport, zendeskCloseMessagingView } from './support'

const log = makeLog('utils/linking')

type RootState = NavigationState<RootStackParamList>
type TypedInitialState = PartialState<RootState>
type RootScreen = Exclude<keyof RootStackParamList, 'TabsNavigator'>
type TabScreen = keyof TabsNavigatorParamList
type InternalLinkTarget =
    | {
          kind: 'root'
          screen: RootScreen
          params?: Record<string, string>
      }
    | {
          kind: 'tab'
          screen: TabScreen
          params?: Record<string, string>
      }
type NavigationLinkReadinessResult =
    // for payment URIs (lightning:, bitcoin:, ...) — handled by the omni parser
    | { kind: 'external'; url: string }
    // for Fedi navigation links (fedi:) — handled by React Navigation
    | { kind: 'ready'; navigationLink: string }
    // when URLs are processed but stashed to be replayed after onboarding and/or PIN unlock
    | { kind: 'handled' }

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
let pendingUnlockNavigationArgs: NavigationArgs | undefined
let pendingUnlockExternalUrl: string | undefined

const rootScreenPaths: Partial<Record<RootScreen, string>> = {
    ChatRoomConversation: 'room/:roomId',
    ChatUserConversation: 'user/:userId',
    ShareLogs: 'share-logs/:ticketNumber',
    ClaimEcash: 'ecash/:id',
    JoinFederation: 'join/:invite',
    FediModBrowser: 'browser/:url',
}

const deepLinksConfig: NonNullable<
    LinkingOptions<RootStackParamList>['config']
> = {
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
        ...rootScreenPaths,
    },
}

// Mapping used to convert path names to screens
export const screenMap: Record<
    string,
    (params: Record<string, string>) => InternalLinkTarget | undefined
> = {
    wallet: () => ({ kind: 'tab', screen: 'Wallet' }),
    // 'federations' is for backwards compatibility (can be removed at a later date)
    federations: () => ({ kind: 'tab', screen: 'Wallet' }),
    home: () => ({ kind: 'tab', screen: 'Home' }),
    chat: () => ({ kind: 'tab', screen: 'Chat' }),
    miniapps: () => ({ kind: 'tab', screen: 'Mods' }),
    // 'mods' is for backwards compatibility (can be removed at a later date)
    mods: () => ({ kind: 'tab', screen: 'Mods' }),
    user: (params: Record<string, string>) => {
        const userId = params?.userId ?? params?.id
        if (userId)
            return {
                kind: 'root',
                screen: 'ChatUserConversation',
                params: { userId },
            }
        return undefined
    },
    room: (params: Record<string, string>) => {
        const roomId = params?.roomId ?? params?.id
        if (roomId)
            return {
                kind: 'root',
                screen: 'ChatRoomConversation',
                params: { roomId },
            }
        return undefined
    },
    browser: (params: Record<string, string>) => {
        const raw = params?.url ?? params?.id
        if (!raw) return { kind: 'root', screen: 'FediModBrowser' }
        // Ensure bare domains get https:// prefix, matching AddressBarOverlay behavior
        const url = normalizeBrowserUrl(raw)
        return { kind: 'root', screen: 'FediModBrowser', params: { url } }
    },
    ecash: () => ({ kind: 'root', screen: 'ClaimEcash' }),
    join: (params: Record<string, string>) => {
        const invite = params?.invite ?? params?.id
        if (invite)
            return {
                kind: 'root',
                screen: 'JoinFederation',
                params: { invite: normalizeCommunityInviteCode(invite) },
            }
        return { kind: 'root', screen: 'JoinFederation' }
    },
    'share-logs': () => ({ kind: 'root', screen: 'ShareLogs' }),
    'join-then-ecash': (params: Record<string, string>) => {
        const { invite, ecash } = params
        if (!invite || !ecash) return undefined
        return {
            kind: 'root',
            screen: 'JoinFederation',
            params: {
                invite: normalizeCommunityInviteCode(invite),
                afterJoinEcash: ecash,
            },
        }
    },
    'join-then-browse': (params: Record<string, string>) => {
        const { invite, url: raw } = params
        if (!invite || !raw) return undefined
        const url = normalizeBrowserUrl(raw)
        return {
            kind: 'root',
            screen: 'JoinFederation',
            params: {
                invite: normalizeCommunityInviteCode(invite),
                afterJoinUrl: url,
            },
        }
    },
}

type ScreenKey = keyof typeof screenMap

function stripSupportedPrefix(path: string): string {
    return SUPPORTED_PREFIXES.reduce((acc, prefix) => {
        return acc.startsWith(prefix) ? acc.slice(prefix.length) : acc
    }, path)
}

// Aligns bare browser deeplinks with the in-app address bar behavior.
function normalizeBrowserUrl(raw: string): string {
    return /^https?:\/\//.test(raw) ? raw : `https://${raw}`
}

// Decodes percent-encoded path params while tolerating malformed input.
function decodePathParam(value: string): string {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

// Applies per-screen param normalization after a deeplink target is resolved.
function normalizeTarget(target: InternalLinkTarget): InternalLinkTarget {
    if (target.screen === 'FediModBrowser' && target.params?.url) {
        return {
            ...target,
            params: {
                ...target.params,
                url: normalizeBrowserUrl(target.params.url),
            },
        }
    }

    if (target.screen === 'JoinFederation' && target.params?.invite) {
        return {
            ...target,
            params: {
                ...target.params,
                invite: normalizeCommunityInviteCode(target.params.invite),
            },
        }
    }

    return target
}

// Allows browser deeplinks to treat everything after `browser/` as the URL payload.
function getBrowserPathTarget(path: string): InternalLinkTarget | undefined {
    if (!path.startsWith('browser/')) return undefined

    const rawUrl = decodePathParam(path.slice('browser/'.length))
    if (!rawUrl) return undefined

    return normalizeTarget({
        kind: 'root',
        screen: 'FediModBrowser',
        params: { url: rawUrl },
    })
}

// Distinguishes unknown internal paths from known routes with missing params.
function isKnownInternalPath(path: string): boolean {
    const normalizedPath = stripSupportedPrefix(path)
    const [rawScreen] = normalizedPath.split('?')

    if (!rawScreen) return false
    if (rawScreen.startsWith('browser/')) return true

    const [screenName] = rawScreen.split('/')
    return screenName in screenMap
}

// Resolves simple `screen/:param` root routes from the shared route config.
function getConfigPathTarget(path: string): InternalLinkTarget | undefined {
    for (const [screen, pattern] of Object.entries(rootScreenPaths)) {
        if (!pattern) continue

        const [patternBase, patternParam] = pattern.split('/:')
        if (!patternBase || !patternParam) continue
        if (!path.startsWith(`${patternBase}/`)) continue

        const value = decodePathParam(path.slice(patternBase.length + 1))
        if (!value || value.includes('/')) continue

        return normalizeTarget({
            kind: 'root',
            screen: screen as RootScreen,
            params: { [patternParam]: value },
        })
    }

    return undefined
}

export function consumePendingUnlockNavigationArgs():
    | NavigationArgs
    | undefined {
    const navigationArgs = pendingUnlockNavigationArgs
    pendingUnlockNavigationArgs = undefined
    return navigationArgs
}

export function consumePendingUnlockExternalUrl(): string | undefined {
    const url = pendingUnlockExternalUrl
    pendingUnlockExternalUrl = undefined
    return url
}

function dispatchInternalLinkReset(
    navigationRef: NavigationContainerRef<RootStackParamList>,
    uri: string,
) {
    const action = getInternalLinkResetAction(uri)
    if (!action) return

    navigationRef.dispatch(action)
}

export function flushPendingLinks(
    navigationRef: NavigationContainerRef<RootStackParamList>,
) {
    while (pendingLinks.length) {
        const uri = pendingLinks.shift()
        if (!uri) continue
        dispatchInternalLinkReset(navigationRef, uri)
    }
}

export function patchLinkingOpenURL(
    navigationRef: NavigationContainerRef<RootStackParamList>,
) {
    log.info('patching Linking.openURL')

    const originalOpenURL = Linking.openURL.bind(Linking)

    Linking.openURL = async (url: string) => {
        const navigationLink = getNavigationLink(url)

        if (navigationLink) {
            const action = getInternalLinkResetAction(navigationLink)
            if (!action) return

            if (!navigationRef.isReady()) {
                pendingLinks.push(navigationLink)
                return
            }

            return navigationRef.dispatch(action)
        }

        return originalOpenURL(url)
    }
}

// Parses an internal deeplink into the app-level target all other helpers use.
// Unknown fedi: paths intentionally fall back to Wallet.
function getInternalLinkTarget(path: string): InternalLinkTarget | undefined {
    try {
        const normalizedPath = stripSupportedPrefix(path)
        const [rawScreen, queryString] = normalizedPath.split('?')

        if (!rawScreen) return undefined

        const browserPathTarget = getBrowserPathTarget(normalizedPath)
        if (browserPathTarget) return browserPathTarget

        const mapper = screenMap[rawScreen as ScreenKey]
        if (mapper) {
            const queryParams: Record<string, string> = {}
            if (queryString) {
                new URLSearchParams(queryString).forEach((value, key) => {
                    queryParams[key] = value
                })
            }

            const target = mapper(queryParams)
            if (target) {
                return normalizeTarget({
                    ...target,
                    params: target.params ?? queryParams,
                })
            }
        }

        const configTarget = getConfigPathTarget(rawScreen)
        if (configTarget) return normalizeTarget(configTarget)

        if (isFediInternalLink(path) && !isKnownInternalPath(path)) {
            return { kind: 'tab', screen: 'Wallet', params: {} }
        }

        return undefined
    } catch (err) {
        log.error('getInternalLinkTarget: invalid URL', err)
        if (isFediInternalLink(path)) {
            return { kind: 'tab', screen: 'Wallet', params: {} }
        }
        return undefined
    }
}

// Converts the canonical deeplink target into React Navigation's linking state.
// This is the shape expected by getStateFromPath/getInternalLinkRoute.
function targetToInitialState(target: InternalLinkTarget): TypedInitialState {
    if (target.kind === 'tab') {
        return {
            routes: [
                {
                    name: 'TabsNavigator',
                    state: {
                        routes: [
                            {
                                name: target.screen,
                                params: target.params,
                            },
                        ],
                    },
                },
            ],
        }
    }

    return {
        routes: [{ name: target.screen, params: target.params }],
    }
}

// Converts the canonical deeplink target into imperative navigation args.
// Initializing and LockScreen use this when passing destinations around.
function targetToNavigationArgs(target: InternalLinkTarget): NavigationArgs {
    if (target.kind === 'tab') {
        return [
            'TabsNavigator',
            {
                initialRouteName: target.screen,
            },
        ]
    }

    return target.params
        ? ([target.screen, target.params] as NavigationArgs)
        : ([target.screen] as NavigationArgs)
}

// Converts the canonical deeplink target into a reset action with history.
// Root screens use Wallet underneath so back navigation has a target.
function targetToResetAction(target: InternalLinkTarget) {
    if (target.kind === 'tab') {
        return reset('TabsNavigator', {
            initialRouteName: target.screen,
        })
    }

    return resetToHomeWithScreen('Wallet', {
        name: target.screen,
        params: target.params,
    } as TypedRoute)
}

// Converts an imperative destination into a reset action with Wallet underneath
// root screens, matching the internal deeplink reset behavior.
export function navigationArgsToResetAction(
    navigationArgs: NavigationArgs,
): ReturnType<typeof reset> {
    if (navigationArgs[0] === 'TabsNavigator') {
        return reset(navigationArgs[0], navigationArgs[1])
    }

    return resetToHomeWithScreen('Wallet', {
        name: navigationArgs[0],
        params: navigationArgs[1],
    } as TypedRoute)
}

// Parses an internal deeplink into navigation args for the pending unlock flow.
// Storing args avoids reparsing the link after PIN unlock.
export function getInternalLinkNavigationArgs(
    path: string,
): NavigationArgs | undefined {
    const target = getInternalLinkTarget(path)
    if (!target) return undefined

    return targetToNavigationArgs(target)
}

// Parses an internal deeplink into a reset action for post-onboarding routing.
// This keeps Splash from needing to inspect nested navigation state.
export function getInternalLinkResetAction(
    path: string,
): ReturnType<typeof reset> | undefined {
    const target = getInternalLinkTarget(path)
    if (!target) return undefined

    return targetToResetAction(target)
}

// Applies onboarding and PIN gates to incoming URLs before being procssed by React Navigation or the omni parser
// Returns "handled" when routing should be swallowed for now
function getNavigationLinkReadiness(
    url: string,
    onboardingCompleted: boolean,
    getIsAppUnlocked: () => boolean | undefined,
    dispatch: AppDispatch,
): NavigationLinkReadinessResult {
    const navigationLink = getNavigationLink(url)

    // onboarding gate
    // fedi navigation links get stashed in redux to be replayed after onboarding
    if (navigationLink && !onboardingCompleted) {
        pendingUnlockNavigationArgs = undefined
        dispatch(setRedirectTo(url))
        return { kind: 'handled' }
    }

    // pin lock gate
    // both fedi navigation links and payment URIs (lightning:, bitcoin:, ...) get stashed to be replayed after app unlock
    if (getIsAppUnlocked() !== true) {
        if (navigationLink) {
            pendingUnlockNavigationArgs =
                getInternalLinkNavigationArgs(navigationLink)
        } else {
            pendingUnlockExternalUrl = url
        }
        return { kind: 'handled' }
    }

    // if we get this far, we are ready to fully trigger the deeplink
    return navigationLink
        ? { kind: 'ready', navigationLink }
        : { kind: 'external', url }
}

// Handles fedi:// type links (with or without protocol prefix)
export function getInternalLinkRoute(
    path: string,
    options?: Parameters<typeof defaultGetStateFromPath>[1],
): TypedInitialState | undefined {
    const target = getInternalLinkTarget(path)
    if (target) return targetToInitialState(target)
    if (isFediInternalLink(path)) return undefined

    return defaultGetStateFromPath(path, options) as
        | TypedInitialState
        | undefined
}

export const getLinking = (
    onboardingCompleted: boolean,
    getIsAppUnlocked: () => boolean | undefined,
    dispatch: AppDispatch,
    fallback?: (url: string) => void,
): LinkingOptions<RootStackParamList> => ({
    prefixes: SUPPORTED_PREFIXES,

    config: deepLinksConfig,

    getStateFromPath(
        path: string,
        options?: Parameters<typeof defaultGetStateFromPath>[1],
    ): InitialState | undefined {
        return getInternalLinkRoute(path, options)
    },

    // Handle the url that started the app
    getInitialURL: async () => {
        const url = await Linking.getInitialURL()

        if (!url) return null

        const readiness = getNavigationLinkReadiness(
            url,
            onboardingCompleted,
            getIsAppUnlocked,
            dispatch,
        )

        if (readiness.kind === 'ready') return readiness.navigationLink
        // for handling payment URIs (lightning:, bitcoin:, ...)
        if (readiness.kind === 'external' && fallback) {
            fallback(readiness.url)
        }
        return null
    },

    // Handle urls whilst the app is running
    subscribe(listener: (url: string) => void) {
        const handleUrl = (url: string | null) => {
            if (!url) return

            const readiness = getNavigationLinkReadiness(
                url,
                onboardingCompleted,
                getIsAppUnlocked,
                dispatch,
            )

            if (readiness.kind === 'ready') {
                log.info('Received deeplink', url)
                listener(readiness.navigationLink)
                return
            }

            if (readiness.kind === 'handled') {
                return
            }

            // for handling payment URIs (lightning:, bitcoin:, ...)
            if (readiness.kind === 'external') {
                if (fallback) {
                    log.info(
                        'Handling a non-fedi deeplink with fallback function for url:',
                        url,
                    )
                    fallback(url)
                    return
                }

                listener(url)
            }
        }

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
