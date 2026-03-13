import {
    DEEPLINK_HOSTS,
    LINK_PATH,
    TELEGRAM_BASE_URL,
    WHATSAPP_BASE_URL,
} from '@fedi/common/constants/linking'

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
