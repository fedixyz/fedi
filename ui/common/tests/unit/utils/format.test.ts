import { TFunction } from 'i18next'

import { MAX_CHAT_REACTION_EMOJIS } from '../../../constants/matrix'
import { BridgeError } from '../../../utils/errors'
import { formatErrorMessage } from '../../../utils/format'

describe('formatErrorMessage', () => {
    it('passes the reaction limit into the translated error message', () => {
        const t = jest.fn((key: string) => key) as unknown as TFunction

        formatErrorMessage(t, new Error('errors.chat-reaction-limit-exceeded'))

        expect(t).toHaveBeenCalledWith('errors.chat-reaction-limit-exceeded', {
            limit: MAX_CHAT_REACTION_EMOJIS,
        })
    })

    it('passes the reaction limit into bridge reaction limit errors', () => {
        const t = jest.fn((key: string) => key) as unknown as TFunction
        const err = new BridgeError({
            error: 'Message reaction limit exceeded',
            detail: '',
            errorCode: 'matrixReactionLimitExceeded',
        })

        formatErrorMessage(t, err)

        expect(t).toHaveBeenCalledWith('errors.chat-reaction-limit-exceeded', {
            limit: MAX_CHAT_REACTION_EMOJIS,
        })
    })
})
