import { err, ok, Result } from 'neverthrow'

import {
    DEEPLINK_HOSTS,
    LINK_PATH,
    TELEGRAM_BASE_URL,
    WHATSAPP_BASE_URL,
} from '@fedi/common/constants/linking'

import { ParsedDeepLink, ScreenConfig } from '../types/linking'
import { makeLog } from './log'
import { constructUrl, ensureNonNullish } from './neverthrow'

const log = makeLog('common/utils/linking')

/** True if host equals one of our Universal-Link hosts (with or without www). */
export const hostMatches = (h: string): boolean =>
    DEEPLINK_HOSTS.some(host => h === host || h === `www.${host}`)

export function isUniversalLink(raw: string): boolean {
    return constructUrl(raw).match(
        ({ host, pathname, search, hash }) => {
            const normalised = pathname.endsWith('/')
                ? pathname.slice(0, -1)
                : pathname

            // Check if it's our host and path
            if (!hostMatches(host) || normalised !== LINK_PATH) {
                return false
            }

            // Valid if it has either query params OR hash params with screen
            if (search.includes('screen=')) {
                return true
            }

            if (hash && hash.includes('screen=')) {
                return true
            }

            return false
        },
        () => false,
    )
}

/**
 * Convert a Universal Link to the deep-link format the rest of the app expects.
 * Returns '' when the input is not valid.
 *
 * Handles both:
 *   https://app.fedi.xyz/link?screen=user&id=%40npub…  →  fedi://user/@npub…
 *   https://app.fedi.xyz/link#screen=user&id=%40npub…  →  fedi://user/@npub…
 */
export function universalToFedi(raw: string): string {
    if (!isUniversalLink(raw)) return ''

    return constructUrl(raw)
        .andThen(url => {
            let screen: string | null = null
            let idParam: string | null = null

            // First check standard query params (?screen=...)
            if (url.searchParams.has('screen')) {
                screen = url.searchParams.get('screen')
                idParam = url.searchParams.get('id')
            }
            // If not found, check hash fragment (#screen=...)
            else if (url.hash && url.hash.length > 1) {
                const hashParams = new URLSearchParams(url.hash.substring(1))
                screen = hashParams.get('screen')
                idParam = hashParams.get('id')
            }

            if (!screen) {
                return err(new Error('Missing required screen parameter'))
            }

            if (idParam) {
                // Strip out any http(s):// from the id param value
                // This will be restored in createNavigationAction() where needed
                idParam = idParam.replace(/^https?:\/\//, '')
            }

            return ok({ screen, idParam: idParam || '' })
        })
        .match(
            ({ screen, idParam }) => {
                if (idParam) {
                    const decodedId = decodeURIComponent(idParam)
                    return joinFediPath(screen, decodedId)
                } else {
                    return joinFediPath(screen)
                }
            },
            () => '',
        )
}

/**
 * Optional helper: normalise percent-encoding on **native** fedi:// links
 */
export function decodeFediDeepLink(uri: string): string {
    return constructUrl(uri).match(
        url => {
            if (url.protocol !== 'fedi:') return uri

            const paths = url.pathname
                .split('/')
                .filter(Boolean)
                .map(decodeURIComponent)

            return joinFediPath(url.host, paths.join('/'))
        },
        () => uri,
    )
}

/**
 * Extract all valid screen names from a nested screen configuration.
 */
export function getValidScreens(
    screens: Record<string, ScreenConfig | null> | undefined,
): Set<string> {
    const valid = new Set<string>()
    if (!screens) return valid

    for (const value of Object.values(screens)) {
        if (typeof value === 'string') {
            valid.add(value.split('/')[0])
        } else if (typeof value === 'object' && value !== null) {
            if (value.path) {
                valid.add(value.path.split('/')[0])
            }
            getValidScreens(value.screens).forEach(s => valid.add(s))
        }
    }
    return valid
}

/**
 * Parse any deep link (universal or fedi://) into its components.
 */
export function parseDeepLink(
    uri: string,
    validScreens: Set<string>,
): ParsedDeepLink {
    const result: ParsedDeepLink = {
        screen: '',
        isValid: false,
        originalUrl: uri,
    }

    let deepLink = uri

    // Convert universal links to fedi:// format
    if (isUniversalLink(uri)) {
        deepLink = universalToFedi(uri)
        if (!deepLink) {
            return result
        }
        result.fediUrl = deepLink
    }

    // Decode fedi:// links
    if (isFediUri(deepLink)) {
        deepLink = decodeFediDeepLink(deepLink)
        result.fediUrl = deepLink
    }

    // Must be fedi:// at this point
    if (!isFediUri(deepLink)) {
        return result
    }

    // Extract screen and ID using utility
    const { screen, id } = parseFediPath(deepLink)

    result.screen = screen
    result.id = id
    result.isValid = validScreens.has(screen)

    return result
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
 * Handler function type for processing deep links
 */
type DeepLinkHandler = (url: string) => boolean

/**
 * Global handler that native layer will set
 */
let deepLinkHandler: DeepLinkHandler | null = null

/**
 * Set the handler function that will process deep links
 * This should be called by the native layer during initialization
 */
export const setDeepLinkHandler = (handler: DeepLinkHandler): void => {
    deepLinkHandler = handler
    log.info('Deep link handler set')
}

/**
 * Process pending deep links using the registered handler
 */
const processPendingDeepLinks = (pendingLinks: string[]) => {
    if (pendingLinks.length === 0) return
    log.info(`Processing ${pendingLinks.length} pending deep links`)

    pendingLinks.forEach(link => {
        log.info('Processing pending link:', link)
        if (deepLinkHandler) {
            const handled = deepLinkHandler(link)
            if (!handled) log.warn('Failed to handle pending link:', link)
        } else {
            log.warn('No deep link handler set for:', link)
        }
    })
}

/**
 * PIN-aware deep link queue that respects both navigation and PIN state
 */
export class PinAwareDeepLinkQueue {
    private queue: string[] = []
    private isNavigationReady = false
    private isAppUnlocked = false

    add(url: string): void {
        if (!this.queue.includes(url)) {
            this.queue.push(url)
            log.info('Deep link queued:', url)
        }
    }

    setNavigationReady(): void {
        this.isNavigationReady = true
        log.info('Navigation ready state set:', this.isNavigationReady)
        this.processQueueIfReady()
    }

    setAppUnlocked(unlocked: boolean): void {
        this.isAppUnlocked = unlocked
        log.info('App unlock state set:', unlocked)
        this.processQueueIfReady()
    }

    getIsReady(): boolean {
        return this.isNavigationReady && this.isAppUnlocked
    }

    private processQueueIfReady(): void {
        if (this.getIsReady() && this.queue.length > 0) {
            log.info('Both navigation and PIN ready, processing queue')
            // Process queue when both navigation and PIN are ready
            const pendingLinks = this.flush()
            processPendingDeepLinks(pendingLinks)
        }
    }

    flush(): string[] {
        const links = [...this.queue]
        this.queue = []
        log.info('Queue flushed, returning links:', links)
        return links
    }

    size(): number {
        return this.queue.length
    }

    clear(): void {
        this.queue = []
        log.info('Queue cleared')
    }
}

const FEDI_PROTOCOL = 'fedi://'

/**
 * Check if a URI starts with the fedi:// protocol
 */
export const isFediUri = (uri: string): boolean => uri.startsWith(FEDI_PROTOCOL)

/**
 * Remove the fedi:// prefix from a URI
 * Returns the path part without the protocol
 *
 * @example
 * stripFediPrefix('fedi://user/123') → 'user/123'
 */
export const stripFediPrefix = (uri: string): string => {
    if (!isFediUri(uri)) return uri
    return uri.substring(FEDI_PROTOCOL.length)
}

/**
 * Add the fedi:// prefix to a path
 *
 * @example
 * prefixFediUri('user/123') → 'fedi://user/123'
 */
export const prefixFediUri = (path: string): string => {
    if (isFediUri(path)) return path
    return `${FEDI_PROTOCOL}${path}`
}

/**
 * Parse a fedi:// URI into its screen and ID components
 *
 * @example
 * parseFediPath('fedi://user/123/sub') → { screen: 'user', id: '123/sub' }
 * parseFediPath('fedi://user') → { screen: 'user', id: undefined }
 */
export const parseFediPath = (uri: string): { screen: string; id?: string } => {
    const pathPart = stripFediPrefix(uri)
    const [screen, ...restParts] = pathPart.split('/')

    // Decode each segment so things like %3A → ":"
    const decodedParts = restParts.map(p => {
        try {
            return decodeURIComponent(p)
        } catch {
            return p
        }
    })

    const id = decodedParts.length > 0 ? decodedParts.join('/') : undefined
    return { screen, id }
}

/**
 * Join screen and ID into a fedi:// URI
 *
 * @example
 * joinFediPath('user', '123') → 'fedi://user/123'
 * joinFediPath('user') → 'fedi://user'
 */
export const joinFediPath = (screen: string, id?: string): string => {
    const path = id ? `${screen}/${id}` : screen
    return prefixFediUri(path)
}

/**
 * Safely parse a fedi:// URI using Result for error handling
 * Returns screen and ID components or an error if invalid
 */
export const parseFediUri = (
    uri: string,
): Result<{ screen: string; id?: string }, Error> => {
    if (!isFediUri(uri)) {
        return err(new Error(`URI does not start with ${FEDI_PROTOCOL}`))
    }

    const { screen, id } = parseFediPath(uri)

    return ensureNonNullish(screen)
        .map(() => ({ screen, id }))
        .mapErr(() => new Error('Invalid fedi URI: missing screen'))
}
