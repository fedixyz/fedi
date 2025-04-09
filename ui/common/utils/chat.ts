import { TFunction } from 'i18next'
import orderBy from 'lodash/orderBy'
import { z } from 'zod'

import { Chat, ChatMessage, ChatType } from '@fedi/common/types'

import { BIP39_WORD_LIST } from '../constants/bip39'
import { BANNED_DISPLAY_NAME_TERMS } from '../constants/matrix'

/**
 * Given a message, return its chat ID and the type of chat (direct or group).
 */
export const getChatInfoFromMessage = <T extends ChatMessage>(
    message: T,
    myId: string,
) => {
    const { sentTo, sentIn, sentBy } = message
    let id: string
    let type: ChatType

    if (sentIn) {
        type = ChatType.group
        id = sentIn
    } else if (sentTo && sentBy) {
        type = ChatType.direct
        id = sentBy === myId ? sentTo : sentBy
    } else {
        throw new Error('Message has no sentIn, or sentTo & sentBy')
    }

    return { id, type }
}

/**
 * Given a list of messages, return the latest in the list.
 */
export const getLatestMessage = <T extends ChatMessage>(
    messages: T[],
): T | null => {
    return (
        messages.reduce(
            (prev, msg) =>
                (prev.sentAt || 0) > (msg.sentAt || 0) ? prev : msg,
            messages[0],
        ) || null
    )
}

/**
 * Given a list of messages, return the one with the latest payment update
 */
export const getLatestPaymentUpdate = <T extends ChatMessage>(
    messages: T[],
): T | null => {
    // ignore messages without payments
    const messagesWithPayments = messages.filter(m => m.payment)
    return (
        messagesWithPayments.reduce(
            (prev, msg) =>
                (prev.payment?.updatedAt || 0) > (msg.payment?.updatedAt || 0)
                    ? prev
                    : msg,
            messagesWithPayments[0],
        ) || null
    )
}

/**
 * Given a list of messages, return a map keyed by the chat ID and with a value
 * of the latest message ID in that chat.
 */
export const getLatestMessageIdsForChats = (
    messages: ChatMessage[],
    myId: string,
) => {
    const sortedMessages = orderBy(messages, 'sentAt', 'desc')
    const lastReadMessageIds = sortedMessages.reduce(
        (readMsgIds, msg) => {
            const chatId = getChatInfoFromMessage(msg, myId).id
            if (!readMsgIds[chatId]) {
                readMsgIds[chatId] = msg.id
            }
            return readMsgIds
        },
        {} as Record<Chat['id'], string | undefined>,
    )
    return lastReadMessageIds
}

/**
 * Given a list of messages, return a map keyed by the chat ID and with a value
 * of the latest payment update message ID in that chat.
 */
export const getLatestPaymentUpdateIdsForChats = (
    messages: ChatMessage[],
    myId: string,
) => {
    const messagesWithPayments = messages.filter(m => m.payment)

    const sortedMessages = orderBy(
        messagesWithPayments,
        [message => message.payment?.updatedAt],
        ['desc'],
    )
    const lastReadPaymentUpdateIds = sortedMessages.reduce(
        (readMsgIds, msg) => {
            const chatId = getChatInfoFromMessage(msg, myId).id
            if (!readMsgIds[chatId]) {
                readMsgIds[chatId] = `${msg.id}_${msg.payment?.updatedAt || 0}`
            }
            return readMsgIds
        },
        {} as Record<Chat['id'], string | undefined>,
    )
    return lastReadPaymentUpdateIds
}

/**
 * Validates a user-entered displayName against the following criteria:
 *  - length <= 21
 *  - must be lowercase
 *  - must not include any banned term
 */
export const getDisplayNameValidator = () =>
    z
        .string()
        // Removes leading/trailing whitespace
        .trim()
        // Validates length
        // Using z.string().refine() instead of z.string().max()
        // to keep return types consistent
        .refine(username => username.length <= 21)
        // Validates all lowercase
        .refine(username => !/[A-Z]/.test(username))
        // Validates No banned words
        .refine(
            username => {
                const lowerUsername = username.toLowerCase()
                const foundWord = BANNED_DISPLAY_NAME_TERMS.find(word =>
                    lowerUsername.includes(word),
                )
                return !foundWord
            },
            { message: 'banned' },
        )

export type DisplayNameValidatorType = ReturnType<
    typeof getDisplayNameValidator
>

type ParsedResult =
    | {
          success: true
          data: string
      }
    | {
          success: false
          errorMessage: string
      }

// Ref: https://zod.dev/?id=inferring-the-inferred-type
export const parseData = <T extends z.ZodTypeAny>(
    data: unknown,
    schema: T,
    t: TFunction,
): ParsedResult => {
    const parsed = schema.safeParse(data) as z.infer<T>
    if (parsed.success) return { success: true, data: parsed.data }

    const message = parsed.error.errors[0].message
    // handle banned_words
    if (message === 'banned')
        return {
            success: false,
            errorMessage: t('errors.invalid-username-banned'),
        }
    return { success: false, errorMessage: t('errors.invalid-username') }
}

export const deriveUrlsFromText = (text: string) => {
    // The "\b" before "https" prevents the regex from matching uwanted content at the beginning (e.g. "asdfhttps://link")
    return (
        text.match(/\bhttps?:\/\/[^\s]+/gi)?.filter(url => {
            try {
                // There is an eslint rule preventing you from calling `new Class()` without using it
                return Boolean(new URL(url))
            } catch {
                return false
            }
        }) ?? []
    )
}

export const generateRandomDisplayName = (length: number) => {
    const words = []
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * BIP39_WORD_LIST.length)
        words.push(BIP39_WORD_LIST[randomIndex])
    }

    return words.join(' ')
}
