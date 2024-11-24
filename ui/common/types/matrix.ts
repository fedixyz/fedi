import type { MatrixEventContent } from '../utils/matrix'
import type { ObservableVecUpdate, RpcMatrixMembership } from './bindings'

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
    events?: Record<string, number | undefined>
    users?: Record<string, number | undefined>
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

export interface MatrixRoom {
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
    inviteCode: string
    roomState: MatrixRoomState
}

export type MatrixRoomState = 'Joined' | 'Left' | 'Invited'

export enum MatrixRoomListItemStatus {
    loading = 'loading',
    ready = 'ready',
}

export type MatrixRoomListItem =
    | { status: 'loading'; id?: undefined }
    | { status: 'ready'; id: MatrixRoom['id'] }

export type MatrixRoomListObservableUpdates =
    ObservableVecUpdate<MatrixRoomListItem>['update']

export interface MatrixUser {
    id: string
    displayName?: string
    avatarUrl?: string
}

export interface MatrixRoomMember extends MatrixUser {
    roomId: MatrixRoom['id']
    powerLevel: number
    membership: RpcMatrixMembership
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
    error: Error | null
}

export type MatrixTimelineItem = MatrixEvent | null

export type MatrixTimelineObservableUpdates =
    ObservableVecUpdate<MatrixTimelineItem>['update']

export type MatrixError = Error

export enum MatrixPowerLevel {
    Member = 0,
    Moderator = 50,
    Admin = 100,
}

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

interface StateEvent {
    content: object
    state_key?: string
    type: string
}
/** Taken from matrix-js-sdk's `ICreateRoomOpts` */
export interface MatrixCreateRoomOptions {
    visibility?: 'public' | 'private'
    name?: string
    topic?: string
    preset?: 'private_chat' | 'trusted_private_chat' | 'public_chat'
    creation_content?: object
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
