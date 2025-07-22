import fetchMock from 'jest-fetch-mock'

import { isErrorInstance, makeError, UnexpectedError } from '../../utils/errors'

fetchMock.enableMocks()

describe('errors', () => {
    describe('makeError', () => {
        it('should tag an error if it matches the tag error type', () => {
            // GenericError: Error
            const error = makeError(new Error('test'), 'GenericError')

            expect(error._tag).toBe('GenericError')
        })

        it('should not tag an error if it does not match the tag error type', () => {
            // UrlConstructError: TypeError
            const error = makeError(new Error('test'), 'UrlConstructError')

            expect(error._tag).toBe('UnexpectedError')
        })

        it('should not re-tag an already-tagged error', () => {
            const error1 = makeError(new Error('test'), 'GenericError')
            const error2 = makeError(error1, 'FetchError')

            expect(error1._tag).toBe('GenericError')
            expect(error2._tag).toBe('UnexpectedError')
            expect(error2).toBeInstanceOf(UnexpectedError)
            expect((error2 as UnexpectedError).message).toBe(
                'Failed to construct FetchError from GenericError',
            )
        })

        it('should return an UnexpectedError if the passed-in object is not an Error', () => {
            const strErr = makeError('not an error', 'GenericError')
            const numErr = makeError(1, 'GenericError')
            const boolErr = makeError(true, 'GenericError')
            const nullErr = makeError(null, 'GenericError')
            const undefinedErr = makeError(undefined, 'GenericError')

            expect(strErr._tag).toBe('UnexpectedError')
            expect(numErr._tag).toBe('UnexpectedError')
            expect(boolErr._tag).toBe('UnexpectedError')
            expect(nullErr._tag).toBe('UnexpectedError')
            expect(undefinedErr._tag).toBe('UnexpectedError')
        })
    })

    describe('isErrorInstance', () => {
        it('should return true if the value passed is an instance of the tag error type', () => {
            const error = new Error('Normal Error')

            // GenericError is an Error
            expect(isErrorInstance(error, 'GenericError')).toBe(true)
        })

        it('should return false if the value passed is not an instance of the tag error type', () => {
            const error = new Error('Type Error')

            // UrlConstructError is a TypeError
            expect(isErrorInstance(error, 'UrlConstructError')).toBe(false)
        })

        it('should return true if the value passed extends the tag error type', () => {
            const error = new Error('Normal Error')
            const typeError = new TypeError('Type Error')
            const syntaxError = new SyntaxError('Syntax Error')
            const uriError = new URIError('URI Error')
            const rangeError = new RangeError('Range Error')

            expect(isErrorInstance(error, 'GenericError')).toBe(true)
            expect(isErrorInstance(typeError, 'GenericError')).toBe(true)
            expect(isErrorInstance(syntaxError, 'GenericError')).toBe(true)
            expect(isErrorInstance(uriError, 'GenericError')).toBe(true)
            expect(isErrorInstance(rangeError, 'GenericError')).toBe(true)
        })
    })
})
