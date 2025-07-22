import { err, ok, Result, ResultAsync } from 'neverthrow'
import { ZodSchema, z } from 'zod'

import {
    FetchError,
    MalformedDataError,
    MissingDataError,
    UrlConstructError,
} from '../types/errors'
import { isErrorInstance, makeError, tryTag, UnexpectedError } from './errors'

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
    return Result.fromThrowable(parse, tryTag('SchemaValidationError'))
}

/**
 * Attempts to perform a safe `fetch()` call
 * If an invalid URL is passed, bubbles up a `UrlConstructError`
 * If the fetch fails, bubbles up a `FetchError`
 * A non-ok status code does **not** result in a `FetchError`
 */
export const fetchResult = (
    ...args: Parameters<typeof fetch>
): ResultAsync<Response, UrlConstructError | FetchError | UnexpectedError> =>
    ResultAsync.fromPromise(fetch(...args), e => {
        if (
            isErrorInstance(e, 'UrlConstructError') &&
            e.message.includes('URL')
        ) {
            return makeError(e, 'UrlConstructError')
        }

        return makeError(e, 'FetchError')
    })

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
): ResultAsync<unknown, MalformedDataError | UnexpectedError> =>
    ResultAsync.fromPromise(res.json(), tryTag('MalformedDataError'))

/**
 * Attempts to construct a `URL` from a string or a `URL` object
 * If an invalid URL is passed, bubbles up a `UrlConstructError`
 */
export const constructUrl = Result.fromThrowable(
    (...args: ConstructorParameters<typeof URL>) => new URL(...args),
    tryTag('UrlConstructError'),
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
): Result<NonNullable<T>, MissingDataError | UnexpectedError> => {
    if (value === null || value === undefined)
        return err(
            makeError(
                new Error(`expected non-nullish value, got ${value}`),
                'MissingDataError',
            ),
        )

    return ok(value as NonNullable<T>)
}
