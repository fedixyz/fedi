import { TaggedError } from '../../../utils/errors'

describe('errors', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('TaggedError', () => {
        it('.withMessage() should attach a message to the tagged error', () => {
            const error = new TaggedError('GenericError').withMessage('test')

            expect(error._tag).toBe('GenericError')
            expect(error.message).toBe('test')
        })

        it('should populate `.cause` if a second arg is passed into TaggedError', () => {
            const cause = new Error('lol')
            const error = new TaggedError('UserError', cause)

            expect(error.cause).toBe(cause)
        })

        it('.intoErr() / .intoErrAsync() should return the TaggedError wrapped in a neverthrow err() / errAsync()', async () => {
            const error = new TaggedError('GenericError')

            const neverthrowErr = error.intoErr()
            const neverthrowErrAsync = await error.intoErrAsync()

            expect(neverthrowErr.isErr()).toBe(true)
            expect(neverthrowErr._unsafeUnwrapErr()).toBe(error)
            expect(neverthrowErrAsync.isErr()).toBe(true)
            expect(neverthrowErrAsync._unsafeUnwrapErr()).toBe(error)
        })
    })
})
