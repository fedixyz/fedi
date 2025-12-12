import { ROOM_MENTION } from '../constants/matrix'
import type {
    JSONObject,
    MultispendEvent as MultispendEventContent,
    VectorDiff,
    RpcMatrixMembership,
    RpcMultispendGroupStatus,
    RpcSerializedRoomInfo,
    RpcTimelineItemEvent,
    RpcMsgLikeKind,
    RpcMatrixPaymentStatus,
    RpcUserPowerLevel,
} from './bindings'
import { MultispendTransactionListEntry } from './fedimint'

export enum MatrixSyncStatus {
    uninitialized = 'uninitialized',
    stopped = 'stopped',
    initialSync = 'initialSync',
    syncing = 'syncing',
    synced = 'synced',
}

export interface MatrixAuth {
    userId: string
    deviceId: string
    displayName?: string
    avatarUrl?: string
}

export interface MatrixRoomPowerLevels {
    ban?: number
    invite?: number
    kick?: number
    redact?: number
    state_default?: number
    events_default?: number
    events?: Record<string, number>
    users?: Record<string, number>
}

export type MatrixGroupPreview = {
    info: MatrixRoom
    timeline: MatrixEvent[]
    isDefaultGroup?: boolean
}

export type MatrixRoom = Omit<RpcSerializedRoomInfo, 'preview'> & {
    preview: MatrixEvent | null
    isBlocked?: boolean
    broadcastOnly?: boolean
    inviteCode?: string
}

export type MatrixRoomState = 'Joined' | 'Left' | 'Invited'

export enum MatrixRoomListItemStatus {
    loading = 'loading',
    ready = 'ready',
}

export type MatrixRoomListItem =
    | { status: 'loading'; id?: undefined }
    | { status: 'ready'; id: MatrixRoom['id'] }

export type MatrixRoomListStreamUpdates = VectorDiff<MatrixRoomListItem>[]

export interface MatrixUser {
    id: string
    displayName?: string
    avatarUrl?: string
}

export interface MatrixRoomMember extends MatrixUser {
    roomId: MatrixRoom['id']
    powerLevel: RpcUserPowerLevel
    membership: RpcMatrixMembership
    ignored: boolean
}

export type PreviewMediaEventContent = {
    msgtype: 'xyz.fedi.preview-media'
    body: string
    info: {
        mimetype: string
        w: number
        h: number
        uri: string
    }
}

type PreviewMediaEvent = Omit<RpcTimelineItemEvent, 'content'> & {
    content: PreviewMediaEventContent
}

// Fake Events inserted by the frontend
// TODO: refactor components NOT to do this
type InternalEvent = PreviewMediaEvent

export const InternalEventKinds = ['xyz.fedi.preview-media'] as const
type InternalEventKind = (typeof InternalEventKinds)[number]

// List of kinds so we can check for membership in runtime
export const RpcMatrixEventKinds = [
    'm.text',
    'm.image',
    'm.video',
    'm.audio',
    'm.file',
    'm.notice',
    'm.emote',
    'xyz.fedi.payment',
    'xyz.fedi.form',
    'xyz.fedi.multispend',
    'xyz.fedi.federationInvite',
    'xyz.fedi.communityInvite',
    'm.poll',
    // 'm.room.encrypted',
    // 'xyz.fedi.deleted',
    'redacted',
    'unableToDecrypt',
    'failedToParseCustom',
    'unknown',
] as const satisfies RpcMsgLikeKind['msgtype'][]
export type RpcMatrixEventKind = (typeof RpcMatrixEventKinds)[number]

// Includes both Rpc types and internal fake types
export type TimelineItemEvent = RpcTimelineItemEvent | InternalEvent
export type MatrixEventKind = TimelineItemEvent['content']['msgtype']

// Must do this to extract on a deeply nested type and maintain
// all properties
type PickMatrixEventKind<K extends MatrixEventKind> =
    TimelineItemEvent extends infer T
        ? T extends { content: infer C }
            ? C extends { msgtype: K }
                ? T & { roomId: string }
                : never
            : never
        : never

export type MultispendEvent = PickMatrixEventKind<'xyz.fedi.multispend'>

// Matrix timeline event with the roomId added
export type MatrixEvent<K extends MatrixEventKind = MatrixEventKind> =
    PickMatrixEventKind<K>

export type MatrixEventContentType<K extends MatrixEventKind> =
    MatrixEvent<K>['content']

export type RpcMatrixEvent = MatrixEvent<RpcMatrixEventKind>
export type InternalMatrixEvent = MatrixEvent<InternalEventKind>

// Must do this to extract on a deeply nested type and maintain
// all properties
type PickMultispendEventKind<K extends MultispendEventKind> =
    MatrixEvent<'xyz.fedi.multispend'> extends infer T
        ? T extends { content: infer C }
            ? C extends { kind: K }
                ? T & { roomId: string }
                : never
            : never
        : never

export type MatrixMultispendEvent<
    T extends MultispendEventKind = MultispendEventKind,
> = PickMultispendEventKind<T> & { roomId: string }

// TBD refactor to diff before filtering
export type MatrixTimelineStreamUpdates = VectorDiff<MatrixEvent | null>[]

export type MatrixError = Error

export enum MatrixPowerLevel {
    Member = 0,
    Moderator = 50,
    Admin = 100,
}

export type MultispendRole = 'member' | 'voter' | 'proposer'

export interface MatrixSearchResults {
    results: MatrixUser[]
    limited: boolean
}

export type MatrixPaymentStatus = RpcMatrixPaymentStatus

export const MatrixPaymentStatuses = [
    'pushed',
    'requested',
    'accepted',
    'rejected',
    'canceled',
    'received',
] as const satisfies MatrixPaymentStatus[]

export type MatrixPaymentEventContent =
    MatrixEvent<'xyz.fedi.payment'>['content']

export type MatrixFormEventContent = MatrixEvent<'xyz.fedi.form'>['content']

export type MatrixFormEvent = MatrixEvent<'xyz.fedi.form'>
export type MatrixPaymentEvent = MatrixEvent<'xyz.fedi.payment'>
export type MatrixFederationInviteEvent =
    MatrixEvent<'xyz.fedi.federationInvite'>
export type MatrixCommunityInviteEvent = MatrixEvent<'xyz.fedi.communityInvite'>

export type StateEvent = {
    content: JSONObject
    state_key?: string
    type: string
}
/** Taken from matrix-js-sdk's `ICreateRoomOpts` */
export type MatrixCreateRoomOptions = {
    visibility?: 'public' | 'private'
    name?: string
    topic?: string
    preset?: 'private_chat' | 'trusted_private_chat' | 'public_chat'
    creation_content?: JSONObject
    invite?: string[]
    is_direct?: boolean
    power_level_content_override?: {
        ban?: number
        events?: Record<string | string, number>
        events_default?: number
        invite?: number
        kick?: number
        notifications?: Record<string, number>
        redact?: number
        state_default?: number
        users?: Record<string, number>
        users_default?: number
    }
    initial_state?: StateEvent[]
}

export type InputAttachment = {
    fileName: string
    uri: string
    mimeType: string
}

export type InputMedia = InputAttachment & {
    width: number
    height: number
}

export type MultispendActiveInvitation = Extract<
    RpcMultispendGroupStatus,
    { status: 'activeInvitation' }
>

export type MultispendFinalized = Extract<
    RpcMultispendGroupStatus,
    { status: 'finalized' }
>

export type MultispendWithdrawalEvent = Extract<
    MultispendTransactionListEntry,
    { state: 'withdrawal' }
>

export type MultispendDepositEvent = Extract<
    MultispendTransactionListEntry,
    { state: 'deposit' }
>

export type MultispendFilterOption =
    | 'all'
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'failed'

// Extracts only the invitation events from the transaction list
export type MultispendListedInvitationEvent = Extract<
    MultispendTransactionListEntry,
    { state: 'groupInvitation' }
>

export type MultispendEventKind = MultispendEventContent['kind']

export type MultispendInvitationEvent = MatrixMultispendEvent<'groupInvitation'>

export type MultispendInvitationVoteEvent =
    MatrixMultispendEvent<'groupInvitationVote'>

export const SelectableEventKinds = [
    'm.text',
    'm.image',
    'm.video',
    'm.audio',
    'm.file',
    'm.notice',
    'm.emote',
    'm.poll',
    'xyz.fedi.payment',
    'xyz.fedi.federationInvite',
    'xyz.fedi.communityInvite',
] as const satisfies MatrixEventKind[]
export type SelectableMessageKind = (typeof SelectableEventKinds)[number]

export const UnsendableMessageKinds = [
    'unknown',
    // 'm.room.encrypted',
    // 'xyz.fedi.deleted',
    'redacted',
    'unableToDecrypt',
    'failedToParseCustom',
    'xyz.fedi.preview-media',
    'xyz.fedi.multispend',
] as const satisfies MatrixEventKind[]

type UnsendableMessageKind = (typeof UnsendableMessageKinds)[number]
export type SendableMessageKind = Exclude<
    MatrixEventKind,
    UnsendableMessageKind
>

export type MatrixSendableContent<
    T extends SendableMessageKind = SendableMessageKind,
> =
    // Removes the formatted field ONLY from the types that have it.
    | Exclude<MatrixEventContentType<T>, { formatted: unknown }>
    | Omit<MatrixEventContentType<T>, 'formatted'>

/** some matrix message types aren't supposed to be sent. */
export type SendableMatrixEvent = MatrixEvent<SendableMessageKind>

// Replies will always have a body
export type ReplyMessageData =
    Extract<RpcTimelineItemEvent['inReply'], { kind: 'ready' }> extends infer T
        ? T extends { content: infer C }
            ? C extends { body: string }
                ? T
                : never
            : never
        : never

export type MatrixMentions = {
    user_ids?: string[] // users explicitly mentioned
    room?: boolean // @room / @everyone
}

export interface MentionData {
    userId: string
    displayName: string
    startIndex: number
    endIndex: number
}

export interface MentionExtractionResult {
    mentionedUserIds: string[]
    hasRoomMention: boolean
    formattedMentions: MentionData[]
}

export interface MentionParsingResult {
    mentions: MatrixMentions
    formattedBody: string
}

export type MentionSelect =
    | MatrixRoomMember
    | { id: '@room'; displayName: typeof ROOM_MENTION }

export type RoomItem = {
    id: '@room'
    displayName: typeof ROOM_MENTION
    kind: 'room'
}
export type MemberItem = MatrixRoomMember & { kind: 'member' }
export type MentionItem = RoomItem | MemberItem
