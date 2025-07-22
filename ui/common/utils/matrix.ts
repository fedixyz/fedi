import { TFunction, type ResourceKey } from 'i18next'
import orderBy from 'lodash/orderBy'
import { z } from 'zod'

import { toSha256EncHex } from '@fedi/common/utils/EncryptionUtils'

import { GLOBAL_MATRIX_SERVER } from '../constants/matrix'
import { FormattedAmounts } from '../hooks/amount'
import {
    InputMedia,
    LoadedFederation,
    MSats,
    MatrixEvent,
    MatrixFormEvent,
    MatrixGroupPreview,
    MatrixPaymentEvent,
    MatrixPaymentStatus,
    MatrixRoom,
    MatrixRoomMember,
    MatrixRoomPowerLevels,
    MatrixTimelineItem,
    MatrixUser,
    MultispendDepositEvent,
    MultispendListedInvitationEvent,
    MultispendRole,
    MultispendTransactionListEntry,
    MultispendWithdrawalEvent,
} from '../types'
import {
    WithdrawalResponseType,
    GroupInvitation,
    MultispendGroupVoteType,
    MultispendEvent,
    RpcMultispendGroupStatus,
    RpcTimelineEventItemId,
    RpcUserId,
    MultispendListedEvent,
    RpcTransaction,
} from '../types/bindings'
import { makeLog } from './log'
import { constructUrl } from './neverthrow'
import { isBolt11 } from './parser'

const log = makeLog('common/utils/matrix')

/**
 * Gets a localized text using i18n key if available, otherwise falls back to default text
 */
export const getLocalizedTextWithFallback = (
    t: TFunction,
    i18nKey?: string | null,
    fallbackText?: string | null,
): string => {
    if (!i18nKey) return fallbackText || ''

    const localizedText = t(i18nKey as ResourceKey)

    // If the translation function returns the same key, it means no translation was found
    return localizedText !== i18nKey ? localizedText : fallbackText || ''
}

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

// Converts a thumbnail mxc URL generated with `mxcUrlToHttpUrl`
// To the full-quality matrix download URL
export const mxcHttpUrlToDownloadUrl = (url: string) => {
    return constructUrl(url)
        .map(u => {
            u.searchParams.delete('width')
            u.searchParams.delete('height')
            u.searchParams.delete('method')
            u.pathname = u.pathname.replace('thumbnail', 'download')
            return u
        })
        .match(
            u => u.toString(),
            () => url,
        )
}

const encryptedFileSchema = z
    .object({
        hashes: z.object({
            sha256: z.string(),
        }),
        url: z.string().url(),
        v: z.literal('v2'),
    })
    // Don't strip off additional decryption keys from the file object
    .passthrough()
/**
 * Filter out payment events that aren't the initial push or request
 * since we only render the original event. Keep track of the latest
 * payment for each payment ID, and replace the initial event's content
 * with the latest content.
 */
export const consolidatePaymentEvents = (events: MatrixEvent[]) => {
    const latestPayments: Record<string, MatrixPaymentEvent> = {}
    // events are already sorted from oldest to newest
    const filteredEvents = events.filter(event => {
        // Return non-payment events as-is
        if (!isPaymentEvent(event)) return true
        // Always set the newest event to the payment ID record map
        latestPayments[event.content.paymentId] = event
        // Only return the payment events that are the initial push or request
        return [
            MatrixPaymentStatus.pushed,
            MatrixPaymentStatus.requested,
        ].includes(event.content.status)
    })
    const consolidatedEvents = filteredEvents.map(event => {
        if (!isPaymentEvent(event)) return event
        const latestPayment = latestPayments[event.content.paymentId]
        if (!latestPayment || event.id === latestPayment.id) return event
        return {
            ...event,
            content: {
                ...event.content,
                ...latestPayment.content,
            },
        }
    })
    return consolidatedEvents
}

/**
 * Filter out multispend events that aren't the initial group invitation
 * or initial withdrawal request. Events for invitation approvals, cancellations,
 * and withdrawal responses are not rendered since the status of the invite or
 * withdrawal is tracked by observing the initial event.
 */
export const filterMultispendEvents = (events: MatrixEvent[]) => {
    return events.filter(
        event =>
            !isMultispendReannounceEvent(event) &&
            !isMultispendInvitationCancelEvent(event) &&
            !isMultispendWithdrawalResponseEvent(event) &&
            !isMultispendInvitationVoteEvent(event),
    )
}

export type MatrixEncryptedFile = z.infer<typeof encryptedFileSchema>

const groupInvitationSchema = z.object({
    federationInviteCode: z.string(),
    federationName: z.string(),
    signers: z.array(z.string()),
    threshold: z.number(),
}) satisfies z.ZodType<GroupInvitation>

const multispendGroupVoteTypeSchema = z.union([
    z.object({
        kind: z.literal('accept'),
        memberPubkey: z.string(),
    }),
    z.object({
        kind: z.literal('reject'),
    }),
]) satisfies z.ZodType<MultispendGroupVoteType>

const withdrawalResponseTypeSchema = z.union([
    z.object({
        kind: z.literal('approve'),
        signature: z.string(),
    }),
    z.object({
        kind: z.literal('reject'),
    }),
    z.object({
        kind: z.literal('complete'),
        fiatAmount: z.number(),
        txid: z.string(),
    }),
]) satisfies z.ZodType<WithdrawalResponseType>

const multispendEventSchemas = {
    groupInvitation: z.object({
        kind: z.literal('groupInvitation'),
        invitation: groupInvitationSchema,
        proposerPubkey: z.string(),
    }) satisfies z.ZodType<
        Extract<MultispendEvent, { kind: 'groupInvitation' }>
    >,
    groupInvitationVote: z.object({
        kind: z.literal('groupInvitationVote'),
        invitation: z.string(),
        vote: multispendGroupVoteTypeSchema,
    }) satisfies z.ZodType<
        Extract<MultispendEvent, { kind: 'groupInvitationVote' }>
    >,
    groupInvitationCancel: z.object({
        kind: z.literal('groupInvitationCancel'),
        invitation: z.string(),
    }) satisfies z.ZodType<
        Extract<MultispendEvent, { kind: 'groupInvitationCancel' }>
    >,
    groupReannounce: z.object({
        kind: z.literal('groupReannounce'),
        invitationId: z.string(),
        invitation: groupInvitationSchema,
        proposer: z.string(),
        pubkeys: z.record(z.string(), z.string().optional()),
        rejections: z.array(z.string()),
    }) satisfies z.ZodType<
        Extract<MultispendEvent, { kind: 'groupReannounce' }>
    >,
    depositNotification: z.object({
        kind: z.literal('depositNotification'),
        fiatAmount: z.number(),
        txid: z.string(),
        description: z.string(),
    }) satisfies z.ZodType<
        Extract<MultispendEvent, { kind: 'depositNotification' }>
    >,
    withdrawalRequest: z.object({
        kind: z.literal('withdrawalRequest'),
        // TODO: get a better type from the bridge for this
        request: z.object({ transfer_amount: z.number() }),
        description: z.string(),
    }) satisfies z.ZodType<
        Extract<MultispendEvent, { kind: 'withdrawalRequest' }>
    >,
    withdrawalResponse: z.object({
        kind: z.literal('withdrawalResponse'),
        request: z.string(),
        response: withdrawalResponseTypeSchema,
    }) satisfies z.ZodType<
        Extract<MultispendEvent, { kind: 'withdrawalResponse' }>
    >,
}

const formTypeSchema = z.enum(['text', 'radio', 'button'])
const formOptionSchema = z.object({
    value: z.string(),
    label: z.string().optional(),
    i18nKeyLabel: z.string().nullable().optional(),
})
const formResponseSchema = z.object({
    responseType: formTypeSchema.optional(),
    responseValue: z.union([z.boolean(), z.string(), z.number()]),
    responseBody: z.string().optional(),
    responseI18nKey: z.string().optional(),
    respondingToEventId: z.string().optional(),
})
export type MatrixFormOption = z.infer<typeof formOptionSchema>
export type MatrixFormResponse = z.infer<typeof formResponseSchema>

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
        file: encryptedFileSchema,
    }),
    'm.video': z.object({
        msgtype: z.literal('m.video'),
        body: z.string(),
        info: z.object({
            mimetype: z.string(),
            size: z.number(),
            w: z.number(),
            h: z.number(),
        }),
        file: encryptedFileSchema,
    }),
    'm.file': z.object({
        msgtype: z.literal('m.file'),
        body: z.string(),
        info: z.object({
            mimetype: z.string(),
            size: z.number(),
        }),
        file: encryptedFileSchema,
    }),
    'm.emote': z.object({
        msgtype: z.literal('m.emote'),
        body: z.string(),
    }),
    /* This event is defined by Matrix, but we extend it with the `msgtype` for simpler parsing */
    'm.room.encrypted': z.object({
        msgtype: z.literal('m.room.encrypted'),
        body: z.string(),
        algorithm: z.string(),
        ciphertext: z.string(),
        device_id: z.string(),
        sender_key: z.string(),
        session_id: z.string(),
    }),
    'm.poll': z.object({
        msgtype: z.literal('m.poll'),
        body: z.string(),
        answers: z.array(z.object({ id: z.string(), text: z.string() })),
        endTime: z.nullable(z.number()),
        hasBeenEdited: z.boolean(),
        kind: z.enum(['disclosed', 'undisclosed']),
        maxSelections: z.number(),
        votes: z.record(z.array(z.string())),
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
        recipientId: z.string().optional(),
        /**
         * The operation ID returned by the federation when minting ecash for the sender.
         * Present on 'pushed' events from NEW clients for transaction history.
         * Optional for backward compatibility with OLD clients.
         */
        senderOperationId: z.string().optional(),
        /**
         * The operation ID returned by the federation when the receiver redeems ecash.
         * Added when the payment is received.
         */
        receiverOperationId: z.string().optional(),
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
        federationId: z.string().optional(),
        // TODO: Attach bolt11 to payment requests, and allow to pay that way
        // if no federations in common?
        bolt11: z.string().optional(),
        // TODO: Attach invite code for federations you belong to that have
        // invites enabled, and allow people to join to accept ecash?
        inviteCode: z.string().optional(),
    }),
    'xyz.fedi.form': z.object({
        msgtype: z.literal('xyz.fedi.form'),

        // Fallback text for clients that don't support this msgtype
        body: z.string(),
        // text the user sees, translated to their selected language
        i18nKeyLabel: z.string().optional(),
        // HTML-like form inputs
        type: formTypeSchema.optional(),
        // single-select options
        options: z.array(formOptionSchema).optional(),
        // this is what the chatbot expects to be sent as a response
        value: z.string().optional(),
        // This is for the user to send response messages back to guardianito
        formResponse: formResponseSchema.optional(),
    }),
    'xyz.fedi.deleted': z.object({
        msgtype: z.literal('xyz.fedi.deleted'),
        body: z.string(),
        redacts: z.string(),
        reason: z.string().optional(),
    }),
    // Artificial preview media event. Is manually generated and will not appear on chat servers.
    'xyz.fedi.preview-media': z.object({
        msgtype: z.literal('xyz.fedi.preview-media'),
        body: z.string(),
        info: z.object({
            mimetype: z.string(),
            w: z.number(),
            h: z.number(),
            uri: z.string(),
        }),
    }),
    'xyz.fedi.multispend': z
        .object({
            msgtype: z.literal('xyz.fedi.multispend'),
            body: z.string(),
        })
        .and(
            // for each multispend event kind, it will reference the corresponding
            // type in the multispendEventSchemas object
            z.discriminatedUnion('kind', [
                multispendEventSchemas.groupInvitation,
                multispendEventSchemas.groupInvitationVote,
                multispendEventSchemas.groupInvitationCancel,
                multispendEventSchemas.groupReannounce,
                multispendEventSchemas.depositNotification,
                multispendEventSchemas.withdrawalRequest,
                multispendEventSchemas.withdrawalResponse,
            ]),
        ),
}

export const matrixUrlMetadataSchema = z.object({
    'matrix:image:size': z.number().nullish(),
    'og:description': z.string().nullish(),
    'og:image': z.string().nullish(),
    'og:image:alt': z.string().nullish(),
    'og:image:height': z.number().nullish(),
    'og:image:type': z.string().nullish(),
    'og:image:width': z.number().nullish(),
    'og:site_name': z.string().nullish(),
    'og:title': z.string().nullish(),
    'og:type': z.string().nullish(),
    'og:url': z.string().nullish(),
})

export type MatrixUrlMetadata = z.infer<typeof matrixUrlMetadataSchema>

type MatrixEventUnknownContent = {
    msgtype: 'm.unknown'
    body: string
    originalContent: MatrixEventContent
}

export type MultispendMatrixEvent =
    MatrixEventContentType<'xyz.fedi.multispend'>

export type MultispendEventContentType<T extends MultispendEvent['kind']> =
    Extract<MultispendMatrixEvent, { kind: T }>

export type MatrixEventContentType<T extends keyof typeof contentSchemas> =
    z.infer<(typeof contentSchemas)[T]>

export type MatrixEventContent =
    | z.infer<(typeof contentSchemas)[keyof typeof contentSchemas]>
    | MatrixEventUnknownContent

export function getEventId(event: MatrixEvent): RpcTimelineEventItemId {
    return event.eventId
        ? { eventId: event.eventId }
        : { transactionId: event.txnId || '' }
}

export function formatMatrixEventContent(
    content: MatrixEventContent,
): MatrixEventContent {
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

export function makeChatFromPreview(preview: MatrixGroupPreview) {
    const { info, timeline } = preview

    // filter out null values added by MatrixChatClient.serializeTimelineItem
    const messages = timeline.filter(t => t !== null)

    const previewContent: MatrixTimelineItem = messages.reduce(
        (latest, current) => {
            return (latest?.timestamp || 0) > (current?.timestamp || 0)
                ? latest
                : current
        },
        messages[0],
    )
    const chat: MatrixRoom = {
        ...info,
        // all previews are default rooms which should be broadcast only
        // TODO: allow non-default, non-broadcast only previewing of rooms
        broadcastOnly: true,
    }
    if (previewContent) {
        chat.preview = {
            eventId: previewContent?.id,
            body: previewContent?.content.body || '',
            timestamp: previewContent?.timestamp || 0,
            // TODO: get this from members list if we have them
            displayName: previewContent?.senderId || '',
            senderId: previewContent?.senderId || '',
            // TODO: handle if deleted messages are returned in public group previews
            isDeleted: false,
        }
    }

    return chat
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
    makeFormattedAmountsFromMSats,
    transaction,
    makeFormattedAmountsFromTxn,
}: {
    t: TFunction
    event: MatrixPaymentEvent
    myId: string
    eventSender: MatrixUser | null | undefined
    paymentSender: MatrixUser | null | undefined
    paymentRecipient: MatrixUser | null | undefined
    transaction: RpcTransaction | null | undefined
    makeFormattedAmountsFromMSats: (amt: MSats) => FormattedAmounts
    makeFormattedAmountsFromTxn: (txn: RpcTransaction) => FormattedAmounts
}): string => {
    const {
        senderId: eventSenderId,
        content: {
            recipientId: paymentRecipientId,
            senderId: paymentSenderId,
            amount,
            bolt11,
        },
    } = event

    const { formattedPrimaryAmount, formattedSecondaryAmount } = transaction
        ? makeFormattedAmountsFromTxn(transaction)
        : makeFormattedAmountsFromMSats(amount as MSats)

    const previewStringParams = {
        name: eventSender?.displayName || matrixIdToUsername(eventSenderId),
        recipient:
            paymentRecipient?.displayName ||
            matrixIdToUsername(paymentRecipientId),
        fiat: formattedPrimaryAmount,
        amount: formattedSecondaryAmount,
        memo: '',
    }

    if (bolt11) {
        return t('feature.chat.lightning-invoice-chat', {
            amountString: `${formattedPrimaryAmount} (${formattedSecondaryAmount})`,
        })
    } else if (eventSenderId === paymentRecipientId) {
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

// TODO - make this dynamic if we have a naming collision
const SUFFIX_LENGTH = 4 as const

/**
 * Gets a {SUFFIX_LENGTH} UUID for a user to protect against impersonation.
 * Generates ID via `sha256(displayName || id)`.
 *
 * It includes the display name so the suffix will change if the displayname changes.
 */
export function getUserSuffix(id: MatrixUser['id']) {
    const hash = toSha256EncHex(id)
    return `#${hash.substring(hash.length - SUFFIX_LENGTH)}`
}

export function isPaymentEvent(
    event: MatrixEvent,
): event is MatrixPaymentEvent {
    return event.content.msgtype === 'xyz.fedi.payment'
}

export function isFormEvent(event: MatrixEvent): event is MatrixFormEvent {
    return event.content.msgtype === 'xyz.fedi.form'
}

export function isBolt11PaymentEvent(
    event: MatrixEvent,
): event is MatrixPaymentEvent {
    return (
        (isPaymentEvent(event) && !!event.content.bolt11) ||
        isBolt11(event.content.body)
    )
}

export function getReceivablePaymentEvents(
    timeline: MatrixTimelineItem[],
    myId: string,
    myFederations: LoadedFederation[],
) {
    const latestPayments: Record<string, MatrixPaymentEvent> = {}
    timeline.forEach(item => {
        if (item === null) return
        if (!isPaymentEvent(item)) return
        if (item.content.recipientId !== myId) return
        if (!item.content.federationId) return
        // payment is not receivable if we have not joined the federation this ecash is from or if we have joined but are still recovering
        const joinedFederation = myFederations.find(
            f => f.id === item.content.federationId,
        )
        if (joinedFederation === undefined) {
            log.info(
                `can't claim ecash from federation ${item.content.federationId}: user is not joined`,
            )
            return
        }
        if (joinedFederation?.recovering) {
            log.info(
                `can't claim ecash from federation ${item.content.federationId}: user is joined but recovery is in progress`,
            )
            return
        }
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

/**
 * @param deep set to true to encode as a deep link
 */
export function encodeFediMatrixUserUri(id: string, deep = false) {
    if (deep) return `fedi://user/${encodeURIComponent(id)}`
    return `fedi:user:${id}`
}

/**
 * @param deep set to true to encode as a deep link
 */
export function encodeFediMatrixRoomUri(id: MatrixRoom['id'], deep = false) {
    if (deep) return `fedi://room/${encodeURIComponent(id)}`
    return `fedi:room:${id}:::`
}

export function decodeFediMatrixRoomUri(uri: string) {
    // Some mobile apps treat the matrix homeserver as a URL and prefix it with https://, breaking the parser
    const cleaned = uri.replace(/https?:\/\//g, '')

    // Decode both fedi:room:{id} and fedi://room:{id}
    // Regex breakdown:
    // ^fedi           - Ensures the string starts with "fedi".
    // (?::|:\/\/)     - Matches either ":" or "://" for both `fedi:room:` and `fedi://room:`
    // room[:/]           - Matches the "room:" or "room/" part of the string
    // (.+?)           - Non-greedy capture of the room ID (which contains a single colon)
    // (?:::|$)        - Ensures the room ID is followed either by ":::” or the end of the string
    // /i              - Case-insensitive matching.
    const match = cleaned.match(/^fedi(?::|:\/\/)room[:/](.+?)(?:::|$)/i)
    if (!match) throw new Error('feature.chat.invalid-room')

    const decodedId = match[1]
    if (!isValidMatrixRoomId(decodedId))
        throw new Error('feature.chat.invalid-room')

    return decodedId
}

export function decodeFediMatrixUserUri(uri: string) {
    // See decodeFediMatrixRoomUri
    const cleaned = uri.replace(/https?:\/\//g, '')

    // Decode both fedi:user:{id} and fedi://user:{id}
    // Also matches fedi:user/{id} and fedi://user/{id}
    // const match = uri.match(FEDI_USER)
    const match = cleaned.match(/^fedi(?::|:\/\/)user[:/](.+)$/i)
    if (!match) throw new Error('feature.chat.invalid-member')

    // Validate that it's a valid matrix user id
    const id = match[1]
    if (!isValidMatrixUserId(id)) throw new Error('feature.chat.invalid-member')
    return id
}

/**
 * TODO Implement more sophisticated parsing
 *   (for example: try to rule out emails)
 * Our existing pattern will match some invalid matrixIds, as
 * matrixIds have some constrains on what is a valid "username"
 * and "homeserver" address. At some point, we might want to implement
 * a "more complete" pattern for matching matrix ids to avoid
 * false positives. And if we do, we should also implement stronger
 * test vectors.
 *
 * Ref: https://github.com/matrix-org/matrix-android-sdk/blob/develop/matrix-sdk-core/src/main/java/org/matrix/androidsdk/core/MXPatterns.java
 * const MATRIX_DOMAIN = new RegExp(/:[A-Z0-9.-]+(:[0-9]{2,5})?/i)
 * const MATRIX_USER_NAME = new RegExp(/@[A-Z0-9\x21-\x39\x3B-\x7F]+/i)
 * const FULL_MATRIX_USER_ID = new RegExp(
 *    MATRIX_USER_NAME.source + MATRIX_DOMAIN.source,
 * )
 * export function isValidMatrixFullUserId(id: string) {
 *     return FULL_MATRIX_USER_ID.test(id)
 * }
 */
export function isValidMatrixUserId(id: string) {
    return /^@[^:]+:.+$/.test(id)
}

export function isValidMatrixRoomId(id: string) {
    return /^![^:]+:.+$/.test(id)
}

// read_receipts is the primary source of truth for notificationCount but when
// ecash is claimed in the background read receipts gets reset to 0
// so we mark the room as unread in that same background process so that
// we can still show the unread indicator in that case
export function shouldShowUnreadIndicator(
    notificationCount: number | undefined,
    isMarkedUnread: boolean | undefined,
): boolean {
    if (notificationCount && notificationCount > 0) return true
    if (isMarkedUnread) return true
    return false
}

export function isDeletedEvent(
    event: MatrixEvent,
): event is MatrixEvent<MatrixEventContentType<'xyz.fedi.deleted'>> {
    return event.content.msgtype === 'xyz.fedi.deleted'
}

export function isTextEvent(
    event: MatrixEvent,
): event is MatrixEvent<MatrixEventContentType<'m.text'>> {
    return event.content.msgtype === 'm.text'
}

export function isImageEvent(
    event: MatrixEvent,
): event is MatrixEvent<MatrixEventContentType<'m.image'>> {
    return event.content.msgtype === 'm.image'
}

export function isPreviewMediaEvent(
    event: MatrixEvent,
): event is MatrixEvent<MatrixEventContentType<'xyz.fedi.preview-media'>> {
    return event.content.msgtype === 'xyz.fedi.preview-media'
}

export function isFileEvent(
    event: MatrixEvent,
): event is MatrixEvent<MatrixEventContentType<'m.file'>> {
    return event.content.msgtype === 'm.file'
}

export function isVideoEvent(
    event: MatrixEvent,
): event is MatrixEvent<MatrixEventContentType<'m.video'>> {
    return event.content.msgtype === 'm.video'
}

export function isEncryptedEvent(
    event: MatrixEvent,
): event is MatrixEvent<MatrixEventContentType<'m.room.encrypted'>> {
    return event.content.msgtype === 'm.room.encrypted'
}

export function isPollEvent(
    event: MatrixEvent,
): event is MatrixEvent<MatrixEventContentType<'m.poll'>> {
    return event.content.msgtype === 'm.poll'
}

export function isMultispendEvent(
    event: MatrixEvent,
): event is MatrixEvent<MatrixEventContentType<'xyz.fedi.multispend'>> {
    return event.content.msgtype === 'xyz.fedi.multispend'
}

export function isMultispendWithdrawalResponseEvent(
    event: MatrixEvent,
): event is MatrixEvent<MultispendEventContentType<'withdrawalResponse'>> {
    return (
        event.content.msgtype === 'xyz.fedi.multispend' &&
        event.content.kind === 'withdrawalResponse'
    )
}

export function isMultispendWithdrawalRequestEvent(
    event: MatrixEvent,
): event is MatrixEvent<MultispendEventContentType<'withdrawalRequest'>> {
    return (
        event.content.msgtype === 'xyz.fedi.multispend' &&
        event.content.kind === 'withdrawalRequest'
    )
}

export function isMultispendDepositEvent(
    event: MatrixEvent,
): event is MatrixEvent<MultispendEventContentType<'depositNotification'>> {
    return (
        event.content.msgtype === 'xyz.fedi.multispend' &&
        event.content.kind === 'depositNotification'
    )
}

export function isMultispendInvitationEvent(
    event: MatrixEvent,
): event is MatrixEvent<MultispendEventContentType<'groupInvitation'>> {
    return (
        event.content.msgtype === 'xyz.fedi.multispend' &&
        event.content.kind === 'groupInvitation'
    )
}

export function isMultispendInvitationVoteEvent(
    event: MatrixEvent,
): event is MatrixEvent<MultispendEventContentType<'groupInvitationVote'>> {
    return (
        event.content.msgtype === 'xyz.fedi.multispend' &&
        event.content.kind === 'groupInvitationVote'
    )
}

export function isMultispendInvitationCancelEvent(
    event: MatrixEvent,
): event is MatrixEvent<MultispendEventContentType<'groupInvitationCancel'>> {
    return (
        event.content.msgtype === 'xyz.fedi.multispend' &&
        event.content.kind === 'groupInvitationCancel'
    )
}

export function isMultispendReannounceEvent(
    event: MatrixEvent,
): event is MatrixEvent<MultispendEventContentType<'groupReannounce'>> {
    return (
        event.content.msgtype === 'xyz.fedi.multispend' &&
        event.content.kind === 'groupReannounce'
    )
}

/**
 * Checks to see if a chat video/image event's content matches the `media` argument
 */
export const doesEventContentMatchPreviewMedia = (
    media: InputMedia,
    content: MatrixEventContentType<'m.video' | 'm.image'>,
) =>
    content.info.mimetype === media.mimeType &&
    content.info.w === media.width &&
    content.info.h === media.height &&
    content.body === media.fileName

export const arePollEventsEqual = (
    prev: MatrixEvent<MatrixEventContentType<'m.poll'>>,
    curr: MatrixEvent<MatrixEventContentType<'m.poll'>>,
) => {
    if (
        prev.id !== curr.id ||
        prev.content.endTime !== curr.content.endTime ||
        prev.content.answers.length !== curr.content.answers.length ||
        prev.content.votes.length !== curr.content.votes.length
    )
        return false

    for (const [key, value] of Object.entries(prev.content.votes)) {
        if (curr.content.votes[key] !== value) return false
    }

    return true
}

export const getMultispendInvite = (
    multispendStatus: RpcMultispendGroupStatus,
): GroupInvitation | null => {
    if (multispendStatus.status === 'activeInvitation')
        return multispendStatus.state.invitation
    if (multispendStatus.status === 'finalized')
        return multispendStatus.finalized_group.invitation
    return null
}

export const getMultispendRole = (
    multispendStatus: RpcMultispendGroupStatus,
    userId: RpcUserId,
): MultispendRole => {
    let signers: Array<RpcUserId> = []
    let proposer: RpcUserId | null = null
    if (multispendStatus?.status === 'activeInvitation') {
        signers = multispendStatus.state.invitation.signers
        proposer = multispendStatus.state.proposer
    } else if (multispendStatus?.status === 'finalized') {
        signers = multispendStatus.finalized_group.invitation.signers
        proposer = multispendStatus.finalized_group.proposer
    }

    const isVoter = signers.includes(userId)
    const isProposer = proposer === userId

    if (isProposer) return 'proposer'
    if (isVoter) return 'voter'

    return 'member'
}

export const makeMultispendWalletHeader = (
    t: TFunction,
    multispendStatus: RpcMultispendGroupStatus | undefined,
) => {
    switch (multispendStatus?.status) {
        case 'activeInvitation':
            return {
                federationName:
                    multispendStatus.state.invitation.federationName,
                status: t('feature.multispend.waiting-for-approval'),
                threshold: multispendStatus.state.invitation.threshold,
                totalSigners: multispendStatus.state.invitation.signers.length,
            }
        case 'finalized':
            return {
                federationName:
                    multispendStatus.finalized_group.invitation.federationName,
                status: t('words.active'),
                threshold:
                    multispendStatus.finalized_group.invitation.threshold,
                totalSigners:
                    multispendStatus.finalized_group.invitation.signers.length,
            }
        default:
            return {
                federationName: '',
                status: t('words.canceled'),
                threshold: 0,
                totalSigners: 0,
            }
    }
}

export const coerceMultispendTxn = (
    txn: MultispendListedEvent,
): MultispendTransactionListEntry => {
    const coerced = {
        ...txn,
        createdAt: txn.time,
        id: txn.eventId,
        amount: 0 as MSats,
        fediFeeStatus: null,
        txnNotes: '',
        txDateFiatInfo: null,
        frontendMetadata: {
            initialNotes: null,
            recipientMatrixId: null,
            senderMatrixId: null,
        },
        outcomeTime: null,
        kind: 'multispend' as const,
    }
    if (txn.event === 'invalidEvent') {
        return {
            ...coerced,
            state: 'invalid' as const,
        }
    } else if ('depositNotification' in txn.event) {
        return {
            ...coerced,
            state: 'deposit' as const,
            event: { depositNotification: txn.event.depositNotification },
        }
    } else if ('withdrawalRequest' in txn.event) {
        return {
            ...coerced,
            state: 'withdrawal' as const,
            event: { withdrawalRequest: txn.event.withdrawalRequest },
        }
    } else if ('groupInvitation' in txn.event) {
        return {
            ...coerced,
            state: 'groupInvitation' as const,
            event: { groupInvitation: txn.event.groupInvitation },
        }
    } else {
        return {
            ...coerced,
            state: 'invalid' as const,
        }
    }
}

export const makeNameWithSuffix = (user: MatrixUser) => {
    return `${user.displayName} ${getUserSuffix(user.id)}`
}

export const findUserDisplayName = (
    userId: MatrixUser['id'],
    roomMembers: MatrixRoomMember[],
) => {
    const user = roomMembers.find(m => m.id === userId)
    return user ? makeNameWithSuffix(user) : userId
}

export function isMultispendFinancialTransaction(
    event: MultispendTransactionListEntry,
): event is MultispendWithdrawalEvent | MultispendDepositEvent {
    return event.state === 'withdrawal' || event.state === 'deposit'
}

export function isMultispendWithdrawalEvent(
    event: MultispendTransactionListEntry,
): event is MultispendWithdrawalEvent {
    return (
        'event' in event &&
        typeof event.event === 'object' &&
        'withdrawalRequest' in event.event
    )
}

// References type from the listEvents rpc. NOT matrix events.
// Use this when handling responses from the `observeMultispendEvent` stream.
export function isMultispendInvitation(
    event: MultispendTransactionListEntry,
): event is MultispendListedInvitationEvent {
    return (
        'event' in event &&
        typeof event.event === 'object' &&
        'groupInvitation' in event.event
    )
}

export function getHasUserVotedForWithdrawal(
    event: MultispendWithdrawalEvent,
    userId: string,
) {
    const rejections = event.event.withdrawalRequest.rejections
    const signatures = event.event.withdrawalRequest.signatures

    return Boolean(rejections.includes(userId) || signatures[userId])
}

export function isWithdrawalRequestRejected(
    event: MultispendTransactionListEntry,
    multispendStatus: RpcMultispendGroupStatus,
) {
    const invitation = getMultispendInvite(multispendStatus)

    if (
        invitation &&
        isMultispendWithdrawalEvent(event) &&
        event.event.withdrawalRequest.rejections.length >
            invitation.signers.length - invitation.threshold
    )
        return true

    return false
}

export function isWithdrawalRequestApproved(
    event: MultispendTransactionListEntry,
    multispendStatus: RpcMultispendGroupStatus,
) {
    const invitation = getMultispendInvite(multispendStatus)

    if (
        invitation &&
        isMultispendWithdrawalEvent(event) &&
        Object.keys(event.event.withdrawalRequest.signatures).length >=
            invitation.threshold
    )
        return true

    return false
}
