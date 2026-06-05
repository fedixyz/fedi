import { z } from 'zod'

import {
    GITHUB_RELEASES_API_URL,
    IOS_LOOKUP_API_URL,
} from '../constants/release'
import { isDevOrExperimental } from './environment'
import { makeLog } from './log'

const log = makeLog('common/utils/release')

/**
 * Zod schema defining the fields of an item of a GitHub release asset that we care about
 *
 * .passthrough() ignores the other fields
 */
export const releaseAssetSchema = z
    .object({
        name: z.string(),
        browser_download_url: z.string().url(),
    })
    .passthrough()

/**
 * Zod schema defining the fields of a GitHub release that we care about
 * https://docs.github.com/en/rest/releases/releases?apiVersion=2026-03-10#get-the-latest-release
 *
 * .passthrough() ignores the other fields
 */
export const releaseJsonSchema = z
    .object({
        id: z.number(),
        tag_name: z.string(),
        assets: z.array(releaseAssetSchema),
    })
    .passthrough()

/**
 * Zod schema defining the shape of the release-notes.json file
 * that should be uploaded to the latest GitHub release
 */
const releaseNotesJsonSchema = z
    .object({ en: z.string() })
    .and(z.record(z.string()))

export type ReleaseJson = z.infer<typeof releaseJsonSchema>
export type ReleaseAsset = z.infer<typeof releaseAssetSchema>
export type ReleaseNotesJson = z.infer<typeof releaseNotesJsonSchema>

/**
 * Attempts to fetch the latest release of the Fedi public GitHub repo
 */
export async function fetchGithubRelease(): Promise<ReleaseJson> {
    log.info('(Start) [fetch latest public release from GitHub]')

    try {
        const res = await fetch(GITHUB_RELEASES_API_URL)

        if (!res.ok) throw new Error('HTTP response was not OK')

        const json = await res.json()

        return releaseJsonSchema.parse(json)
    } catch (err) {
        log.error('(Error) [fetch latest public release from GitHub]', err)
        throw err
    } finally {
        log.info('(Finish) [fetch latest public release from GitHub]')
    }
}

/**
 * Given an object matching the releaseJsonSchema, attempts to find and fetch the
 * contents of the release-notes.json asset included with the release
 */
export async function fetchGithubReleaseNotes(
    release: ReleaseJson,
): Promise<ReleaseNotesJson> {
    const releaseNotesUrl = release.assets.find(
        asset => asset.name === 'release-notes.json',
    )?.browser_download_url

    if (!releaseNotesUrl) {
        throw new Error(
            '(Error) [Fetching release notes from GitHub] release-notes.json not found',
        )
    }

    log.info('(Start) [Fetching release notes from GitHub]')

    try {
        const res = await fetch(releaseNotesUrl)

        if (!res.ok) throw new Error('HTTP response was not OK')

        const json = await res.json()

        return releaseNotesJsonSchema.parse(json)
    } catch (err) {
        log.error('(Error) [Fetching release notes from GitHub]', err)
        throw err
    } finally {
        log.info('(Finish) [Fetching release notes from GitHub]')
    }
}

/**
 * Zod schema defining the fields of an item of the iTunes lookup response
 * that we care about
 *
 * .passthrough() ignores the other fields
 */
export const iosAppEntrySchema = z
    .object({
        version: z.string(),
        // Absent when a version ships with empty "What's New" text. The
        // version check must survive that, so don't require it
        releaseNotes: z.string().optional(),
    })
    .passthrough()

const iosLookupResponseSchema = z.object({
    results: z.array(iosAppEntrySchema),
})

export type IosAppEntry = z.infer<typeof iosAppEntrySchema>

/**
 * Attempts to lookup the metadata of the latest release of the Fedi iOS app
 */
export async function lookupIosAppMetadata(): Promise<IosAppEntry> {
    log.info('(Start) [lookup ios app metadata]')

    try {
        const res = await fetch(IOS_LOOKUP_API_URL)

        if (!res.ok) throw new Error('HTTP response was not OK')

        const json = JSON.parse(await res.text())
        const [entry] = iosLookupResponseSchema.parse(json).results

        if (!entry) throw new Error('App not found in iTunes lookup response')

        log.info('(Finish) [lookup ios app metadata]')
        return entry
    } catch (err) {
        log.error('(Error) [lookup ios app metadata]', err)
        throw err
    }
}

function parseReleaseTag(
    releaseTag: string,
): { major: number; minor: number; patch: number } | null {
    if (!/[0-9]+\.[0-9]+\.[0-9]+/.test(releaseTag)) return null

    const [major, minor, patch] = releaseTag.split('.').map(Number)

    return { major, minor, patch }
}

/**
 * Determines if a new release is available based on the current and new release tags
 *
 * For production builds, the major and minor version numbers indicate that a new release is available.
 * For dev or experimental builds, all version numbers indicate that a new release is available.
 */
export function hasNewRelease(currentTag: string, newTag: string) {
    const currentRelease = parseReleaseTag(currentTag)
    const newRelease = parseReleaseTag(newTag)

    if (!currentRelease || !newRelease) return false

    if (newRelease.major > currentRelease.major) return true

    if (
        newRelease.major >= currentRelease.major &&
        newRelease.minor > currentRelease.minor
    )
        return true

    // For dev or experimental builds,
    // Show the update screen for any new release tag
    // To make it easier for QA to test
    if (
        isDevOrExperimental &&
        newRelease.major >= currentRelease.major &&
        newRelease.minor >= currentRelease.minor &&
        newRelease.patch > currentRelease.patch
    )
        return true

    return false
}
