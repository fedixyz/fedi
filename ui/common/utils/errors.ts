import { TagToErrorConstructorMap } from '../constants/errors'
import { ErrorCode, RpcError } from '../types/bindings'
import { ErrorTag, TaggedError } from '../types/errors'

/**
 * Used when a fedimint bridge rpc call fails
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
 * Used when a TaggedError fails to be be constructed from an unknown value
 */
export class UnexpectedError extends Error {
    public _tag = 'UnexpectedError' as const
    unexpectedError: unknown

    constructor(_unexpectedError: unknown, attemptedTag: string) {
        super(`Failed to construct ${attemptedTag} from unknown value`)
        this.unexpectedError = _unexpectedError
    }
}

function isErrorInstance<T extends ErrorTag>(
    e: unknown,
    tag: T,
): e is (typeof TagToErrorConstructorMap)[T] {
    const cstr = TagToErrorConstructorMap[tag]
    return e instanceof cstr
}

export function makeError<T extends ErrorTag>(e: unknown, tag: T) {
    if (isErrorInstance(e, tag)) {
        return Object.assign(e, {
            _tag: tag,
        }) satisfies TaggedError<T>
    }
    return new UnexpectedError(e, tag)
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
 *   // URLParseError | UnexpectedError
 *   tryTag('UrlParseError')
 * )
 * ```
 */
export function tryTag<T extends ErrorTag>(_tag: T) {
    return (e: unknown) => makeError(e, _tag)
}
