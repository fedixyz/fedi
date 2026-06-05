import { rest } from 'msw'
import { setupServer } from 'msw/node'

import {
    GITHUB_RELEASES_API_URL,
    IOS_LOOKUP_API_URL,
} from '../../../constants/release'
import {
    IosAppEntry,
    ReleaseAsset,
    ReleaseJson,
    fetchGithubReleaseNotes,
    fetchGithubRelease,
    lookupIosAppMetadata,
} from '../../../utils/release'

const validAssetJson: ReleaseAsset = {
    name: 'release-notes.json',
    browser_download_url: 'https://github.com/release-notes.json',
}

const validReleaseJson: ReleaseJson = {
    id: 123456,
    tag_name: '26.0.0',
    assets: [validAssetJson],
}

const validReleaseNotesJson = {
    en: 'release notes',
    es: 'notas de la versión',
}

const invalidReleaseNotesJson = {
    es: 12344,
    en: { type: 'string' },
}

const notNotesAssetJson: ReleaseAsset = {
    name: 'readme.md',
    browser_download_url: 'https://github.com/readme.md',
}

const invalidReleaseJson = {
    id: 'none',
    assets: 'invalid assets',
    tag: 3,
}

describe('fetchGithubRelease', () => {
    const server = setupServer(
        rest.get(GITHUB_RELEASES_API_URL, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'application/json'),
                ctx.body(JSON.stringify(validReleaseJson)),
            )
        }),
    )

    beforeEach(() => server.listen())
    afterEach(() => server.resetHandlers())
    afterAll(() => server.close())

    it('should return a release schema', async () => {
        const result = await fetchGithubRelease()

        expect(result).toEqual(validReleaseJson)
    })

    it('should throw if the fetch fails', async () => {
        server.use(
            rest.get(GITHUB_RELEASES_API_URL, (_req, res) => {
                return res.networkError('getaddrinfo ENOTFOUND')
            }),
        )

        const result = fetchGithubRelease()

        await expect(result).rejects.toThrow()
    })

    it('should throw if a non-JSON response is received', async () => {
        server.use(
            rest.get(GITHUB_RELEASES_API_URL, (_req, res, ctx) => {
                return res(
                    ctx.status(200),
                    ctx.set('Content-Type', 'text/html'),
                    ctx.body('<html>hi</html>'),
                )
            }),
        )

        const result = fetchGithubRelease()

        await expect(result).rejects.toThrow()
    })

    it('should throw if the response does not match the schema', async () => {
        server.use(
            rest.get(GITHUB_RELEASES_API_URL, (_req, res, ctx) => {
                return res(
                    ctx.status(200),
                    ctx.set('Content-Type', 'application/json'),
                    ctx.body(JSON.stringify(invalidReleaseJson)),
                )
            }),
        )

        const result = fetchGithubRelease()

        await expect(result).rejects.toThrow()
    })
})

describe('fetchGithubReleaseNotes', () => {
    const server = setupServer(
        rest.get(GITHUB_RELEASES_API_URL, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'application/json'),
                ctx.body(JSON.stringify(validReleaseJson)),
            )
        }),
        rest.get(validAssetJson.browser_download_url, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'application/json'),
                ctx.body(JSON.stringify(validReleaseNotesJson)),
            )
        }),
    )

    beforeEach(() => server.listen())
    afterEach(() => server.resetHandlers())
    afterAll(() => server.close())

    it('should fetch and return the release notes', async () => {
        const result = await fetchGithubReleaseNotes(validReleaseJson)

        expect(result).toEqual(validReleaseNotesJson)
    })

    it('should throw if the fetch fails', async () => {
        server.use(
            rest.get(validAssetJson.browser_download_url, (_req, res) => {
                return res.networkError('getaddrinfo ENOTFOUND')
            }),
        )

        const result = fetchGithubReleaseNotes(validReleaseJson)

        await expect(result).rejects.toThrow()
    })

    it('should throw if a non-JSON response is received', async () => {
        server.use(
            rest.get(validAssetJson.browser_download_url, (_req, res, ctx) => {
                return res(
                    ctx.status(200),
                    ctx.set('Content-Type', 'text/html'),
                    ctx.body('<html>hi</html>'),
                )
            }),
        )

        const result = fetchGithubReleaseNotes(validReleaseJson)

        await expect(result).rejects.toThrow()
    })

    it('should throw if the response does not match the schema', async () => {
        server.use(
            rest.get(validAssetJson.browser_download_url, (_req, res, ctx) => {
                return res(
                    ctx.status(200),
                    ctx.set('Content-Type', 'application/json'),
                    ctx.body(JSON.stringify(invalidReleaseNotesJson)),
                )
            }),
        )

        const result = fetchGithubReleaseNotes(validReleaseJson)

        await expect(result).rejects.toThrow()
    })

    it('should throw if the release notes asset is not found', async () => {
        const result = fetchGithubReleaseNotes({
            ...validReleaseJson,
            assets: [notNotesAssetJson],
        })

        await expect(result).rejects.toThrow()
    })
})

describe('hasNewRelease', () => {
    describe('production build', () => {
        let hasNewRelease: (currentTag: string, newTag: string) => boolean

        beforeEach(() => {
            jest.resetModules()
            jest.doMock('@fedi/common/utils/environment', () => ({
                ...jest.requireActual('@fedi/common/utils/environment'),
                isDevOrExperimental: false,
            }))
            hasNewRelease = jest.requireActual(
                '@fedi/common/utils/release',
            ).hasNewRelease
        })

        it('should return true if there is a new major release', () => {
            expect(hasNewRelease('26.0.0', '27.0.0')).toBe(true)
            expect(hasNewRelease('26.9.1', '27.0.2')).toBe(true)
        })

        it('should return true if there is a new minor release', () => {
            expect(hasNewRelease('26.1.0', '26.2.0')).toBe(true)
            expect(hasNewRelease('26.1.8', '26.8.1')).toBe(true)
        })

        it('should not return true if there is a new patch release', () => {
            expect(hasNewRelease('26.1.0', '26.1.1')).toBe(false)
            expect(hasNewRelease('26.1.0', '26.1.10')).toBe(false)
        })

        it('should return false if somehow the new release tag is older', () => {
            expect(hasNewRelease('26.0.0', '25.9.1')).toBe(false)
            expect(hasNewRelease('26.9.1', '26.0.0')).toBe(false)
            expect(hasNewRelease('25.9.1', '25.9.0')).toBe(false)
        })
    })

    describe('dev or experimental build', () => {
        let hasNewRelease: (currentTag: string, newTag: string) => boolean

        beforeEach(() => {
            jest.resetModules()
            jest.doMock('@fedi/common/utils/environment', () => ({
                ...jest.requireActual('@fedi/common/utils/environment'),
                isDevOrExperimental: true,
            }))
            hasNewRelease = jest.requireActual(
                '@fedi/common/utils/release',
            ).hasNewRelease
        })

        it('should return true if there is a new major release', () => {
            expect(hasNewRelease('26.0.0', '27.0.0')).toBe(true)
            expect(hasNewRelease('26.9.1', '27.0.2')).toBe(true)
        })

        it('should return true if there is a new minor release', () => {
            expect(hasNewRelease('26.1.0', '26.2.0')).toBe(true)
            expect(hasNewRelease('26.1.8', '26.8.1')).toBe(true)
        })

        it('should return true if there is a new patch release', () => {
            expect(hasNewRelease('26.1.0', '26.1.3')).toBe(true)
            expect(hasNewRelease('26.1.0', '26.1.10')).toBe(true)
        })

        it('should return false if somehow the new release tag is older', () => {
            expect(hasNewRelease('26.0.0', '25.9.1')).toBe(false)
            expect(hasNewRelease('26.9.1', '26.0.0')).toBe(false)
            expect(hasNewRelease('25.9.1', '25.9.0')).toBe(false)
        })
    })
})

const validIosAppEntry: IosAppEntry = {
    version: '26.1.1',
    releaseNotes: 'release notes',
}

const invalidIosAppEntry = {
    version: 15,
    releaseNotes: { type: 'test' },
}

describe('lookupIosAppMetadata', () => {
    const server = setupServer(
        rest.get(IOS_LOOKUP_API_URL, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'text/plain'),
                ctx.body(
                    JSON.stringify({
                        resultCount: 1,
                        results: [validIosAppEntry],
                    }),
                ),
            )
        }),
    )

    beforeEach(() => server.listen())
    afterEach(() => server.resetHandlers())
    afterAll(() => server.close())

    it('should parse a valid iOS app entry', async () => {
        const result = await lookupIosAppMetadata()

        expect(result).toEqual(validIosAppEntry)
    })

    it('should throw if the fetch fails', async () => {
        server.use(
            rest.get(IOS_LOOKUP_API_URL, (_req, res) => {
                return res.networkError('getaddrinfo ENOTFOUND')
            }),
        )

        const result = lookupIosAppMetadata()

        await expect(result).rejects.toThrow()
    })

    it('should throw if the response cannot be parsed as JSON', async () => {
        server.use(
            rest.get(IOS_LOOKUP_API_URL, (_req, res, ctx) => {
                return res(
                    ctx.status(200),
                    ctx.set('Content-Type', 'text/plain'),
                    ctx.body('non json response'),
                )
            }),
        )

        const result = lookupIosAppMetadata()

        await expect(result).rejects.toThrow()
    })

    it('should throw if the app entry does not match the schema', async () => {
        server.use(
            rest.get(IOS_LOOKUP_API_URL, (_req, res, ctx) => {
                return res(
                    ctx.status(200),
                    ctx.set('Content-Type', 'text/plain'),
                    ctx.body(
                        JSON.stringify({
                            resultCount: 1,
                            results: [invalidIosAppEntry],
                        }),
                    ),
                )
            }),
        )

        const result = lookupIosAppMetadata()

        await expect(result).rejects.toThrow()
    })

    it('should throw if the response does not match the schema', async () => {
        server.use(
            rest.get(IOS_LOOKUP_API_URL, (_req, res, ctx) => {
                return res(
                    ctx.status(200),
                    ctx.set('Content-Type', 'text/plain'),
                    ctx.body(JSON.stringify({ test: 'lol' })),
                )
            }),
        )

        const result = lookupIosAppMetadata()

        await expect(result).rejects.toThrow()
    })

    it('should throw if no results are returned', async () => {
        server.use(
            rest.get(IOS_LOOKUP_API_URL, (_req, res, ctx) => {
                return res(
                    ctx.status(200),
                    ctx.set('Content-Type', 'text/plain'),
                    ctx.body(JSON.stringify({ resultCount: 0, results: [] })),
                )
            }),
        )

        const result = lookupIosAppMetadata()

        await expect(result).rejects.toThrow()
    })

    it('should parse an entry without release notes', async () => {
        server.use(
            rest.get(IOS_LOOKUP_API_URL, (_req, res, ctx) => {
                return res(
                    ctx.status(200),
                    ctx.set('Content-Type', 'text/plain'),
                    ctx.body(
                        JSON.stringify({
                            resultCount: 1,
                            results: [{ version: '26.1.1' }],
                        }),
                    ),
                )
            }),
        )

        const result = await lookupIosAppMetadata()

        expect(result).toEqual({ version: '26.1.1' })
    })
})
