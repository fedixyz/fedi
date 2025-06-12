import { TagToErrorConstructorMap } from '../constants/errors'

export type TaggedError<T extends keyof typeof TagToErrorConstructorMap> =
    (typeof TagToErrorConstructorMap)[T] & {
        _tag: T
    }

export type UrlParseError = TaggedError<'UrlParseError'>
export type GenericError = TaggedError<'GenericError'>
export type MissingDataError = TaggedError<'MissingDataError'>
export type MalformedDataError = TaggedError<'MalformedDataError'>
export type SchemaValidationError = TaggedError<'SchemaValidationError'>
export type FetchError = TaggedError<'FetchError'>

export type ErrorTag = keyof typeof TagToErrorConstructorMap
