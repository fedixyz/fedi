import { TFunction } from 'i18next'

import { TagToErrorConstructorMap } from '../constants/errors'
import { ErrorCode, RpcError } from '../types/bindings'
import { ErrorTag, TaggedError } from '../types/errors'

/**
 * Specific error type used when a fedimint bridge rpc call fails
 */
export class BridgeError extends Error {
    public _tag = 'BridgeError' as const
    public detail: string
    public error: string
    public errorCode: ErrorCode | null

    constructor(json: RpcError) {
        super(`BridgeError: ${json.error}`)
        this.error = json.error
        this.errorCode = json.errorCode
        this.detail = json.detail
    }

    static tryFrom(e: unknown): BridgeError | UnexpectedError {
        if (e instanceof BridgeError) return e

        return new UnexpectedError(e, 'BridgeError')
    }
}

/**
 * Specific error type used when a TaggedError fails to be be constructed from an unknown value
 */
export class UnexpectedError extends Error {
    public _tag = 'UnexpectedError' as const
    unexpectedError: unknown

    constructor(_unexpectedError: unknown, attemptedTag: string) {
        let unknownValue = 'unknown value'

        // If the unexpected error is a result of an already-tagged error,
        // display the original error tag instead of 'unknown value'
        if (
            _unexpectedError instanceof Error &&
            '_tag' in _unexpectedError &&
            typeof _unexpectedError._tag === 'string'
        ) {
            unknownValue = _unexpectedError._tag
        }

        super(`Failed to construct ${attemptedTag} from ${unknownValue}`)
        this.unexpectedError = _unexpectedError
    }
}

export function isErrorInstance<T extends ErrorTag>(
    e: unknown,
    tag: T,
): e is InstanceType<(typeof TagToErrorConstructorMap)[T]> {
    const cstr = TagToErrorConstructorMap[tag]
    return e instanceof cstr
}

function hasTag(e: unknown): e is TaggedError<ErrorTag> {
    if (typeof e !== 'object' || e === null) return false
    return '_tag' in e
}

export function makeError<T extends ErrorTag>(e: unknown, tag: T) {
    if (isErrorInstance(e, tag) && !hasTag(e)) {
        return Object.assign(e, {
            _tag: tag,
        }) satisfies TaggedError<T>
    }

    return new UnexpectedError(e, tag)
}

export function makeLocalizedError<T extends ErrorTag>(
    t: TFunction,
    tag: T,
    ...params: Parameters<typeof t>
) {
    return makeError(new Error(t(...params)), tag)
}

/**
 * Checks to see if an unknown value is an instance of a given error-like constructor
 * and attempts to tag it.
 *
 * Upon failure, returns an `UnexpectedError` with the original error.
 *
 * @example
 * ```typescript
 * ResultAsync.fromPromise(
 *   promise,
 *   // UrlConstructError | UnexpectedError
 *   tryTag('UrlConstructError')
 * )
 * ```
 */
export function tryTag<T extends ErrorTag>(_tag: T) {
    return (e: unknown) => makeError(e, _tag)
}
