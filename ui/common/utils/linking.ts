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
 * Check if a URL is a FediMod deep link type that should be handled specially.
 */
export const isFediDeeplinkType = (url: string): boolean =>
    url.includes(TELEGRAM_BASE_URL) ||
    url.includes(WHATSAPP_BASE_URL) ||
    DEEPLINK_HOSTS.some(
        h => url.includes(`https://${h}`) || url.includes(`https://www.${h}`),
    )

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
