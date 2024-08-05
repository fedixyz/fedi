import type { JID } from '@xmpp/jid'
import { TFunction } from 'i18next'
import orderBy from 'lodash/orderBy'
import { z } from 'zod'

import {
    Chat,
    ChatMember,
    ChatMessage,
    ChatType,
    MSats,
} from '@fedi/common/types'

import { BANNED_DISPLAY_NAME_TERMS } from '../constants/matrix'
import { FormattedAmounts } from '../hooks/amount'

/** @deprecated XMPP legacy code */
export const makePaymentText = (
    t: TFunction,
    message: ChatMessage,
    authenticatedMember: ChatMember | null,
    makeFormattedAmountsFromMSats: (amt: MSats) => FormattedAmounts,
): string => {
    const { sentBy, sentTo, payment } = message
    const messageSentBy: string = sentBy.split('@')[0]
    const messageSentTo: string = sentTo?.split('@')[0] || ''
    const me: string = authenticatedMember?.username || ''
    if (!payment) return ''

    const paymentRecipient: string | undefined =
        payment.recipient?.split('@')[0]
    const paymentAmount: MSats = payment.amount
    const paymentMemo: string | undefined = payment.memo

    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromMSats(paymentAmount)
    const previewStringParams = {
        name: messageSentBy,
        fiat: formattedPrimaryAmount,
        amount: formattedSecondaryAmount,
        memo: paymentMemo,
    }

    if (messageSentTo === me && paymentRecipient === me) {
        return t('feature.chat.they-sent-payment', previewStringParams)
    }
    if (messageSentTo === me && paymentRecipient !== me) {
        return t('feature.chat.they-requested-payment', previewStringParams)
    }
    if (messageSentTo !== me && paymentRecipient !== me) {
        return t('feature.chat.you-sent-payment', previewStringParams)
    }
    if (messageSentTo !== me && paymentRecipient === me) {
        return t('feature.chat.you-requested-payment', previewStringParams)
    }

    return ''
}

export const jidToId = (jid: JID | string) => {
    // Remove resource, leave local + domain
    const jidString = jid.toString()
    return jidString.split('/')[0]
}

/**
 * @deprecated XMPP legacy code
 *
 * Given a list of messages, organize the messages in a nested list of "grouped"
 * messages. The groups are organized as follows:
 * - The outer-most list is split into groups of messages sent within a similar time-frame.
 * - The middle list is messages sent back-to-back by the same user in that time frame.
 * - The inner-most lists are the list of messages by that user.
 */
export const makeMessageGroups = <T extends ChatMessage>(
    messages: T[],
    sortOrder: 'desc' | 'asc',
): T[][][] => {
    const messageGroups: T[][][] = []
    let currentTimeGroup: T[][] = []
    let lastMessage: T | null = null

    const sortedMessages = orderBy(messages, 'sentAt', sortOrder)
    for (const message of sortedMessages) {
        if (
            lastMessage &&
            lastMessage.sentAt &&
            message.sentAt &&
            Math.abs(lastMessage.sentAt - message.sentAt) <= 600
        ) {
            let isSameSender = false
            if (lastMessage.sentBy === message.sentBy) {
                isSameSender = true
            }

            if (isSameSender) {
                // Add the message to the current group of the last sender group
                currentTimeGroup[currentTimeGroup.length - 1].push(message)
            } else {
                // Create a new sender group within the current time group
                currentTimeGroup.push([message])
            }
        } else {
            // Start a new time group with the current message
            currentTimeGroup = [[message]]
            messageGroups.push(currentTimeGroup)
        }

        lastMessage = message
    }

    return messageGroups
}

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
    const lastReadMessageIds = sortedMessages.reduce((readMsgIds, msg) => {
        const chatId = getChatInfoFromMessage(msg, myId).id
        if (!readMsgIds[chatId]) {
            readMsgIds[chatId] = msg.id
        }
        return readMsgIds
    }, {} as Record<Chat['id'], string | undefined>)
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
 * Returns a timestamp for when an existing payment is updated at.
 * Ensures the timestamp is always greater, in case of clocks being out of sync.
 */
export const makePaymentUpdatedAt = (
    payment: { updatedAt?: number } | undefined,
) => {
    return Math.max(
        Math.floor(Date.now() / 1000),
        (payment?.updatedAt || 0) + 1,
    )
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
