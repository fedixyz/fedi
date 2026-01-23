import { TFunction, type ResourceKey } from 'i18next'
import orderBy from 'lodash/orderBy'
import { z } from 'zod'

import { toSha256EncHex } from '@fedi/common/utils/EncryptionUtils'

import {
    BR_TAG_REGEX,
    HTML_ENTITIES,
    HTML_TAG_REGEX,
    MX_REPLY_REGEX,
    QUOTE_USER_REGEX,
    MATRIX_URL_BASE,
    ROOM_MENTION,
} from '../constants/matrix'
import {
    InputMedia,
    LoadedFederation,
    MSats,
    MatrixEvent,
    MatrixEventContentType,
    MatrixEventKind,
    MatrixFormEvent,
    MatrixGroupPreview,
    MatrixMentions,
    MatrixMultispendEvent,
    MatrixPaymentEvent,
    MatrixRoom,
    MatrixRoomMember,
    MatrixRoomPowerLevels,
    MatrixUser,
    MentionExtractionResult,
    MentionParsingResult,
    MultispendDepositEvent,
    MultispendListedInvitationEvent,
    MultispendRole,
    MultispendTransactionListEntry,
    MultispendWithdrawalEvent,
    ReplyMessageData,
    RpcMatrixEventKind,
    RpcMatrixEventKinds,
    TransactionListEntry,
} from '../types'
import { FormattedAmounts } from '../types/amount'
import {
    GroupInvitation,
    RpcMultispendGroupStatus,
    RpcUserId,
    MultispendListedEvent,
    RpcTransaction,
    SendMessageData,
    RpcMentions,
    JSONObject,
    RpcTimelineItemEvent,
    type RpcUserPowerLevel,
} from '../types/bindings'
import { makeLog } from './log'
import { constructUrl } from './neverthrow'
import { isBolt11 } from './parser'
import { coerceTxn } from './transaction'

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

/*
 * Converts a Matrix Content URI (mxc://) to a HTTP URL
 * expected mxcUrl: mxc://staging.m1.8fa.in/HDUqmHaKmXbLbgkMHwUoXTry
 * expected result: https://staging.m1.8fa.in/_matrix/media/r0/thumbnail/staging.m1.8fa.in/HDUqmHaKmXbLbgkMHwUoXTry?width=100&height=100&method=crop
 */
export const mxcUrlToHttpUrl = (
    mxcUrl: string,
    width: number,
    height: number,
    method: 'scale' | 'crop' = 'crop',
) => {
    const [serverName, mediaId] = mxcUrl.split('/').slice(2)
    if (!mediaId) return undefined
    const homeserverUrl = `https://${serverName}`
    const url = new URL(homeserverUrl)
    url.pathname = `/_matrix/media/r0/thumbnail/${serverName}/${mediaId}`
    if (width) url.searchParams.set('width', width.toString())
    if (height) url.searchParams.set('height', height.toString())
    url.searchParams.set('method', method)
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
        return ['pushed', 'requested'].includes(event.content.status)
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

export type MatrixEventContent = MatrixEvent['content']

export const isRpcMatrixEvent = (
    item: RpcTimelineItemEvent & { roomId: string },
): item is MatrixEvent<RpcMatrixEventKind> => {
    return RpcMatrixEventKinds.includes(item.content.msgtype)
}

export type RepliableMatrixEventContent = MatrixEventContent & {
    'm.relates_to'?: {
        rel_type?: string
        event_id?: string
        key?: string
        'm.in_reply_to'?: {
            event_id: string
        }
    }
    formatted_body?: string
    format?: 'org.matrix.custom.html'
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
            if (lastEvent.sender === event.sender) {
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

// Default chats are displayed as "fake groupchats" in the chats list because
// users aren't actually joined to these rooms, so we need to construct the chat
// object using the public room info and preview content that are fetched using
// separate non-observable RPCs in MatrixChatClient.getRoomPreview.
// To disambiguate:
//    MatrixGroupPreview "preview" param
//      > the full info + timeline of a public unjoined room
//    MatrixRoom "preview" field
//      > the truncated preview text shown under the name of the room on the ChatsList screen
export function makeChatFromUnjoinedRoomPreview(preview: MatrixGroupPreview) {
    const { info, timeline } = preview

    const chatPreview: MatrixEvent = timeline.reduce((latest, current) => {
        return (latest?.timestamp || 0) > (current?.timestamp || 0)
            ? latest
            : current
    }, timeline[0])
    const chat: MatrixRoom = {
        ...info,
        preview: chatPreview,
        // all previews are default rooms which should be broadcast only
        // TODO: allow non-default, non-broadcast only previewing of rooms
        broadcastOnly: true,
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
    makeFormattedAmountsFromTxn: (txn: TransactionListEntry) => FormattedAmounts
}): string => {
    const {
        sender: eventSenderId,
        content: {
            recipientId: paymentRecipientId,
            senderId: paymentSenderId,
            amount,
            bolt11,
        },
    } = event

    const { formattedPrimaryAmount, formattedSecondaryAmount } = transaction
        ? makeFormattedAmountsFromTxn(coerceTxn(transaction))
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
        (isTextEvent(event) && isBolt11(event.content.body))
    )
}

export function getReceivablePaymentEvents(
    timeline: (MatrixEvent | null)[],
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
        if (['accepted', 'pushed'].includes(event.content.status)) {
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
): event is MatrixEvent<'redacted'> {
    return event.content.msgtype === 'redacted'
}

export function isTextEvent(
    event: MatrixEvent,
): event is MatrixEvent<'m.text'> {
    return event.content.msgtype === 'm.text'
}

export function isImageEvent(
    event: MatrixEvent,
): event is MatrixEvent<'m.image'> {
    return event.content.msgtype === 'm.image'
}

export function isPreviewMediaEvent(
    // Includes fake internal events
    event: MatrixEvent,
): event is MatrixEvent<'xyz.fedi.preview-media'> {
    return event.content.msgtype === 'xyz.fedi.preview-media'
}

export function isFileEvent(
    event: MatrixEvent,
): event is MatrixEvent<'m.file'> {
    return event.content.msgtype === 'm.file'
}

export function isVideoEvent(
    event: MatrixEvent,
): event is MatrixEvent<'m.video'> {
    return event.content.msgtype === 'm.video'
}

export function isEncryptedEvent(
    event: MatrixEvent,
): event is MatrixEvent<'unableToDecrypt'> {
    return event.content.msgtype === 'unableToDecrypt'
}

export function isPollEvent(
    event: MatrixEvent,
): event is MatrixEvent<'m.poll'> {
    return event.content.msgtype === 'm.poll'
}

export function isFederationInviteEvent(
    event: MatrixEvent,
): event is MatrixEvent<'xyz.fedi.federationInvite'> {
    return event.content.msgtype === 'xyz.fedi.federationInvite'
}

export function isCommunityInviteEvent(
    event: MatrixEvent,
): event is MatrixEvent<'xyz.fedi.communityInvite'> {
    return event.content.msgtype === 'xyz.fedi.communityInvite'
}

export function isMultispendEvent(
    event: MatrixEvent,
): event is MatrixEvent<'xyz.fedi.multispend'> {
    return event.content.msgtype === 'xyz.fedi.multispend'
}

export function isMultispendWithdrawalResponseEvent(
    event: MatrixEvent,
): event is MatrixMultispendEvent<'withdrawalResponse'> {
    return (
        event.content.msgtype === 'xyz.fedi.multispend' &&
        event.content.kind === 'withdrawalResponse'
    )
}

export function isMultispendWithdrawalRequestEvent(
    event: MatrixEvent,
): event is MatrixMultispendEvent<'withdrawalRequest'> {
    return (
        event.content.msgtype === 'xyz.fedi.multispend' &&
        event.content.kind === 'withdrawalRequest'
    )
}

export function isMultispendDepositEvent(
    event: MatrixEvent,
): event is MatrixMultispendEvent<'depositNotification'> {
    return (
        event.content.msgtype === 'xyz.fedi.multispend' &&
        event.content.kind === 'depositNotification'
    )
}

export function isMultispendInvitationEvent(
    event: MatrixEvent,
): event is MatrixMultispendEvent<'groupInvitation'> {
    return (
        event.content.msgtype === 'xyz.fedi.multispend' &&
        event.content.kind === 'groupInvitation'
    )
}

export function isMultispendInvitationVoteEvent(
    event: MatrixEvent,
): event is MatrixMultispendEvent<'groupInvitationVote'> {
    return (
        event.content.msgtype === 'xyz.fedi.multispend' &&
        event.content.kind === 'groupInvitationVote'
    )
}

export function isMultispendInvitationCancelEvent(
    event: MatrixEvent,
): event is MatrixMultispendEvent<'groupInvitationCancel'> {
    return (
        event.content.msgtype === 'xyz.fedi.multispend' &&
        event.content.kind === 'groupInvitationCancel'
    )
}

export function isMultispendReannounceEvent(
    event: MatrixEvent,
): event is MatrixMultispendEvent<'groupReannounce'> {
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
    content.info?.mimetype === media.mimeType &&
    content.info?.width === media.width &&
    content.info?.height === media.height &&
    content.body === media.fileName

export const arePollEventsEqual = (
    prev: MatrixEvent<'m.poll'>,
    curr: MatrixEvent<'m.poll'>,
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

export function sortMultispendRoomMembers(
    members: MatrixRoomMember[],
    multispendStatus: RpcMultispendGroupStatus,
) {
    return members.sort((a, b) => {
        if (!multispendStatus) return 0

        const roleA = getMultispendRole(multispendStatus, a.id)
        const roleB = getMultispendRole(multispendStatus, b.id)
        const roleAPower = roleA === 'proposer' ? 2 : roleA === 'voter' ? 1 : 0
        const roleBPower = roleB === 'proposer' ? 2 : roleB === 'voter' ? 1 : 0

        return roleBPower - roleAPower
    })
}

export function isRepliableContent(
    reply: MatrixEvent['inReply'] | undefined,
): reply is ReplyMessageData {
    if (!reply) return false
    if (reply.kind !== 'ready') return false
    if (!('body' in reply.content)) return false

    return true
    // content !== null &&
    // typeof content === 'object' &&
    // content !== undefined &&
    // 'm.relates_to' in content &&
    // content['m.relates_to'] !== null &&
    // typeof content['m.relates_to'] === 'object'
}

export function isReply(event: MatrixEvent): boolean {
    return !!event.inReply
}

export const getReplyData = (event: MatrixEvent): ReplyMessageData | null => {
    if (!event.inReply) {
        return null
    }
    if (isRepliableContent(event.inReply)) return event.inReply
    return null
}

export function getReplyEventId(event: MatrixEvent): string | null {
    const replyData = getReplyData(event)
    if (!replyData) return null

    return replyData.id
}

function decodeHtmlEntities(text: string): string {
    return text.replace(/&[#\w]+;/g, entity => HTML_ENTITIES[entity] || entity)
}

function findLastQuoteLineIndex(lines: string[]): {
    isValid: boolean
    lastIndex: number
} {
    let lastQuoteLineIndex = -1
    let firstQuoteUser: string | null = null
    let allQuotesFromSameUser = true

    // find consecutive quote lines from the same user
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('> <@')) {
            // extract user ID from quote line
            const userMatch = lines[i].match(QUOTE_USER_REGEX)
            if (userMatch) {
                const currentUser = userMatch[1]
                if (firstQuoteUser === null) {
                    firstQuoteUser = currentUser
                } else if (currentUser !== firstQuoteUser) {
                    allQuotesFromSameUser = false
                    break
                }
                lastQuoteLineIndex = i
            } else {
                break
            }
        } else {
            break
        }
    }

    const isValid =
        lastQuoteLineIndex >= 0 &&
        lastQuoteLineIndex < lines.length - 1 &&
        allQuotesFromSameUser

    return { isValid, lastIndex: lastQuoteLineIndex }
}

export function stripReplyFromBody(
    body: string,
    formattedBody?: string | null,
): string {
    // strip mx-reply content if present
    if (formattedBody?.includes('<mx-reply>')) {
        const strippedBody = formattedBody
            .replace(MX_REPLY_REGEX, '')
            .replace(BR_TAG_REGEX, '\n')
        const withoutTags = strippedBody.replace(HTML_TAG_REGEX, '')
        return decodeHtmlEntities(withoutTags)
    }

    // strip reply from plain text body
    const lines = body.split('\n')

    // handle single line quote format: "> <@user> message\n\nReply"
    if (lines.length >= 3 && lines[0].startsWith('> <@') && lines[1] === '') {
        return decodeHtmlEntities(lines.slice(2).join('\n'))
    }

    // handle multi-line quote format: "> <@user> line1\n> <@user> line2\nReply"
    // multi-line quotes are only valid when they're all from the same user
    if (lines.length >= 2) {
        const quoteInfo = findLastQuoteLineIndex(lines)

        // if we found valid quote lines from the same user, return everything after them
        if (quoteInfo.isValid) {
            return decodeHtmlEntities(
                lines.slice(quoteInfo.lastIndex + 1).join('\n'),
            )
        }
    }

    // if we have formatted_body but no mx-reply, and no valid plain text pattern,
    // prefer formatted_body (strip HTML tags) over body as it may be cleaner
    if (formattedBody) {
        const withoutTags = formattedBody
            .replace(BR_TAG_REGEX, '\n')
            .replace(HTML_TAG_REGEX, '')
        return decodeHtmlEntities(withoutTags)
    }

    // no valid reply pattern found, return original body unchanged
    return decodeHtmlEntities(body)
}

/**
 * Extracts a clean body preview from a MatrixEvent, stripping reply formatting
 * and truncating to a maximum length. Useful for reply bars, notifications, etc.
 */
export function getEventBodyPreview(
    event: MatrixEvent,
    maxLength: number = 50,
): string {
    const body = 'body' in event.content ? event.content.body : 'Message'

    const formattedBody =
        'formatted' in event.content
            ? event.content.formatted?.formattedBody
            : undefined

    const cleanBody = stripReplyFromBody(body, formattedBody)
    return cleanBody.slice(0, maxLength) || 'Message'
}

/** Normalize a plain string or a full SendMessageData into SendMessageData */
export const toSendMessageData = (
    x: string | SendMessageData,
    opts?: { mentions?: RpcMentions | null; extra?: JSONObject },
): SendMessageData =>
    typeof x === 'string'
        ? {
              msgtype: 'm.text',
              body: x,
              data: opts?.extra ?? {},
              mentions: opts?.mentions ?? null,
          }
        : x

const labelKeys = ['displayName', 'username', 'name'] as const

function getStringProp(
    obj: unknown,
    key: (typeof labelKeys)[number],
): string | null {
    if (obj == null || typeof obj !== 'object') return null
    const val = (obj as Record<string, unknown>)[key]
    return typeof val === 'string' && val.trim().length > 0 ? val : null
}

/**
 * Returns the best-available, non-empty label for a Matrix user.
 * Falls back in order: displayName → username → name → ''.
 */
export const getUserLabel = (u: MatrixUser): string => {
    for (const key of labelKeys) {
        const v = getStringProp(u, key)
        if (v) return v
    }
    return ''
}

// Minimal HTML escaping for formatted_body
const escapeHtml = (s: string) =>
    s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/&apos;/g, "'")

// minimal HTML un-escaping for formatted_body
export const unescapeHtml = (s: string) =>
    s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&apos;/g, "'")

const anchorForUser = (userId: string, display: string) =>
    `<a href="${MATRIX_URL_BASE}${userId}">${escapeHtml(display)}</a>`

/**
 * Detect @mentions in plain text, match against room members,
 * build m.mentions + formatted_body (with matrix.to links).
 */
export function parseMentionsFromText(
    body: string,
    roomMembers: MatrixRoomMember[],
): MentionParsingResult {
    const byHandle = new Map<string, MatrixRoomMember>() // localpart (no spaces)
    const byDisplay = new Map<string, MatrixRoomMember>() // display name (may have spaces)

    for (const m of roomMembers) {
        const local = m.id.replace(/^@/, '').split(':', 1)[0]
        byHandle.set(local.toLowerCase(), m)
        const dn = (m.displayName || '').trim()
        if (dn) byDisplay.set(dn.toLowerCase(), m)
    }

    const userIds = new Set<string>()
    let hasRoom = false

    // check delimiter
    const isDelim = (ch?: string) => !ch || /\s|[.,;:()"'`<>]/.test(ch)

    // longest-first list of display names for matching
    const displayNames = Array.from(byDisplay.keys()).sort(
        (a, b) => b.length - a.length,
    )

    let i = 0
    let out = ''
    let plainBuf = ''

    const flushPlain = () => {
        if (plainBuf) {
            out += escapeHtml(plainBuf)
            plainBuf = ''
        }
    }

    while (i < body.length) {
        const ch = body[i]

        if (ch === '@' && (i === 0 || isDelim(body[i - 1]))) {
            const after = body.slice(i + 1)
            const afterLower = after.toLowerCase()

            // Try multi-word display name mention first (greedy, longest-first)
            let matchedName: string | null = null
            let matchedMember: MatrixRoomMember | undefined

            for (const name of displayNames) {
                if (
                    afterLower.startsWith(name) &&
                    isDelim(body[i + 1 + name.length])
                ) {
                    matchedName = after.substr(0, name.length) // preserve original casing for display
                    matchedMember = byDisplay.get(name)
                    break
                }
            }

            if (matchedName && matchedMember) {
                userIds.add(matchedMember.id)
                const display =
                    (matchedMember.displayName || '').trim() || matchedName
                flushPlain()
                out += anchorForUser(matchedMember.id, `@${display}`)
                i += 1 + matchedName.length
                continue
            }

            // fallback to handle
            const handleMatch = after.match(/^[a-z0-9._-]{1,64}/i)
            if (handleMatch) {
                const raw = handleMatch[0]
                const handle = raw.toLowerCase()

                if (handle === ROOM_MENTION || handle === 'everyone') {
                    hasRoom = true
                    flushPlain()
                    out += `@${raw}` // keep as plain text (Matrix convention)
                    i += 1 + raw.length
                    continue
                }

                const m = byHandle.get(handle)
                if (m) {
                    userIds.add(m.id)
                    const display = (m.displayName || '').trim() || m.id
                    flushPlain()
                    out += anchorForUser(m.id, `@${display}`)
                    i += 1 + raw.length
                    continue
                }

                // not a known handle — leave as typed
                flushPlain()
                out += `@${raw}`
                i += 1 + raw.length
                continue
            }

            // lone '@' or not a valid token; emit as-is
            flushPlain()
            out += '@'
            i += 1
            continue
        }

        // Regular character — buffer until we need to insert an anchor or finish
        plainBuf += ch
        i += 1
    }

    // flush any trailing plain text
    flushPlain()

    const mentions: MatrixMentions = {}
    if (userIds.size) mentions.user_ids = Array.from(userIds)
    if (hasRoom) mentions.room = true

    return { mentions, formattedBody: out }
}

/**
 * Read mentions from a Matrix event (m.mentions + anchors in formatted_body).
 */
export function extractMentionsFromEvent(
    event: MatrixEvent,
): MentionExtractionResult {
    const content = (event.content ?? {}) as Partial<{
        'm.mentions': MatrixMentions
        formatted_body: string
    }>
    const mentionsField = content['m.mentions']
    const mentionedUserIds = mentionsField?.user_ids
        ? [...mentionsField.user_ids]
        : []
    const hasRoomMention = !!mentionsField?.room
    const formattedMentions: {
        userId: string
        displayName: string
        startIndex: number
        endIndex: number
    }[] = []

    if (typeof content.formatted_body === 'string') {
        // Accept encoded user IDs after "#/" and decode them.
        // Example: <a href="https://matrix.to/#/%40alice%3Aserver">...</a>
        const re = /<a\s+href="[^"]*#\/([^"]+)"[^>]*>(.*?)<\/a>/gi
        let matchExec: RegExpExecArray | null
        while ((matchExec = re.exec(content.formatted_body))) {
            const decoded = safeDecode(matchExec[1])
            if (!decoded?.startsWith('@') || !decoded.includes(':')) continue

            formattedMentions.push({
                userId: decoded,
                displayName: matchExec[2]?.replace(/<[^>]*>/g, '') || decoded,
                startIndex: matchExec.index,
                endIndex: matchExec.index + matchExec[0].length,
            })
        }
    }

    return { mentionedUserIds, hasRoomMention, formattedMentions }
}

export function isUserMentioned(event: MatrixEvent, userId: string): boolean {
    const res = extractMentionsFromEvent(event)
    return res.hasRoomMention || res.mentionedUserIds.includes(userId)
}

// strip only the <mx-reply> wrapper, keep the rest of the HTML intact
export function stripReplyFromFormattedBody(
    formattedBody?: string,
): string | undefined {
    if (!formattedBody) return undefined
    return formattedBody
        .replace(MX_REPLY_REGEX, '')
        .replace(/^\s*(?:<br\s*\/?>)+/i, '')
        .trim()
}

// builds the 'data' payload for fedimint JSON message/edit/reply calls when mentions are present
export const prepareMentionsDataPayload = (
    body: string,
    members: MatrixRoomMember[],
    opts?: { excludeUserId?: string },
): { mentions: RpcMentions | null; extra: JSONObject } => {
    const { mentions, formattedBody } = parseMentionsFromText(body, members)
    const hadAnchors = /<a\s/i.test(formattedBody)

    let rpcMentions = toRpcMentions(mentions)

    // remove self from m.mentions (but keep the anchor in HTML)
    if (rpcMentions && opts?.excludeUserId) {
        const users = (rpcMentions.users ?? []).filter(
            u => u !== opts.excludeUserId,
        )
        const filtered: RpcMentions = { ...rpcMentions, users }
        rpcMentions = users.length > 0 || !!filtered.room ? filtered : null
    }

    // If no mentions remain after filtering:
    // - If the original had anchors, still include formatted_body to keep styled links.
    // - Otherwise, no extra payload.
    if (!rpcMentions) {
        return hadAnchors
            ? {
                  mentions: null,
                  extra: {
                      format: 'org.matrix.custom.html',
                      formatted_body: formattedBody,
                  },
              }
            : { mentions: null, extra: {} }
    }

    // Mentions remain -> include both m.mentions and formatted_body
    return {
        mentions: rpcMentions,
        extra: {
            format: 'org.matrix.custom.html',
            formatted_body: formattedBody,
        },
    }
}

export const hasMentions = (m: RpcMentions | null) =>
    !!m && (m.users.length > 0 || m.room)

// Convert MatrixMentions (snake_case) to RpcMentions (camelCase)
const toRpcMentions = (
    m: { user_ids?: string[]; room?: boolean } | null,
): RpcMentions | null => {
    if (!m) return null
    const users = Array.isArray(m.user_ids) ? m.user_ids.filter(Boolean) : []
    const room = !!m.room
    if (users.length === 0 && !room) return null
    return { users, room }
}

const safeDecode = (s: string): string | null => {
    try {
        return decodeURIComponent(s)
    } catch {
        return null
    }
}

export type LinkRun = { type: 'link'; text: string; href: string }
export type TextRun = { type: 'text'; text: string }
export type HtmlRun = LinkRun | TextRun

/**
 * Type guard for m.text content that includes Matrix HTML formatting.
 */
export function isHtmlFormattedContent(
    c: MatrixEventContentType<'m.text'> | RepliableMatrixEventContent,
): c is RepliableMatrixEventContent & {
    format: 'org.matrix.custom.html'
    formatted_body?: string
} {
    if (typeof c !== 'object' || c === null) return false

    if (!('format' in c)) return false
    const format = (c as { format?: unknown }).format
    if (format !== 'org.matrix.custom.html') return false

    // formatted_body may be absent or a string
    if ('formatted_body' in c) {
        const fb = (c as { formatted_body?: unknown }).formatted_body
        if (typeof fb !== 'undefined' && typeof fb !== 'string') return false
    }

    return true
}

/**
 * Split HTML into link/text runs, converting <br/> to "\n" and unescaping entities.
 * Strips any nested tags from anchor text.
 */
export const splitHtmlRuns = (html: string): HtmlRun[] => {
    const anchorRe = /<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gi
    const brRe = /<br\s*\/?>/gi
    const runs: HtmlRun[] = []
    let last = 0
    let m: RegExpExecArray | null
    while ((m = anchorRe.exec(html))) {
        if (m.index > last) {
            const chunk = html.slice(last, m.index)
            const pieces = chunk.split(brRe)
            pieces.forEach((p, idx) => {
                if (p) runs.push({ type: 'text', text: unescapeHtml(p) })
                if (idx < pieces.length - 1)
                    runs.push({ type: 'text', text: '\n' })
            })
        }
        runs.push({
            type: 'link',
            href: m[1],
            text: unescapeHtml(m[2].replace(/<[^>]*>/g, '')),
        })
        last = m.index + m[0].length
    }
    if (last < html.length) {
        const tail = html.slice(last)
        const pieces = tail.split(brRe)
        pieces.forEach((p, idx) => {
            if (p) runs.push({ type: 'text', text: unescapeHtml(p) })
            if (idx < pieces.length - 1) runs.push({ type: 'text', text: '\n' })
        })
    }
    return runs
}

/**
 * Split plain text into runs, marking @room/@everyone tokens as 'everyone' runs.
 */
export const splitEveryoneRuns = (
    text: string,
): Array<{ type: 'text' | 'everyone'; text: string }> => {
    const re = new RegExp(`@(?:everyone|${ROOM_MENTION})\\b`, 'gi')
    const out: Array<{ type: 'text' | 'everyone'; text: string }> = []
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
        if (m.index > last)
            out.push({ type: 'text', text: text.slice(last, m.index) })
        out.push({ type: 'everyone', text: m[0] })
        last = m.index + m[0].length
    }
    if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
    return out
}

// Maps some message types to special preview message
// local keys
const PreviewTextMap = {
    failedToParseCustom: 'feature.chat.new-message',
    unknown: 'feature.chat.new-message',
    unableToDecrypt: 'feature.chat.new-message',
    'xyz.fedi.multispend': 'feature.chat.multispend-preview',
    spTransfer: 'feature.chat.sp-transfer-preview',
    redacted: 'feature.chat.message-deleted',
} as const satisfies Partial<Record<MatrixEventKind, ResourceKey>>

const isKeyOfPreviewTextMap = (
    event: MatrixEvent,
): event is MatrixEvent<keyof typeof PreviewTextMap> =>
    event.content.msgtype in PreviewTextMap

export const getRoomPreviewText = (room: MatrixRoom, t: TFunction) => {
    if (room.isBlocked) return t('feature.chat.user-is-blocked')

    const preview = room.preview

    // HACK: public rooms don't show a preview message so you have to click into it to paginate backwards
    // TODO: Replace with proper room previews
    if (room.isPublic && room.broadcastOnly)
        return t('feature.chat.click-here-for-announcements')

    if (!preview) return t('feature.chat.no-messages')

    if (isKeyOfPreviewTextMap(preview))
        return t(PreviewTextMap[preview.content.msgtype])

    return preview.content.body
}

export function isPowerLevelGreaterOrEqual(
    powerLevel: RpcUserPowerLevel,
    threshold: RpcUserPowerLevel | number,
): boolean {
    if (powerLevel.type === 'infinite') return true

    const thresholdValue =
        typeof threshold === 'number'
            ? threshold
            : threshold.type === 'infinite'
              ? Number.MAX_SAFE_INTEGER
              : threshold.value

    return powerLevel.value >= thresholdValue
}
