import { ZodError } from 'zod'

/**
 * Maps our custom error kinds to the base constructor for that error type
 */
export const TagToErrorConstructorMap = {
    UrlConstructError: TypeError,
    GenericError: Error,
    MissingDataError: Error,
    MalformedDataError: Error,
    FetchError: Error,
    SchemaValidationError: ZodError,
    TimeoutError: Error,
    UserError: Error,
}
