import orderBy from 'lodash/orderBy'
import { Result, ResultAsync } from 'neverthrow'
import { z } from 'zod'

import {
    FetchError,
    MalformedDataError,
    MissingDataError,
    NotOkHttpResponseError,
    SchemaValidationError,
    UrlConstructError,
} from '../types/errors'
import { CommunityMeta } from '../types/fediInternal'
import { TaggedError } from './errors'
import {
    constructUrl,
    ensureHttpResponseOk,
    ensureNonNullish,
    fetchResult,
    thenJson,
    throughZodSchema,
} from './neverthrow'

/**
 * Attempts to find the application name from meta tags
 * Falls back to the first title tag
 * If nothing is found, returns a `MissingDataError`
 */
const tryGetHtmlTitle = (html: string): Result<string, MissingDataError> => {
    const titleMetaTags = html.match(
        /<meta[^>]*name="(application-name|apple-mobile-web-app-title)"[^>]*>/gi,
    )
    const titleMetaContents =
        titleMetaTags
            ?.map(tag => tag.match(/content="([^"]*)"/i)?.[1])
            .filter(content => content !== undefined) ?? []
    const titleText = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
    const resolvedTitle = titleMetaContents?.[0] ?? titleText

    return ensureNonNullish(resolvedTitle)
}

/**
 * Attempts to find and construct a manifest url from an html string
 * If no manifest URL is found, returns a `MissingDataError`
 */
const tryGetManifestUrl = (
    html: string,
    urlOrigin: string,
): Result<URL, MissingDataError | UrlConstructError> => {
    const manifestLink = html
        .match(/<link[^>]*rel="manifest"[^>]*>/gi)?.[0]
        ?.match(/href="([^"]*)"/i)?.[1]

    return ensureNonNullish(manifestLink).andThen(link =>
        constructUrl(link, urlOrigin),
    )
}

/**
 * Returns an array of all valid icon URLs in an html string
 */
const getHtmlIconUrls = (html: string, urlOrigin: string): URL[] => {
    const iconLinks = html.match(
        /<link[^>]*rel="(icon|shortcut\sicon|apple-touch-icon)"[^>]*>/gi,
    )
    const iconUrls =
        iconLinks
            ?.map(tag => tag.match(/href="([^"]*)"/i)?.[1])
            .filter(href => href !== undefined) ?? []

    iconUrls.push('/favicon.ico')

    return iconUrls
        .map(url => constructUrl(url, urlOrigin))
        .filter(url => url.isOk())
        .map(url => url.value)
}

/**
 * Finds all possible icons from an HTML string and returns the first one that returns an ok http response
 */
const tryFetchFirstHtmlIcon = (
    html: string,
    urlOrigin: string,
): ResultAsync<
    URL,
    FetchError | UrlConstructError | MissingDataError | NotOkHttpResponseError
> => {
    const iconUrls = getHtmlIconUrls(html, urlOrigin)

    // Ensures that the http response of an icon, given its URL, is ok
    const isUrlOk = (url: URL) =>
        fetchResult(url.toString())
            .andThrough(ensureHttpResponseOk)
            .map(() => url)

    // Attempts to fetch icon URLs until one is valid
    return iconUrls.reduce(
        (prev, curr) => prev.orElse(() => isUrlOk(curr)),
        new TaggedError('MissingDataError')
            .withMessage('expected at least one icon')
            .intoErrAsync() as ReturnType<typeof tryFetchFirstHtmlIcon>,
    )
}

const manifestIconSchema = z
    .object({
        src: z.string(),
        sizes: z.string(),
        purpose: z.enum(['any', 'maskable', 'monochrome']).optional(),
    })
    .passthrough()

type ManifestIcon = z.infer<typeof manifestIconSchema>

const manifestSchema = z
    .object({
        name: z.string().min(1),
        icons: z.array(manifestIconSchema).optional(),
    })
    .passthrough()

/**
 * Attempts to find the title and largest valid icon from a manifest url
 * If the manifest is malformed, returns a `SchemaValidationError`
 */
const tryFetchManifestMetadata = (
    manifestUrl: URL,
): ResultAsync<
    { title: string; icon: string },
    SchemaValidationError | UrlConstructError | MalformedDataError | FetchError
> => {
    return fetchResult(manifestUrl.toString())
        .andThen(thenJson)
        .andThen(throughZodSchema(manifestSchema))
        .map(manifest => {
            let icon: ManifestIcon | null = null

            if (manifest.icons && manifest.icons.length > 0) {
                icon = orderBy(
                    manifest.icons,
                    [
                        // Prefer maskable icons
                        (ic: ManifestIcon) =>
                            ic.purpose?.includes('maskable') ? 1 : 0,
                        // Sort by largest size
                        (ic: ManifestIcon) =>
                            Math.max(...ic.sizes.split('x').map(Number)),
                    ],
                    ['desc', 'desc'],
                )[0]
            }

            return {
                title: manifest.name,
                icon: constructUrl(icon?.src ?? '', manifestUrl.origin)
                    .unwrapOr('')
                    .toString(),
            }
        })
}

/**
 * Submit a fetch request to URL and find the best possible title and icon
 * If the initial http response is not of status 200, returns a `FetchError`
 * If a title cannot be found, falls back to the hostname
 * If an icon cannot be found, falls back to an empty string
 */
export function tryFetchUrlMetadata(
    url: URL,
): ResultAsync<
    { icon: string; title: string },
    FetchError | MalformedDataError | UrlConstructError | NotOkHttpResponseError
> {
    return fetchResult(url.toString())
        .andThen(ensureHttpResponseOk)
        .andThen(res =>
            ResultAsync.fromPromise(
                res.text(),
                e => new TaggedError('MalformedDataError', e),
            ),
        )
        .map(async html => {
            let title = '',
                icon = ''

            const manifestUrl = tryGetManifestUrl(html, url.origin)

            if (manifestUrl.isOk())
                await tryFetchManifestMetadata(manifestUrl.value).map(
                    manifest => {
                        title = manifest.title
                        icon = manifest.icon
                    },
                )

            if (!title) tryGetHtmlTitle(html).map(t => (title = t))

            if (!icon)
                await tryFetchFirstHtmlIcon(html, url.origin).map(
                    ic => (icon = ic.toString()),
                )

            return { title: title || url.hostname, icon }
        })
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

/**
 * Stringifies miniApps and default groups then the entire
 * community object. Also adds version field.
 *
 * This allows the injection to use strong types throughout, even
 * though the bridge expects stringified json in some fields.
 */
export const prepareCreateCommunityPayload = (
    community: CommunityMeta,
): string => {
    const patchedCommunity = { ...community }

    const miniAppsString = patchedCommunity.fedimods
        ? JSON.stringify(patchedCommunity.fedimods)
        : undefined
    if (miniAppsString) {
        Object.assign(patchedCommunity, { fedimods: miniAppsString })
    }

    const defaultGroupsString = patchedCommunity.default_group_chats
        ? JSON.stringify(patchedCommunity.default_group_chats)
        : undefined

    if (defaultGroupsString) {
        Object.assign(patchedCommunity, {
            default_group_chats: defaultGroupsString,
        })
    }

    Object.assign(patchedCommunity, { version: 1 })

    return JSON.stringify(patchedCommunity)
}
