import { err, errAsync } from 'neverthrow'

import { ErrorCode, RpcError } from '../types/bindings'
import { ErrorTag } from '../types/errors'

export class TaggedError<T extends ErrorTag> extends Error {
    public _tag: T

    constructor(tag: T, cause?: unknown) {
        super(tag)

        this._tag = tag
        this.cause = cause
    }

    /**
     * Chainable method that adds a message to the `TaggedError` instance
     */
    public withMessage(message: string) {
        this.message = message

        return this
    }

    /** Wraps the error instance in a `neverthrow` `err()` */
    public intoErr() {
        return err(this)
    }

    /** Wraps the error instance in a `neverthrow` `errAsync()` */
    public intoErrAsync() {
        return errAsync(this)
    }
}

/**
 * Specific error type used when a fedimint bridge rpc call fails
 */
export class BridgeError extends TaggedError<'BridgeError'> {
    public _tag = 'BridgeError' as const
    public detail: string
    public error: string
    public errorCode: ErrorCode | null

    constructor(json: RpcError, cause?: unknown) {
        super('BridgeError', cause)
        this.error = json.error
        this.errorCode = json.errorCode
        this.detail = json.detail
        this.message = `BridgeError: ${this.error}`
    }
}
