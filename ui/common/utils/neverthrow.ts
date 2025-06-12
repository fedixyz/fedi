import { Result, ResultAsync } from 'neverthrow'
import { ZodSchema, z } from 'zod'

import { FetchError, MalformedDataError } from '../types/errors'
import { tryTag, UnexpectedError } from './errors'

/**
 * Attempts to pass data through a zod schema
 * If parsing fails, bubbles up a `MalformedDataError`
 * Otherwise, casts the result to the inferred type of the schema
 *
 * @example
 * ```typescript
 * const zodSchema = z.object({ foo: z.string() })
 * const result: Result<unknown, Error> = ...
 *
 * result
 *   .andThen(throughSchema(zodSchema))
 *   .match(
 *     ok => { // `{ foo: string }`
 *       console.log('parsed data', ok)
 *     },
 *     err => { // `SchemaValidationError`
 *       console.log('failed to parse data', err.message)
 *     }
 *   )
 * ```
 */
export const throughZodSchema = <T extends ZodSchema>(schema: T) => {
    const parse = (data: unknown): z.infer<T> => schema.parse(data)
    return Result.fromThrowable(parse, tryTag('SchemaValidationError'))
}

/**
 * Attempts to perform a safe `fetch()` call
 * If the fetch fails, bubbles up a `FetchError`
 *
 * @example
 * ```typescript
 * await fetchResult(url)
 *   .match(
 *     res => console.log('request is', res.ok ? 'ok' : 'not ok'),
 *     err => { // `FetchError`
 *       console.log('request failed', err.message)
 *     }
 *   )
 * ```
 */
export const fetchResult = (
    ...args: Parameters<typeof fetch>
): ResultAsync<Response, FetchError | UnexpectedError> =>
    ResultAsync.fromPromise(fetch(...args), tryTag('FetchError'))

/**
 * Attempts to parse a `Response` as JSON
 * If parsing fails, bubbles up a `MalformedDataError`
 *
 * @example
 * ```typescript
 * await fetchResult(lnurl)
 *   .andThen(thenJson)
 *   .match(
 *     ok => console.log(ok),
 *     err => { // `MalformedDataError | FetchError`
 *       console.log('lnurl request failed', err.message)
 *     }
 *   )
 * ```
 */
export const thenJson = (
    res: Response,
): ResultAsync<unknown, MalformedDataError | UnexpectedError> =>
    ResultAsync.fromPromise(res.json(), tryTag('MalformedDataError'))

/**
 * Attempts to construct a `URL` from a string or a `URL`
 * If the URL fails to be constructed, bubbles up a `UrlParseError`
 *
 * @example
 * ```typescript
 * constructUrl('https://example.com')
 *   .match(
 *     ok => console.log('constructed url', ok),
 *     err => { // `UrlParseError`
 *       console.log('failed to parse url', err.message)
 *     }
 *   )
 * ```
 */
export const constructUrl = Result.fromThrowable(
    (...args: ConstructorParameters<typeof URL>) => new URL(...args),
    tryTag('UrlParseError'),
)
