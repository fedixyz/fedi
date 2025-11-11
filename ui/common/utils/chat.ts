import { TFunction } from 'i18next'
import orderBy from 'lodash/orderBy'
import { z } from 'zod'

import { Chat, ChatMessage, ChatType } from '@fedi/common/types'

import {
    BANNED_DISPLAY_NAME_TERMS,
    GUARDIANITO_BOT_DISPLAY_NAME,
} from '../constants/matrix'
import { wordListFirst, wordListLast } from '../constants/words'

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
const createDisplayNameValidator = (
    options: {
        allowBot?: boolean
    } = {},
) => {
    const { allowBot = false } = options

    return (
        z
            .string()
            // Removes leading/trailing whitespace
            .trim()
            // Validates length
            // Using z.string().refine() instead of z.string().max()
            // to keep return types consistent
            .refine(username => username.length > 0)
            .refine(username => username.length <= 21)
            // Validates No banned words
            .refine(
                username => {
                    // Allow "G-Bot" as an exception if specified
                    if (allowBot && username === GUARDIANITO_BOT_DISPLAY_NAME)
                        return true
                    const lowerUsername = username.toLowerCase()

                    const foundWord = BANNED_DISPLAY_NAME_TERMS.find(word =>
                        lowerUsername.includes(word),
                    )
                    return !foundWord
                },
                { message: 'banned' },
            )
    )
}

/**
 * Validator for displaying/getting display names
 */
export const getDisplayNameValidator = () =>
    createDisplayNameValidator({ allowBot: true })

/**
 * Validator for setting display names
 */
export const setDisplayNameValidator = () =>
    createDisplayNameValidator({ allowBot: false })

export type SetDisplayNameValidatorType = ReturnType<
    typeof setDisplayNameValidator
>
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

/**
 * Parse message text into segments for rendering
 * one or more URLs even when they are embedded in text
 */
export type MessageSegment = {
    type: 'text' | 'url'
    content: string
}

// The "\b" before "https" prevents the regex from matching unwanted content at the beginning (e.g. "asdfhttps://link")
const URL_REGEX = /\bhttps?:\/\/[^\s]+/gi

export function parseMessageText(text: string): MessageSegment[] {
    const segments: MessageSegment[] = []
    let currentIndex = 0

    let match

    while ((match = URL_REGEX.exec(text)) !== null) {
        // Add text before the URL if there is any
        // Validate the URL
        try {
            new URL(match[0])
        } catch {
            // If URL is invalid, treat it as text
            continue
        }

        // Add text before the URL if there is any
        if (match.index > currentIndex) {
            segments.push({
                type: 'text',
                content: text.slice(currentIndex, match.index),
            })
        }
        segments.push({
            type: 'url',
            content: match[0],
        })

        currentIndex = match.index + match[0].length
    }

    // slice off and add the remaining text
    if (currentIndex < text.length) {
        segments.push({
            type: 'text',
            content: text.slice(currentIndex),
        })
    }

    return segments
}

export const deriveUrlsFromText = (text: string) => {
    return parseMessageText(text)
        .filter(segment => segment.type === 'url')
        .map(segment => segment.content)
}

export const generateRandomDisplayName = () => {
    const randomIndexFirst = Math.floor(Math.random() * wordListFirst.length)
    const randomIndexLast = Math.floor(Math.random() * wordListLast.length)

    const firstWord = wordListFirst[randomIndexFirst]
    const lastWord = wordListLast[randomIndexLast]

    return `${firstWord} ${lastWord}`
}
