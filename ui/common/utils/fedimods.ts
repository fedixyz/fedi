import { makeLog } from './log'

const log = makeLog('common/utils/fedimods')

const parseHtmlForIcon = async (
    html: string,
    urlOrigin: string,
): Promise<string> => {
    // Match all <link> tags
    const linkTagRegex = /<link[^>]*>/g
    const linkTags = html.match(linkTagRegex) || []

    // Define the rel values we're interested in, in priority order
    const relValues = ['apple-touch-icon', 'icon', 'shortcut icon']

    for (const rel of relValues) {
        for (const tag of linkTags) {
            const relMatch = tag.match(new RegExp(`rel="${rel}"`))
            const hrefMatch = tag.match(/href="([^"]*)"/)

            if (relMatch && hrefMatch) {
                let linkedIconUrl = new URL(hrefMatch[1], urlOrigin).href
                linkedIconUrl = linkedIconUrl.replace(/\/+$/, '') // Trim trailing slashes

                const linkedIconResponse = await fetch(linkedIconUrl)
                if (linkedIconResponse.ok) {
                    return linkedIconUrl
                }
            }
        }
    }

    return ''
}

const parseHtmlForTitle = (html: string): string => {
    // The order of these tags matches the order of priority given in the instructions
    const titleTags = [
        /<meta name="application-name" content="([^"]*)"/,
        /<meta name="apple-mobile-web-app-title" content="([^"]*)"/,
        /<title>([^<]*)<\/title>/,
    ]

    for (const tag of titleTags) {
        const match = tag.exec(html)
        if (match && match[1]) {
            return match[1]
        }
    }

    return ''
}

type ManifestIcon = {
    src: string
    sizes: string
}

const fetchTitleAndIconFromManifest = async (
    manifestUrl: string,
): Promise<{ title: string; icon: string }> => {
    const trimmed = manifestUrl.replace(/\/+$/, '') // Trim trailing slashes
    const response = await fetch(trimmed)
    if (response.ok) {
        const manifest = await response.json()

        // Get the name from the manifest
        const title = manifest.name || ''

        // Find the largest icon using sizes in expected format
        // 48x48, 72x72, etc
        let largestIcon: ManifestIcon | null = null
        if (manifest.icons && manifest.icons.length > 0) {
            largestIcon = manifest.icons.reduce(
                (prev: ManifestIcon, current: ManifestIcon) => {
                    const prevSize = Math.max(
                        ...prev.sizes.split('x').map(Number),
                    )
                    const currentSize = Math.max(
                        ...current.sizes.split('x').map(Number),
                    )
                    return prevSize < currentSize ? current : prev
                },
            )
        }

        return { title, icon: largestIcon?.src || '' }
    } else {
        throw new Error(`Failed to fetch manifest from ${manifestUrl}`)
    }
}

const parseHtmlForWebAppManifest = (
    html: string,
    urlOrigin: string,
): string => {
    // Match all <link> tags
    const linkTagRegex = /<link[^>]*>/g
    const linkTags = html.match(linkTagRegex) || []

    // Define the rel value we're interested in
    const relValue = 'manifest'

    for (const tag of linkTags) {
        const relMatch = tag.match(new RegExp(`rel="${relValue}"`))
        const hrefMatch = tag.match(/href="([^"]*)"/)

        if (relMatch && hrefMatch) {
            return new URL(hrefMatch[1], urlOrigin).href
        }
    }

    return ''
}

/**
 * Submit a fetch request to Fedimod URL to try and find metadata to use
 * as a default icon and title
 */
export async function fetchMetadataFromUrl(
    url: URL | string,
): Promise<{ fetchedIcon: string; fetchedTitle: string }> {
    let fetchedTitle = '',
        fetchedIcon = ''

    try {
        // Seems not all web servers handle trailing slashes
        // so we trim them to make fetches more reliable
        // ex: https://example.com/image.png/ fails to return
        const trimmedUrl = url.toString().replace(/\/+$/, '')
        const htmlResponse = await fetch(trimmedUrl)
        if (htmlResponse.ok) {
            const html = await htmlResponse.text()
            const urlOrigin = new URL(trimmedUrl).origin

            // Attempt to parse and fetch both title and favicon
            // from Web App Manifest first if <link> is found in DOM
            const manifestUrl = parseHtmlForWebAppManifest(html, urlOrigin)
            if (manifestUrl) {
                const manifestData =
                    await fetchTitleAndIconFromManifest(manifestUrl)
                fetchedTitle = manifestData.title
                fetchedIcon = manifestData.icon
                    ? new URL(manifestData.icon, urlOrigin).href
                    : ''
            }

            // If title is missing, parse for other tags
            if (!fetchedTitle) {
                fetchedTitle = parseHtmlForTitle(html)
                // Use hostname is no tags are found
                if (!fetchedTitle) {
                    fetchedTitle = new URL(trimmedUrl).hostname
                }
            }

            if (!fetchedIcon) {
                fetchedIcon = await parseHtmlForIcon(html, urlOrigin)

                // Fallback to favicon.ico from the root if favicon is still missing
                if (!fetchedIcon) {
                    const faviconUrl = new URL('/favicon.ico', trimmedUrl).href
                    const rootFaviconResponse = await fetch(faviconUrl)

                    if (rootFaviconResponse.ok) {
                        fetchedIcon = faviconUrl
                    }
                }
            }
        }
    } catch (error) {
        log.error('fetchMetadataFromUrl', error)
    }

    return {
        fetchedIcon,
        fetchedTitle,
    }
}

/**
 * Filters out duplicate mods
 */
export const deduplicate = <T extends { id: string }>(arr: T[]) => {
    return arr.reduce((acc, curr) => {
        if (acc.some(item => item?.id === curr.id)) return acc
        acc.push(curr)
        return acc
    }, [] as Array<T>)
}
