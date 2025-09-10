import type {
    MatrixEventContent,
    MultispendEventContentType,
} from '../utils/matrix'
import type {
    JSONObject,
    MultispendEvent,
    VectorDiff,
    RpcMatrixMembership,
    RpcMultispendGroupStatus,
} from './bindings'
import { MultispendTransactionListEntry } from './fedimint'

export { MatrixEventContent }

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

export interface MatrixRoomPreview {
    senderId: string
    eventId: string
    displayName: string
    avatarUrl?: string
    body: string
    timestamp: number
    isDeleted: boolean
}
export type MatrixGroupPreview = {
    info: MatrixRoom
    timeline: MatrixTimelineItem[]
    isDefaultGroup?: boolean
}

export type MatrixRoom = {
    id: string
    name: string
    avatarUrl?: string
    preview?: MatrixRoomPreview
    directUserId?: MatrixUser['id']
    broadcastOnly?: boolean
    notificationCount: number | undefined
    isMarkedUnread?: boolean
    joinedMemberCount?: number
    isPreview?: boolean
    isPublic?: boolean
    isBlocked?: boolean
    inviteCode: string
    roomState: MatrixRoomState
    recencyStamp?: number
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
    powerLevel: number
    membership: RpcMatrixMembership
    ignored: boolean
}

export enum MatrixEventStatus {
    pending = 'pending',
    sent = 'sent',
    failed = 'failed',
    cancelled = 'cancelled',
}

export interface MatrixEvent<
    Content extends MatrixEventContent = MatrixEventContent,
> {
    id: string
    content: Content
    status: MatrixEventStatus
    roomId: MatrixRoom['id']
    txnId?: string
    eventId?: string
    timestamp: number
    senderId: MatrixUser['id'] | null
    error: string | null
}

export type MatrixTimelineItem = MatrixEvent | null

export type MatrixTimelineStreamUpdates = VectorDiff<MatrixTimelineItem>[]

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

export enum MatrixPaymentStatus {
    /** Payment was pushed, can move to `canceled` or `received` */
    pushed = 'pushed',
    /** Payment was requested, can move to `accepted`, `rejected`, or `canceled` */
    requested = 'requested',
    /** Payment request was accepted and paid, can move to `canceled` or `received` */
    accepted = 'accepted',
    /** Payment request was rejected, no further statuses */
    rejected = 'rejected',
    /** Payment was canceled, no further statuses */
    canceled = 'canceled',
    /** Payment was received, no further statuses */
    received = 'received',
}

type PickEventContentType<
    T,
    K extends MatrixEventContent['msgtype'],
> = T extends { msgtype: K } ? T : never

export type MatrixPaymentEventContent = PickEventContentType<
    MatrixEventContent,
    'xyz.fedi.payment'
>

export type MatrixPaymentEvent = MatrixEvent<MatrixPaymentEventContent>

export type MatrixFormEventContent = PickEventContentType<
    MatrixEventContent,
    'xyz.fedi.form'
>

export type MatrixFormEvent = MatrixEvent<MatrixFormEventContent>

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
export type MultispendListedInvitationEvent =
    MultispendTransactionListEntry extends infer T
        ? T extends { state: 'groupInvitation' }
            ? T
            : never
        : never

export type MultispendEventKind = MultispendEvent['kind']

export type MultispendInvitationEvent = MatrixEvent<
    MultispendEventContentType<'groupInvitation'>
>
export type MultispendInvitationVoteEvent = MatrixEvent<
    MultispendEventContentType<'groupInvitationVote'>
>
