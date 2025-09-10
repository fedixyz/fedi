import fetchMock from 'jest-fetch-mock'
import { rest } from 'msw'
import { setupServer } from 'msw/node'
import { ok } from 'neverthrow'
import { z } from 'zod'

import {
    constructUrl,
    ensureHttpResponseOk,
    ensureNonNullish,
    fetchResult,
    thenJson,
    throughZodSchema,
} from '../../utils/neverthrow'

fetchMock.enableMocks()

const validDataUrl = 'https://validjson.com'
const responseHtmlUrl = 'https://html.com'
const eNotFound = 'https://enotfound.com'
const invalidUrl = '$invalid\\url'
const nonOkResponseUrl = 'https://nonokresponse.com'

const testSchema = z.object({
    foo: z.string(),
    baz: z.number(),
})

const sampleValidData = { foo: 'bar', baz: 1 }
const sampleInvalidData = { foo: 1, baz: 'qux' }

describe('neverthrow', () => {
    // --- Mock API for LNURLs ---
    const server = setupServer(
        rest.get(validDataUrl, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'application/json'),
                ctx.body(JSON.stringify(sampleValidData)),
            )
        }),
        rest.get(responseHtmlUrl, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'text/html'),
                ctx.body('<html>hi</html>'),
            )
        }),
        rest.get(nonOkResponseUrl, (_req, res, ctx) => {
            return res(ctx.status(500), ctx.body('Not found'))
        }),
        rest.get(eNotFound, (_req, res, _ctx) => {
            return res.networkError('getaddrinfo ENOTFOUND')
        }),
    )

    beforeEach(() => server.listen())
    afterEach(() => server.resetHandlers())
    afterAll(() => server.close())

    describe('constructUrl', () => {
        it('should return a valid URL object for a valid URL', () => {
            const url = constructUrl(validDataUrl)

            expect(url.isOk()).toBe(true)
            expect(url.isErr()).toBe(false)
            expect(url._unsafeUnwrap()).toBeInstanceOf(URL)
            expect(url._unsafeUnwrap().href).toContain(validDataUrl)
        })

        it('should return a UrlConstructError error for an invalid URL', () => {
            const url = constructUrl(invalidUrl)

            expect(url.isOk()).toBe(false)
            expect(url.isErr()).toBe(true)
            expect(url._unsafeUnwrapErr()._tag).toBe('UrlConstructError')
        })
    })

    describe('throughZodSchema', () => {
        it('should return the validated data if it matches the schema', () => {
            const parser = throughZodSchema(testSchema)
            const result = parser(sampleValidData)

            expect(result.isOk()).toBe(true)
            expect(result.isErr()).toBe(false)
            expect(result._unsafeUnwrap()).toEqual(sampleValidData)
        })

        it('should return a SchemaValidationError for invalid data', () => {
            const parser = throughZodSchema(testSchema)
            const result = parser(sampleInvalidData)

            expect(result.isOk()).toBe(false)
            expect(result.isErr()).toBe(true)
            expect(result._unsafeUnwrapErr()._tag).toBe('SchemaValidationError')
        })
    })

    describe('fetchResult', () => {
        it('should return a Response object if the fetch is successful', async () => {
            const result = await fetchResult(validDataUrl)

            expect(result.isOk()).toBe(true)
            expect(result.isErr()).toBe(false)

            const response = result._unsafeUnwrap()

            expect(response).toBeInstanceOf(Response)
            expect(response.status).toBe(200)
            expect(response.ok).toBe(true)
        })

        it('should return a Response object regardless of a non-ok status code', async () => {
            server.use(
                rest.get(validDataUrl, (_req, res, ctx) =>
                    res(ctx.status(404), ctx.body('Not found')),
                ),
            )

            const result = await fetchResult(validDataUrl)

            expect(result.isOk()).toBe(true)

            const response = result._unsafeUnwrap()

            expect(response).toBeInstanceOf(Response)
            expect(response.status).toBe(404)
            expect(response.ok).toBe(false)
        })

        it('should return a UrlConstructError if an invalid URL is passed', async () => {
            const result = await fetchResult(invalidUrl)

            expect(result.isOk()).toBe(false)
            expect(result.isErr()).toBe(true)
            expect(result._unsafeUnwrapErr()._tag).toBe('UrlConstructError')
        })

        it('should return a FetchError if the fetch results in a network error', async () => {
            const result = await fetchResult(eNotFound)

            expect(result.isOk()).toBe(false)
            expect(result.isErr()).toBe(true)
            expect(result._unsafeUnwrapErr()._tag).toBe('FetchError')
        })
    })

    describe('thenJson', () => {
        it('should return the parsed response body if the response is successfully parsed as JSON', async () => {
            const result = await fetchResult(validDataUrl).andThen(thenJson)

            expect(result.isOk()).toBe(true)
            expect(result.isErr()).toBe(false)
            expect(result._unsafeUnwrap()).toEqual(sampleValidData)
        })

        it('should return a MalformedDataError if the response fails to be parsed as JSON', async () => {
            const result = await fetchResult(responseHtmlUrl).andThen(thenJson)

            expect(result.isOk()).toBe(false)
            expect(result.isErr()).toBe(true)
            expect(result._unsafeUnwrapErr()._tag).toBe('MalformedDataError')
        })
    })

    describe('piping', () => {
        it('should successfully pipe an http response through thenJson and through a zod schema', async () => {
            const result = await fetchResult(validDataUrl)
                .andThen(thenJson)
                .andThen(throughZodSchema(testSchema))

            expect(result.isOk()).toBe(true)
            expect(result.isErr()).toBe(false)
            expect(result._unsafeUnwrap()).toEqual(sampleValidData)
        })

        it('should short-circuit to a SchemaValidationError when JSON response does not match the zod schema', async () => {
            server.use(
                rest.get(validDataUrl, (_req, res, ctx) =>
                    res(
                        ctx.status(200),
                        ctx.set('Content-Type', 'application/json'),
                        ctx.body(JSON.stringify(sampleInvalidData)),
                    ),
                ),
            )

            const result = await fetchResult(validDataUrl)
                .andThen(thenJson)
                .andThen(throughZodSchema(testSchema))

            expect(result.isErr()).toBe(true)
            expect(result._unsafeUnwrapErr()._tag).toBe('SchemaValidationError')
        })
    })

    describe('ensureNonNullish', () => {
        it('should let the value pass through if it is not null or undefined', () => {
            const result = ok(1).andThen(ensureNonNullish)

            expect(result.isOk()).toBe(true)
            expect(result._unsafeUnwrap()).toBe(1)
        })

        it('should return a MissingDataError if the value is null or undefined', () => {
            const nullRes = ok(null).andThen(ensureNonNullish)
            const undefinedRes = ok(undefined).andThen(ensureNonNullish)

            expect(nullRes.isErr()).toBe(true)
            expect(nullRes._unsafeUnwrapErr()._tag).toBe('MissingDataError')

            expect(undefinedRes.isErr()).toBe(true)
            expect(undefinedRes._unsafeUnwrapErr()._tag).toBe(
                'MissingDataError',
            )
        })
    })

    describe('ensureHttpResponseOk', () => {
        it('should let the Response pass through if it is ok', async () => {
            const result =
                await fetchResult(validDataUrl).andThen(ensureHttpResponseOk)

            expect(result.isOk()).toBe(true)
            expect(result._unsafeUnwrap()).toBeInstanceOf(Response)
        })

        it('should return a NotOkHttpResponseError if the Response is not ok', async () => {
            const result =
                await fetchResult(nonOkResponseUrl).andThen(
                    ensureHttpResponseOk,
                )

            expect(result.isErr()).toBe(true)
            expect(result._unsafeUnwrapErr()._tag).toBe(
                'NotOkHttpResponseError',
            )
        })
    })
})
