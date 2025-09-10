import { ok, Result, ResultAsync } from 'neverthrow'
import { ZodSchema, z } from 'zod'

import {
    FetchError,
    MalformedDataError,
    MissingDataError,
    NotOkHttpResponseError,
    UrlConstructError,
} from '../types/errors'
import { TaggedError } from './errors'

/**
 * Attempts to pass unknown data through a zod schema
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
 * ```
 */
export const throughZodSchema = <T extends ZodSchema>(schema: T) => {
    const parse = (data: unknown): z.infer<T> => schema.parse(data)
    return Result.fromThrowable(
        parse,
        e => new TaggedError('SchemaValidationError', e),
    )
}

/**
 * Attempts to perform a safe `fetch()` call
 * If an invalid URL is passed, bubbles up a `UrlConstructError`
 * If the fetch fails, bubbles up a `FetchError`
 * A non-ok status code does **not** result in a `FetchError`
 */
export const fetchResult = (
    ...args: Parameters<typeof fetch>
): ResultAsync<Response, UrlConstructError | FetchError> =>
    ResultAsync.fromPromise(fetch(...args), e => {
        if (e instanceof Error && e.message.includes('URL')) {
            return new TaggedError('UrlConstructError', e)
        }

        return new TaggedError('FetchError', e)
    })

/**
 * Returns a Result based on whether the passed-in Response status is OK or not
 * If OK, allows the original `Response` to pass through
 * Otherwise returns a `NotOkHttpStatusError`
 */
export const ensureHttpResponseOk = (
    res: Response,
): Result<Response, NotOkHttpResponseError> =>
    res.ok
        ? ok(res)
        : new TaggedError('NotOkHttpResponseError')
              .withMessage(`HTTP Response Status not OK, got ${res.status}`)
              .intoErr()

/**
 * Attempts to parse a `Response` as JSON
 * If parsing fails, bubbles up a `MalformedDataError`
 *
 * @example
 * ```typescript
 * await fetchResult(lnurl)
 *   .andThen(thenJson)
 * ```
 */
export const thenJson = (
    res: Response,
): ResultAsync<unknown, MalformedDataError> =>
    ResultAsync.fromPromise(
        res.json(),
        e => new TaggedError('MalformedDataError', e),
    )

/**
 * Attempts to construct a `URL` from a string or a `URL` object
 * If an invalid URL is passed, bubbles up a `UrlConstructError`
 */
export const constructUrl = Result.fromThrowable(
    (...args: ConstructorParameters<typeof URL>) => new URL(...args),
    e => new TaggedError('UrlConstructError', e),
)

/**
 * Ensures that a value is not null or undefined
 * If the value is null or undefined, returns a `MissingDataError`
 *
 * @example
 * ```typescript
 * result
 *   .andThen(ensureNonNullish)
 *   .andThen(value => {
 *     // value is not null or undefined
 *   })
 * ```
 */
export const ensureNonNullish = <T>(
    value: T,
): Result<NonNullable<T>, MissingDataError> => {
    if (value === null || value === undefined)
        return new TaggedError('MissingDataError')
            .withMessage(`Expected non-nullish value, got ${value}`)
            .intoErr()

    return ok(value as NonNullable<T>)
}
