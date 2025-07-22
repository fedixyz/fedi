import fetchMock from 'jest-fetch-mock'
import { rest } from 'msw'
import { setupServer } from 'msw/node'

import { tryFetchUrlMetadata } from '../../utils/fedimods'
import { constructUrl } from '../../utils/neverthrow'

fetchMock.enableMocks()

const noFavicon = 'https://no-favicon.example.com'
const rootFaviconFallback = 'https://root-favicon-fallback.example.com'
const appleTouchIconLink = 'https://apple-touch-icon-link.example.com'
const appleTouchFaviconFallback =
    'https://apple-touch-favicon-fallback.example.com'
const iconLink = 'https://icon-link.example.com'
const shortcutIconLink = 'https://shortcut-icon-link.example.com'
const notFound = 'https://not-found.example.com'
const appNameTitle = 'https://app-name.example.com'
const appleMobileWebAppTitle = 'https://apple-mobile-web-app-title.example.com'
const standardTitle = 'https://standard-title.example.com'
const noTags = 'https://no-tags.example.com'
const withManifest = 'https://with-manifest.example.com'
const withManifestNoMaskable = 'https://with-manifest-no-maskable.example.com'
const networkErrorUrl = 'https://enotfound.com/'

describe('fedimods', () => {
    // --- Mock API for LNURLs ---
    const server = setupServer(
        // Domain with no <link>s and no /favicon.ico fallback
        rest.get(`${noFavicon}`, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'text/html'),
                ctx.body('<head><title>Test Title</title></head>'),
            )
        }),
        rest.get(`${noFavicon}/favicon.ico`, (_req, res, ctx) => {
            return res(ctx.status(404))
        }),

        // Domain with no <link>s but with /favicon.ico
        rest.get(`${rootFaviconFallback}`, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'text/html'),
                ctx.body('<head><title>Test Title</title></head>'),
            )
        }),
        rest.get(`${rootFaviconFallback}/favicon.ico`, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'image/x-icon'),
                ctx.body(''),
            )
        }),

        // Domain with apple-touch-icon <link>
        rest.get(`${appleTouchIconLink}`, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'text/html'),
                ctx.body(
                    '<head><link rel="apple-touch-icon" href="test-apple-touch-icon.png"></head>',
                ),
            )
        }),
        rest.get(
            `${appleTouchIconLink}/test-apple-touch-icon.png`,
            (_req, res, ctx) => {
                return res(
                    ctx.status(200),
                    ctx.set('Content-Type', 'image/png'),
                    ctx.body(''), // Return an empty body for the sake of the test
                )
            },
        ),

        // Domain with basic icon <link>
        rest.get(`${iconLink}`, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'text/html'),
                ctx.body(
                    '<head><link rel="icon" type="image/png" href="test-icon-link.png"></head>',
                ),
            )
        }),
        rest.get(`${iconLink}/test-icon-link.png`, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'image/png'),
                ctx.body(''), // Return an empty body for the sake of the test
            )
        }),

        // Domain with shortcut icon <link>
        rest.get(`${shortcutIconLink}`, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'text/html'),
                ctx.body(
                    '<head><link rel="shortcut icon" type="image/png" href="test-shortcut-icon-link.png"></head>',
                ),
            )
        }),
        rest.get(
            `${shortcutIconLink}/test-shortcut-icon-link.png`,
            (_req, res, ctx) => {
                return res(
                    ctx.status(200),
                    ctx.set('Content-Type', 'image/png'),
                    ctx.body(''), // Return an empty body for the sake of the test
                )
            },
        ),

        // Domain with apple-touch-icon <link> that 404s with /favicon.ico fallback
        rest.get(`${appleTouchFaviconFallback}`, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'text/html'),
                ctx.body(
                    '<head><link rel="apple-touch-icon" href="test-apple-touch-icon.png"></head>',
                ),
            )
        }),
        rest.get(
            `${appleTouchFaviconFallback}/test-apple-touch-icon.png`,
            (_req, res, ctx) => {
                return res(ctx.status(404))
            },
        ),
        rest.get(
            `${appleTouchFaviconFallback}/favicon.ico`,
            (_req, res, ctx) => {
                return res(
                    ctx.status(200),
                    ctx.set('Content-Type', 'image/x-icon'),
                    ctx.body(''),
                )
            },
        ),

        // Domain that 404s at root
        rest.get(`${notFound}`, (_req, res, ctx) => {
            return res(ctx.status(404))
        }),

        // Domain with application-name meta
        rest.get(`${appNameTitle}`, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'text/html'),
                ctx.body(
                    '<head><meta name="application-name" content="Test Application Name"></head>',
                ),
            )
        }),

        // Domain with apple-mobile-web-app-title
        rest.get(`${appleMobileWebAppTitle}`, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'text/html'),
                ctx.body(
                    '<head><meta name="apple-mobile-web-app-title" content="Test Apple Mobile Web App Title"></head>',
                ),
            )
        }),

        // Domain with standard <title>
        rest.get(`${standardTitle}`, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'text/html'),
                ctx.body('<head><title>Test Title</title></head>'),
            )
        }),

        // Domain with html but no tags
        rest.get(`${noTags}`, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'text/html'),
                ctx.body('<head></head>'),
            )
        }),

        rest.get(`${withManifest}`, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'text/html'),
                ctx.body(
                    '<head><link rel="manifest" href="manifest.json"/><title>Test Application Name</head>',
                ),
            )
        }),

        rest.get(`${withManifest}/manifest.json`, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'application/json'),
                ctx.body(
                    JSON.stringify({
                        name: 'Test Manifest Name',
                        icons: [
                            {
                                src: 'test-icon-link-128-any.png',
                                sizes: '128x128',
                                purpose: 'any',
                            },
                            {
                                src: 'test-icon-link-32-any.png',
                                sizes: '32x32',
                                purpose: 'any',
                            },
                            {
                                src: 'test-icon-link-16-maskable.png',
                                sizes: '16x16',
                                purpose: 'maskable',
                            },
                            {
                                src: 'test-icon-link-64-maskable.png',
                                sizes: '64x64',
                                purpose: 'maskable',
                            },
                        ],
                    }),
                ),
            )
        }),

        rest.get(`${withManifestNoMaskable}`, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'text/html'),
                ctx.body(
                    '<head><link rel="manifest" href="manifest.json"/><title>Test Application Name</head>',
                ),
            )
        }),

        rest.get(
            `${withManifestNoMaskable}/manifest.json`,
            (_req, res, ctx) => {
                return res(
                    ctx.status(200),
                    ctx.set('Content-Type', 'application/json'),
                    ctx.body(
                        JSON.stringify({
                            name: 'Test Manifest Name',
                            icons: [
                                {
                                    src: 'test-icon-link-128-any.png',
                                    sizes: '128x128',
                                    purpose: 'any',
                                },
                                {
                                    src: 'test-icon-link-32-any.png',
                                    sizes: '32x32',
                                    purpose: 'any',
                                },
                            ],
                        }),
                    ),
                )
            },
        ),

        rest.get(networkErrorUrl, (_req, res, _ctx) => {
            return res.networkError('getaddrinfo ENOTFOUND')
        }),
    )

    beforeEach(() => server.listen())
    afterEach(() => server.resetHandlers())
    afterAll(() => server.close())

    it('should return the /favicon.ico as a fallback', async () => {
        const metadata =
            await constructUrl(rootFaviconFallback).asyncAndThen(
                tryFetchUrlMetadata,
            )
        expect(metadata._unsafeUnwrap().icon).toBe(
            `${rootFaviconFallback}/favicon.ico`,
        )
    })

    it('should return an empty string favicon with no links or favicon.ico fallback', async () => {
        const metadata =
            await constructUrl(noFavicon).asyncAndThen(tryFetchUrlMetadata)
        expect(metadata._unsafeUnwrap().icon).toBe('')
    })

    it('should return the apple touch icon as the favicon', async () => {
        const metadata =
            await constructUrl(appleTouchIconLink).asyncAndThen(
                tryFetchUrlMetadata,
            )
        expect(metadata._unsafeUnwrap().icon).toBe(
            `${appleTouchIconLink}/test-apple-touch-icon.png`,
        )
    })

    it('should return the icon link as the favicon', async () => {
        const metadata =
            await constructUrl(iconLink).asyncAndThen(tryFetchUrlMetadata)
        expect(metadata._unsafeUnwrap().icon).toBe(
            `${iconLink}/test-icon-link.png`,
        )
    })

    it('should return the shortcut icon link as the favicon', async () => {
        const metadata =
            await constructUrl(shortcutIconLink).asyncAndThen(
                tryFetchUrlMetadata,
            )
        expect(metadata._unsafeUnwrap().icon).toBe(
            `${shortcutIconLink}/test-shortcut-icon-link.png`,
        )
    })

    it('should return the favicon.ico fallback if link is found but refs a 404', async () => {
        const metadata = await constructUrl(
            appleTouchFaviconFallback,
        ).asyncAndThen(tryFetchUrlMetadata)
        expect(metadata._unsafeUnwrap().icon).toBe(
            `${appleTouchFaviconFallback}/favicon.ico`,
        )
    })

    it('should return an Err on non-200 status code', async () => {
        const metadata =
            await constructUrl(notFound).asyncAndThen(tryFetchUrlMetadata)
        expect(metadata.isOk()).toBe(false)
        expect(metadata.isErr()).toBe(true)
        expect(metadata._unsafeUnwrapErr()._tag).toBe('FetchError')
    })

    it('should return the application name as the title', async () => {
        const metadata =
            await constructUrl(appNameTitle).asyncAndThen(tryFetchUrlMetadata)
        expect(metadata._unsafeUnwrap().title).toBe('Test Application Name')
    })

    it('should return the apple mobile web app title as the title', async () => {
        const metadata = await constructUrl(
            appleMobileWebAppTitle,
        ).asyncAndThen(tryFetchUrlMetadata)
        expect(metadata._unsafeUnwrap().title).toBe(
            'Test Apple Mobile Web App Title',
        )
    })

    it('should return hostname if no tags are found', async () => {
        const metadata =
            await constructUrl(noTags).asyncAndThen(tryFetchUrlMetadata)
        expect(metadata._unsafeUnwrap().title).toBe(noTags.split('https://')[1])
    })

    it('should prioritize the manifest name over the html title', async () => {
        const metadata =
            await constructUrl(withManifest).asyncAndThen(tryFetchUrlMetadata)
        expect(metadata._unsafeUnwrap().title).toBe('Test Manifest Name')
    })

    it('should select the largest maskable icon from the manifest', async () => {
        const metadata =
            await constructUrl(withManifest).asyncAndThen(tryFetchUrlMetadata)
        expect(metadata._unsafeUnwrap().icon).toBe(
            `${withManifest}/test-icon-link-64-maskable.png`,
        )
    })

    it('should fall back to the largest icon from the manifest if no maskable icon is found', async () => {
        const metadata = await constructUrl(
            withManifestNoMaskable,
        ).asyncAndThen(tryFetchUrlMetadata)
        expect(metadata._unsafeUnwrap().icon).toBe(
            `${withManifestNoMaskable}/test-icon-link-128-any.png`,
        )
    })

    it('should return a FetchError if the fetch fails', async () => {
        const metadata =
            await constructUrl(networkErrorUrl).asyncAndThen(
                tryFetchUrlMetadata,
            )

        expect(metadata.isOk()).toBe(false)
        expect(metadata.isErr()).toBe(true)
        expect(metadata._unsafeUnwrapErr()._tag).toBe('FetchError')
    })
})
