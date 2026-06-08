import {
    DEEPLINK_HOSTS,
    FEDI_PREFIX,
    LINK_PATH,
    TELEGRAM_BASE_URL,
    WHATSAPP_BASE_URL,
} from '@fedi/common/constants/linking'

type NormalizedDeepLink = {
    fediUri: string
    screen: string
    params: URLSearchParams
}

const SCREEN_PARAM = 'screen'

// Converts a deep link to a fedi internal link format
// e.g. /link?screen=chat&roomId=123 -> { fediUri: '/chat?roomId=123', screen: 'chat', roomId: '123' }
// handles # delimiters too
export function normalizeDeepLink(
    urlString: string,
): NormalizedDeepLink | undefined {
    try {
        const url = new URL(urlString)

        let paramsSource = url.search
        if (!paramsSource && url.hash) {
            paramsSource = url.hash.replace(/^#/, '')
        }

        const searchParams = new URLSearchParams(paramsSource)

        const screen = searchParams.get(SCREEN_PARAM)
        if (!screen) return undefined

        const params = new URLSearchParams()
        searchParams.forEach((value, key) => {
            if (key !== SCREEN_PARAM) {
                params.append(key, value)
            }
        })

        const queryString = params.toString()

        return {
            fediUri: queryString
                ? `${FEDI_PREFIX}${screen}?${queryString}`
                : `${FEDI_PREFIX}${screen}`,
            screen,
            params,
        }
    } catch (err) {
        return undefined
    }
}

// Urls are considered deeplinks if they have a pathname of "link",
// a screen param,
// is one of our supported hostnames
// Supports both ? and # delimiters
export function isDeepLink(url: string): boolean {
    try {
        const parsed = new URL(url)
        const { hostname, pathname } = parsed

        if (!DEEPLINK_HOSTS.includes(hostname)) return false
        if (pathname !== LINK_PATH) return false

        let paramsSource = parsed.search
        if (!paramsSource && parsed.hash) {
            paramsSource = parsed.hash.replace(/^#/, '')
        }

        const searchParams = new URLSearchParams(paramsSource)
        const screen = searchParams.get('screen')

        return !!screen
    } catch {
        return false
    }
}

/**
 * Check if a FediMod URL should be handled by the linking system
 * (telegram/whatsapp or a universal deeplink) instead of the mini apps browser.
 */
export const isFediDeeplinkType = (url: string): boolean =>
    url.includes(TELEGRAM_BASE_URL) ||
    url.includes(WHATSAPP_BASE_URL) ||
    isDeepLink(url)

/**
 * Check if a URL is a Fedi internal link type e.g. fedi://chat
 */
export const isFediInternalLink = (url: string): boolean => {
    if (!url) return false
    return url.toLowerCase().startsWith('fedi:')
}

export const getNavigationLink = (url: string): string | undefined => {
    if (isDeepLink(url)) {
        return normalizeDeepLink(url)?.fediUri
    }

    if (isFediInternalLink(url)) {
        return url
    }

    return undefined
}

// Aligns bare browser deeplinks with the in-app address bar behavior.
export const normalizeBrowserUrl = (raw: string): string => {
    return /^https?:\/\//.test(raw) ? raw : `https://${raw}`
}

/**
 * Ensure a community invite code has the `fedi:` prefix required by the
 * backend. Codes arriving from deeplinks may have the prefix stripped.
 */
export const normalizeCommunityInviteCode = (code: string): string => {
    if (code.toLowerCase().startsWith('fedi:')) return code
    if (code.toLowerCase().startsWith('community')) return `fedi:${code}`
    return code
}

/**
 * Strip the `fedi:` prefix so that universal/share links stay short and
 * avoid iOS link-hijacking issues with colons. Currently only community
 * invite codes use this prefix, but consider this utility whenever
 * adding fedi:-prefixed codes to universal links.
 */
export const stripFediPrefix = (code: string): string => {
    if (code.toLowerCase().startsWith('fedi:')) return code.slice(5)
    return code
}

export interface DeepLinkParam {
    name: string
    label: string
}

// Drives DeepLinkConfig.screen and native's screenMap; drift also asserted at test time.
export const DEEP_LINK_SCREENS = [
    'wallet',
    'home',
    'chat',
    'mods',
    'browser',
    'ecash',
    'join',
    'join-then-ecash',
    'join-then-browse',
    'room',
    'user',
    'share-logs',
] as const

export type DeepLinkableScreen = (typeof DEEP_LINK_SCREENS)[number]

export interface DeepLinkConfig {
    key: string
    label: string
    description: string
    screen: DeepLinkableScreen
    params: DeepLinkParam[]
}

// User-facing metadata only — handlers live in native `screenMap` and web `getDeepLinkPath`.
export const DEEP_LINKS = [
    {
        key: 'join-federation',
        label: 'Join Wallet Service',
        description:
            'Shows a wallet service preview and prompts the user to join. If they are already a member, an already-joined message appears.',
        screen: 'join',
        params: [{ name: 'invite', label: 'Invite Code' }],
    },
    {
        key: 'join-community',
        label: 'Join Community',
        description:
            'Shows a community preview and prompts the user to join. If they are already a member, an already-joined message appears.',
        screen: 'join',
        params: [{ name: 'invite', label: 'Invite Code' }],
    },
    {
        key: 'ecash',
        label: 'Claim Ecash',
        description:
            'Opens the Claim Ecash screen. If the issuing wallet service is not yet joined, the user joins it automatically on claim.',
        screen: 'ecash',
        params: [{ name: 'id', label: 'Ecash Token' }],
    },
    {
        key: 'join-federation-then-ecash',
        label: 'Join Wallet Service + Claim Ecash',
        description:
            'Joins the wallet service, then takes the user to claim ecash. The join step is skipped if they are already a member.',
        screen: 'join-then-ecash',
        params: [
            { name: 'invite', label: 'Invite Code' },
            { name: 'ecash', label: 'Ecash Token' },
        ],
    },
    {
        key: 'join-community-then-ecash',
        label: 'Join Community + Claim Ecash',
        description:
            'Joins the community, then takes the user to claim ecash. The join step is skipped if they are already a member.',
        screen: 'join-then-ecash',
        params: [
            { name: 'invite', label: 'Invite Code' },
            { name: 'ecash', label: 'Ecash Token' },
        ],
    },
    {
        key: 'join-federation-then-browse',
        label: 'Join Wallet Service + Open Mini App',
        description:
            'Joins the wallet service, then opens a URL in the Mini Apps browser. The join step is skipped if they are already a member.',
        screen: 'join-then-browse',
        params: [
            { name: 'invite', label: 'Invite Code' },
            { name: 'url', label: 'URL' },
        ],
    },
    {
        key: 'join-community-then-browse',
        label: 'Join Community + Open Mini App',
        description:
            'Joins the community, then opens a URL in the Mini Apps browser. The join step is skipped if they are already a member.',
        screen: 'join-then-browse',
        params: [
            { name: 'invite', label: 'Invite Code' },
            { name: 'url', label: 'URL' },
        ],
    },
    {
        key: 'browser',
        label: 'Open Mini App',
        description: 'Opens a URL in the in-app Mini Apps browser.',
        screen: 'browser',
        params: [{ name: 'url', label: 'URL' }],
    },
    {
        key: 'home',
        label: 'Community Tab',
        description: 'Opens the Community tab.',
        screen: 'home',
        params: [],
    },
    {
        key: 'chat',
        label: 'Chat Tab',
        description: 'Opens the Chat tab.',
        screen: 'chat',
        params: [],
    },
    {
        key: 'wallet',
        label: 'Wallet Tab',
        description: 'Opens the Wallet tab.',
        screen: 'wallet',
        params: [],
    },
    {
        key: 'mods',
        label: 'Mini Apps Tab',
        description: 'Opens the Mini Apps tab.',
        screen: 'mods',
        params: [],
    },
    {
        key: 'room',
        label: 'Chat Room',
        description: 'Opens a specific chat room.',
        screen: 'room',
        params: [{ name: 'roomId', label: 'Room ID' }],
    },
    {
        key: 'user',
        label: 'Direct Message',
        description:
            'Opens a direct message conversation with a specific user.',
        screen: 'user',
        params: [{ name: 'userId', label: 'User ID' }],
    },
    {
        key: 'share-logs',
        label: 'Share Logs',
        description:
            'Opens the Share Logs form, pre-filled with a support ticket number when provided.',
        screen: 'share-logs',
        params: [{ name: 'ticketNumber', label: 'Ticket Number' }],
    },
] as const satisfies readonly DeepLinkConfig[]

export type DeepLinkKey = (typeof DEEP_LINKS)[number]['key']
