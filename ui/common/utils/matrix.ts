import { TFunction } from 'i18next'
import orderBy from 'lodash/orderBy'
import { z } from 'zod'

import { GLOBAL_MATRIX_SERVER } from '../constants/matrix'
import {
    MSats,
    MatrixEvent,
    MatrixPaymentEvent,
    MatrixPaymentStatus,
    MatrixRoomPowerLevels,
    MatrixTimelineItem,
    MatrixUser,
    SupportedCurrency,
} from '../types'
import amountUtils from './AmountUtils'
import { makeLog } from './log'

const log = makeLog('common/utils/matrix')

export const matrixIdToUsername = (id: string | null | undefined) =>
    id ? id.split(':')[0].replace('@', '') : '?'

export const mxcUrlToHttpUrl = (
    mxcUrl: string,
    width: number,
    height: number,
    method: 'scale' | 'crop' = 'crop',
) => {
    const [serverName, mediaId] = mxcUrl.split('/').slice(2)
    if (!mediaId) return undefined
    const url = new URL(GLOBAL_MATRIX_SERVER)
    url.pathname = `/_matrix/media/r0/thumbnail/${serverName}/${mediaId}`
    if (width) url.searchParams.set('width', width.toString())
    if (height) url.searchParams.set('height', height.toString())
    if (method) url.searchParams.set('method', method)
    return url.toString()
}

const contentSchemas = {
    /* Matrix standard events, not an exhaustive list */
    'm.text': z.object({
        msgtype: z.literal('m.text'),
        body: z.string(),
    }),
    'm.notice': z.object({
        msgtype: z.literal('m.notice'),
        body: z.string(),
    }),
    'm.image': z.object({
        msgtype: z.literal('m.image'),
        body: z.string(),
        info: z.object({
            mimetype: z.string(),
            size: z.number(),
            w: z.number(),
            h: z.number(),
        }),
    }),
    'm.video': z.object({
        msgtype: z.literal('m.video'),
        body: z.string(),
        url: z.string(),
        info: z.object({
            mimetype: z.string(),
            size: z.number(),
            w: z.number(),
            h: z.number(),
            duration: z.number(),
        }),
    }),
    'm.emote': z.object({
        msgtype: z.literal('m.emote'),
        body: z.string(),
    }),
    /**
     * Fedi custom events
     *
     * WARNING: Any non-backwards compatible changes to these will cause old
     * messages to not render properly anymore. They will fail validation, and
     * be sent to the frontend as "m.unknown" with only the body intact. New
     * fields should either be `.optional()`, or consider making a new type.
     */
    'xyz.fedi.payment': z.object({
        msgtype: z.literal('xyz.fedi.payment'),
        body: z.string(),
        status: z.nativeEnum(MatrixPaymentStatus),
        /**
         * Client-side generated unique identifier for the payment, used across
         * multiple events to indicate updates to the same payment.
         */
        paymentId: z.string(),
        /**
         * The matrix id of the user who will receive this payment.
         */
        recipientId: z.string(),
        /**
         * The amount of the payment, either requested or sent.
         */
        amount: z.number(),
        /**
         * The matrix id of the user who sent the payment.
         *
         * TODO: Validation that this exists for certain MatrixPaymentStatus.
         */
        senderId: z.string().optional(),
        /**
         * The ecash token attached to the payment.
         *
         * TODO: Validation that this exists for certain MatrixPaymentStatus.
         * TODO: Encrypt this using some information from the intended recipient,
         * to enable payments in group chats.
         */
        ecash: z.string().optional(),
        /**
         * The federation this payment was made in, or is expected to be received in.
         *
         * TODO: Potentially make this optional, allow anyone to pay to using any
         * federation they have in common, or via bolt11 (see more below.)
         */
        federationId: z.string(),

        // TODO: Attach bolt11 to payment requests, and allow to pay that way
        // if no federations in common?
        // bolt11: z.string().optional(),

        // TODO: Attach invite code for federations you belong to that have
        // invites enabled, and allow people to join to accept ecash?
        // inviteCode: z.string().optional(),
    }),
}

interface MatrixEventUnknownContent {
    msgtype: 'm.unknown'
    body: string
    originalContent: unknown
}

export type MatrixEventContent =
    | z.infer<(typeof contentSchemas)[keyof typeof contentSchemas]>
    | MatrixEventUnknownContent

export function formatMatrixEventContent(content: unknown): MatrixEventContent {
    try {
        const msgType = (content as { msgtype: keyof typeof contentSchemas })
            .msgtype
        const schema = contentSchemas[msgType]
        if (!schema) throw new Error('Unknown message type')
        return schema.parse(content)
    } catch (err) {
        log.warn('Failed to parse matrix event content', err, content)
        return {
            msgtype: 'm.unknown',
            body:
                (content as { body: string | undefined })?.body ||
                'Unknown message type',
            originalContent: content,
        }
    }
}

/**
 * Given a list of events, organize the events in a nested list of "grouped"
 * messages. The groups are organized as follows:
 * - The outer-most list is split into groups of messages sent within a similar time-frame.
 * - The middle list is messages sent back-to-back by the same user in that time frame.
 * - The inner-most lists are the list of messages by that user.
 */
export function makeMatrixEventGroups(
    events: MatrixEvent[],
    sortOrder: 'desc' | 'asc',
): MatrixEvent[][][] {
    const eventGroups: MatrixEvent[][][] = []
    let currentTimeGroup: MatrixEvent[][] = []
    let lastEvent: MatrixEvent | null = null

    const sortedEvents = orderBy(events, 'timestamp', sortOrder)
    for (const event of sortedEvents) {
        if (
            lastEvent &&
            lastEvent.timestamp &&
            event.timestamp &&
            Math.abs(lastEvent.timestamp - event.timestamp) <= 60_000
        ) {
            let isSameSender = false
            if (lastEvent.senderId === event.senderId) {
                isSameSender = true
            }

            if (isSameSender) {
                // Add the message to the current group of the last sender group
                currentTimeGroup[currentTimeGroup.length - 1].push(event)
            } else {
                // Create a new sender group within the current time group
                currentTimeGroup.push([event])
            }
        } else {
            // Start a new time group with the current message
            currentTimeGroup = [[event]]
            eventGroups.push(currentTimeGroup)
        }

        lastEvent = event
    }

    return eventGroups
}

export function getRoomEventPowerLevel(
    powerLevels: MatrixRoomPowerLevels,
    events: string | string[],
) {
    if (typeof events === 'string') {
        events = [events]
    }
    for (const event of events) {
        const level = powerLevels.events?.[event]
        if (typeof level === 'number') {
            return level
        }
    }
    return powerLevels.events_default || 0
}

export const makeMatrixPaymentText = ({
    t,
    event,
    myId,
    eventSender,
    paymentSender,
    paymentRecipient,
    currency,
    btcExchangeRate,
}: {
    t: TFunction
    event: MatrixPaymentEvent
    myId: string
    eventSender: MatrixUser | null | undefined
    paymentSender: MatrixUser | null | undefined
    paymentRecipient: MatrixUser | null | undefined
    currency: SupportedCurrency
    btcExchangeRate: number
}): string => {
    const {
        senderId: eventSenderId,
        content: {
            recipientId: paymentRecipientId,
            senderId: paymentSenderId,
            amount,
        },
    } = event

    const previewStringParams = {
        name: eventSender?.displayName || matrixIdToUsername(eventSenderId),
        recipient:
            paymentRecipient?.displayName ||
            matrixIdToUsername(paymentRecipientId),
        fiat: `${amountUtils.formatFiat(
            amountUtils.msatToBtc(amount as MSats) * btcExchangeRate,
            currency,
            { symbolPosition: 'none' },
        )} ${currency}`,
        amount: amountUtils.formatNumber(
            amountUtils.msatToSat(amount as MSats),
        ),
        unit: 'SATS',
        memo: '',
    }

    if (eventSenderId === paymentRecipientId) {
        if (eventSenderId === myId) {
            return t('feature.chat.you-requested-payment', previewStringParams)
        } else {
            return t('feature.chat.they-requested-payment', previewStringParams)
        }
    } else if (paymentRecipientId === myId) {
        return t('feature.chat.they-sent-payment', previewStringParams)
    } else if (paymentSenderId === myId) {
        return t('feature.chat.you-sent-payment', previewStringParams)
    } else {
        return t('feature.chat.other-sent-payment', {
            ...previewStringParams,
            name:
                paymentSender?.displayName ||
                matrixIdToUsername(paymentSenderId),
            recipient:
                eventSender?.displayName || matrixIdToUsername(eventSenderId),
        })
    }
}

export function isPaymentEvent(
    event: MatrixEvent,
): event is MatrixPaymentEvent {
    return event.content.msgtype === 'xyz.fedi.payment'
}

export function getReceivablePaymentEvents(
    timeline: MatrixTimelineItem[],
    myId: string,
) {
    const latestPayments: Record<string, MatrixPaymentEvent> = {}
    timeline.forEach(item => {
        if (item === null) return
        if (!isPaymentEvent(item)) return
        if (item.content.recipientId !== myId) return
        latestPayments[item.content.paymentId] = item
    })
    return Object.values(latestPayments).reduce((prev, event) => {
        if (
            [MatrixPaymentStatus.accepted, MatrixPaymentStatus.pushed].includes(
                event.content.status,
            )
        ) {
            prev.push(event)
        }
        return prev
    }, [] as MatrixPaymentEvent[])
}

export function encodeFediMatrixUserUri(id: string) {
    return `fedi:user:${id}`
}

export function decodeFediMatrixUserUri(uri: string) {
    // Decode both fedi:user:{id} and fedi://user:{id}
    const match = uri.match(/^fedi(?::|:\/\/)user:(.+)$/i)
    if (!match) throw new Error('feature.chat.invalid-member')

    // Validate that it's a valid matrix user id
    const id = match[1]
    if (!isValidMatrixUserId(id)) throw new Error('feature.chat.invalid-member')
    return id
}

export function isValidMatrixUserId(id: string) {
    return /^@[^:]+:.+$/.test(id)
}
