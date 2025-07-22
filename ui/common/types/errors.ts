import { TagToErrorConstructorMap } from '../constants/errors'

export type ErrorTag = keyof typeof TagToErrorConstructorMap
export type TaggedError<T extends keyof typeof TagToErrorConstructorMap> =
    InstanceType<(typeof TagToErrorConstructorMap)[T]> & {
        _tag: T
    }

/**
 * Specific error type for when a URL fails to be constructed
 * Used when methods throw a `TypeError` for invalid URLs
 */
export type UrlConstructError = TaggedError<'UrlConstructError'>
/**
 * Generic error type when a throwable method fails for a variety of unknown reasons
 * Should be avoided when possible
 */
export type GenericError = TaggedError<'GenericError'>
/**
 * Generic error type used when expected data is missing
 */
export type MissingDataError = TaggedError<'MissingDataError'>
/**
 * Generic error type used when expected data is malformed
 */
export type MalformedDataError = TaggedError<'MalformedDataError'>
/**
 * Specific error type for when data does not match the structure of a zod schema
 * Used when zod schema validation throws a `ZodError`
 */
export type SchemaValidationError = TaggedError<'SchemaValidationError'>
/**
 * Generic error type related to data fetching
 * Used for when HTTP requests are not ok, etc
 */
export type FetchError = TaggedError<'FetchError'>
/**
 * Generic error type related to timeouts
 * Used for when a timeout is reached
 */
export type TimeoutError = TaggedError<'TimeoutError'>
/**
 * Generic error type used when a user error occurs
 * Used for when an error is a result of a user action
 */
export type UserError = TaggedError<'UserError'>
