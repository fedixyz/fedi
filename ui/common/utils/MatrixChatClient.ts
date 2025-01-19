import EventEmitter from 'events'

import {
    GLOBAL_MATRIX_PUSH_SERVER,
    INVALID_NAME_PLACEHOLDER,
} from '../constants/matrix'
import {
    MatrixAuth,
    MatrixCreateRoomOptions,
    MatrixError,
    MatrixEventStatus,
    MatrixRoom,
    MatrixRoomListItem,
    MatrixRoomListItemStatus,
    MatrixRoomListObservableUpdates,
    MatrixRoomMember,
    MatrixRoomPowerLevels,
    MatrixSearchResults,
    MatrixSyncStatus,
    MatrixTimelineItem,
    MatrixTimelineObservableUpdates,
    MatrixUser,
} from '../types'
import {
    JSONObject,
    ObservableUpdate,
    ObservableVecUpdate,
    RpcBackPaginationStatus,
    RpcMatrixAccountSession,
    RpcMatrixUserDirectorySearchResponse,
    RpcRoomListEntry,
    RpcRoomMember,
    RpcRoomNotificationMode,
} from '../types/bindings'
import { DisplayNameValidatorType, getDisplayNameValidator } from './chat'
import { isDev } from './environment'
import { FedimintBridge } from './fedimint'
import { makeLog } from './log'
import {
    MatrixEventContent,
    encodeFediMatrixRoomUri,
    formatMatrixEventContent,
    mxcUrlToHttpUrl,
} from './matrix'
import {
    getNewObservableIds,
    makeInitialResetUpdate,
    mapObservableUpdates,
} from './observable'

const log = makeLog('MatrixChatClient')

export enum UserPowerLevel {
    User = 0,
    Moderator = 50,
    Admin = 100,
}

interface MatrixChatClientEventMap {
    status: MatrixSyncStatus
    roomListUpdate: MatrixRoomListObservableUpdates
    roomInfo: MatrixRoom
    roomMember: MatrixRoomMember
    roomMembers: {
        roomId: MatrixRoom['id']
        members: MatrixRoomMember[]
    }
    roomTimelineUpdate: {
        roomId: string
        updates: MatrixTimelineObservableUpdates
    }
    roomPowerLevels: {
        roomId: MatrixRoom['id']
        powerLevels: MatrixRoomPowerLevels
    }
    roomNotificationMode: {
        roomId: MatrixRoom['id']
        mode: RpcRoomNotificationMode
    }
    user: MatrixUser
    error: MatrixError
    auth: MatrixAuth
}
type ClientObserverKind = keyof Pick<
    MatrixChatClientEventMap,
    'status' | 'roomListUpdate'
>

export class MatrixChatClient {
    hasStarted = false

    private emitter = new EventEmitter()
    private fedimint!: FedimintBridge
    private startPromise: Promise<MatrixAuth> | undefined
    private observers: Record<number, (update: ObservableUpdate<any>) => void> =
        {}
    private roomObserverMap: Record<
        MatrixRoom['id'],
        { info?: number; timeline?: number } | undefined
    > = {}
    private clientObserverMap: Partial<Record<ClientObserverKind, number>> = {}
    private displayNameValidator: DisplayNameValidatorType | undefined

    /*** Public methods ***/

    async start(fedimint: FedimintBridge) {
        if (this.startPromise) {
            return this.startPromise
        }
        this.hasStarted = true
        this.fedimint = fedimint
        if (!this.displayNameValidator) {
            this.displayNameValidator = getDisplayNameValidator()
        }

        fedimint.addListener('observableUpdate', ev => {
            // This is noisy, but can be helpful for debugging
            if (isDev())
                log.debug('Received observable update', JSON.stringify(ev))
            this.handleObservableUpdate(ev)
        })

        this.startPromise = new Promise((resolve, reject) => {
            fedimint
                .matrixInit()
                .then(() => this.getInitialAuth())
                .then(auth => {
                    // resolve cached auth before fetching anything
                    // to support offline UX
                    resolve(auth)

                    // try to refetch auth in the background to
                    // asynchronously get the user's avatarUrl
                    this.refetchAuth()

                    this.observeRoomList()
                        .then(() => {
                            // Wait until after the roomlist is observed
                            // to prevent flickering on startup
                            this.observeSyncStatus()
                        })
                        .catch(reject)
                })
                .catch(err => {
                    log.error('matrixInit', err)
                    reject(err)
                })
        })

        return this.startPromise
    }

    async getInitialAuth() {
        // Don't emit cached auth to make sure the startPromise
        // resolves before matrixAuth is set
        return this.getAccountSession()
    }

    async refetchAuth() {
        const auth = await this.getAccountSession(false)
        this.emit('auth', auth)
    }

    private async getAccountSession(cached = true) {
        const session = await this.fedimint.matrixGetAccountSession({ cached })
        return this.serializeAuth(session)
    }

    // arrow function notation is important here! otherwise this.fedimint is
    // can be undefined for some reason, idk why exactly...
    // TODO: consider whether other functions are also at risk of this.fedimint being undefined?
    getRoomPreview = async (roomId: string) => {
        let previewInfo: MatrixRoom
        let previewTimeline: MatrixTimelineItem[]
        try {
            const publicRoomInfo = await this.fedimint.matrixPublicRoomInfo({
                roomId,
            })
            previewInfo = this.serializePublicRoomInfo(publicRoomInfo)
        } catch (error) {
            log.error('Failed to get room preview info', roomId, error)
            throw error
        }
        try {
            const previewContent = await this.fedimint.matrixRoomPreviewContent(
                {
                    roomId,
                },
            )
            previewTimeline = previewContent.map(item =>
                this.serializeTimelineItem(item, roomId),
            )
        } catch (error) {
            log.error('Failed to get room preview timeline', roomId, error)
            throw error
        }
        return {
            info: previewInfo,
            timeline: previewTimeline,
        }
    }

    async joinRoom(roomId: string, isPublic?: boolean) {
        if (isPublic) {
            await this.fedimint.matrixRoomJoinPublic({ roomId })
        } else {
            await this.fedimint.matrixRoomJoin({ roomId })
        }
    }

    async createRoom(options: MatrixCreateRoomOptions = {}) {
        const roomId = await this.fedimint.matrixRoomCreate({
            request: options,
        })
        return { roomId }
    }

    async leaveRoom(roomId: string) {
        await this.fedimint.matrixRoomLeave({ roomId })
    }

    observeRoom(roomId: string) {
        this.observeRoomTimeline(roomId).catch(err => {
            log.warn('Failed to observe room', { roomId, err })
        })
        this.observeRoomMembers(roomId).catch(err => {
            log.warn('Failed to observe room members', { roomId, err })
        })
        this.observeRoomPowerLevels(roomId).catch(err => {
            log.warn('Failed to observe room power levels', { roomId, err })
        })
    }

    unobserveRoom(roomId: string) {
        const observers = this.roomObserverMap[roomId]
        if (
            observers &&
            observers.timeline !== undefined &&
            observers.timeline !== Number.MAX_SAFE_INTEGER
        ) {
            const { timeline, ...rest } = observers
            this.unobserve(timeline)
            this.roomObserverMap[roomId] = rest
        }
    }

    async setRoomTopic(roomId: string, topic: string) {
        await this.fedimint.matrixRoomSetTopic({ roomId, topic })
    }

    async setRoomName(roomId: string, name: string) {
        await this.fedimint.matrixRoomSetName({ roomId, name })
    }

    async setRoomPowerLevels(
        roomId: string,
        powerLevels: MatrixRoomPowerLevels,
    ) {
        const oldPowerLevels = await this.fedimint.matrixRoomGetPowerLevels({
            roomId,
        })
        const newPowerLevels = {
            ...oldPowerLevels,
            ...powerLevels,
        }
        await this.fedimint.matrixRoomSetPowerLevels({
            roomId,
            new: newPowerLevels,
        })
        return newPowerLevels
    }

    async inviteUserToRoom(roomId: string, userId: string) {
        await this.fedimint.matrixRoomInviteUserById({ roomId, userId })
        // TODO: remove me when new members are actually observed

        // TODO: Remove timeouts, inviting new members is kinda racey.
        await new Promise(resolve => setTimeout(resolve, 500))
        await this.observeRoomMembers(roomId)
    }

    async setRoomNotificationMode(
        roomId: string,
        mode: RpcRoomNotificationMode,
    ) {
        await this.fedimint.matrixRoomSetNotificationMode({
            roomId,
            mode,
        })
    }

    async setRoomMemberPowerLevel(
        roomId: string,
        userId: string,
        powerLevel: number,
    ) {
        const oldPowerLevels = await this.fedimint.matrixRoomGetPowerLevels({
            roomId,
        })
        // TODO: narrow return type of matrixRoomGetPowerLevels RPC.
        const users = (oldPowerLevels.users as Record<string, number>) || {}
        users[userId] = powerLevel
        const newPowerLevels = {
            ...oldPowerLevels,
            users,
        }
        await this.fedimint.matrixRoomSetPowerLevels({
            roomId,
            new: newPowerLevels,
        })
        return newPowerLevels
    }

    async sendMessage(roomId: string, content: MatrixEventContent) {
        const { msgtype, body, ...data } = content
        await this.fedimint.matrixSendMessageJson({
            roomId,
            msgtype,
            body,
            // TODO: Update zod schemas to remove .passthrough() & remove this cast
            data: data as JSONObject,
        })
    }

    /**
     * Special wrapper around `sendMessage`, takes in a user ID instead of a
     * room ID, and creates a direct message room if one doesn't exist.
     */
    async sendDirectMessage(userId: string, content: MatrixEventContent) {
        const roomId = await this.fedimint.matrixRoomCreateOrGetDm({ userId })
        // TODO: Remove timeouts, creating rooms is kinda racey.
        await new Promise(resolve => setTimeout(resolve, 500))
        await this.observeRoomInfo(roomId)
        await new Promise(resolve => setTimeout(resolve, 500))
        await this.sendMessage(roomId, content)
        await this.observeRoomTimeline(roomId)
        await this.observeRoomPowerLevels(roomId)
        return { roomId }
    }

    async userDirectorySearch(
        searchTerm: string,
    ): Promise<MatrixSearchResults> {
        return this.fedimint
            .matrixUserDirectorySearch({
                searchTerm,
                limit: 10,
            })
            .then(this.serializeUserDirectorySearchResponse)
    }

    async fetchMatrixProfile(userId: MatrixUser['id']) {
        // TODO: Add narrower types to matrixUserProfile RPC
        return await this.fedimint.matrixUserProfile({ userId })
    }

    async setDisplayName(displayName: string) {
        await this.fedimint.matrixSetDisplayName({
            displayName: this.ensureDisplayName(displayName) ?? displayName,
        })
    }

    async setAvatarUrl(avatarUrl: string) {
        await this.fedimint.matrixSetAvatarUrl({ avatarUrl })
    }

    async roomPaginateTimeline(roomId: string, eventNum: number) {
        // Must register an observable and use that to tell when to resolve
        // the request, since `matrixRoomTimelineItemsPaginateBackwards`
        // returns immediately, and it's not until the observable returns
        // to `idle` that we're done.
        // We also check the initial response, since if we're already at the
        // beginning, we don't need to paginate at all.
        const { id, initial } =
            await this.fedimint.matrixRoomObserveTimelineItemsPaginateBackwards(
                { roomId },
            )
        if (initial === 'timelineStartReached') {
            this.fedimint.matrixObserverCancel({ id: id as unknown as bigint })
            return { end: true }
        }

        return new Promise<{ end: boolean }>((resolve, reject) => {
            this.observe(
                id,
                (update: ObservableUpdate<RpcBackPaginationStatus>) => {
                    if (update.update === 'idle') {
                        resolve({ end: false })
                        this.unobserve(id)
                    } else if (update.update === 'timelineStartReached') {
                        resolve({ end: true })
                        this.unobserve(id)
                    }
                },
            )
            this.fedimint
                .matrixRoomTimelineItemsPaginateBackwards({
                    roomId,
                    eventNum,
                })
                .catch(reject)
        })
    }

    async sendReadReceipt(roomId: string, eventId: string) {
        return this.fedimint.matrixRoomSendReceipt({ roomId, eventId })
    }

    async markRoomAsUnread(roomId: string, unread: boolean) {
        return this.fedimint.matrixRoomMarkAsUnread({ roomId, unread })
    }

    async refetchRoomMembers(roomId: string) {
        await this.observeRoomMembers(roomId)
    }

    async refetchRoomList() {
        // Clear existing observer
        const oldId = this.clientObserverMap['roomListUpdate']

        if (typeof oldId === 'number' && oldId !== Number.MAX_SAFE_INTEGER) {
            await this.unobserve(oldId)
            delete this.clientObserverMap['roomListUpdate']
        }
        // Recreate observer with fresh "initial list"
        await this.observeRoomList()
    }

    async refreshSyncStatus() {
        // Clear existing observer
        const oldId = this.clientObserverMap['status']
        log.debug('refreshSyncStatus oldId', oldId)

        if (typeof oldId === 'number' && oldId !== Number.MAX_SAFE_INTEGER) {
            log.debug('clearing observer:', oldId)
            await this.unobserve(oldId)
            delete this.clientObserverMap['status']
        }
        // Recreate observer with fresh "initial list"
        await this.observeSyncStatus()
    }

    async configureNotificationsPusher(
        token: string,
        appId: string,
        appName: string,
    ) {
        log.info('appId', appId)
        return this.fedimint.matrixSetPusher({
            pusher: {
                kind: 'http',
                app_display_name: appName,
                // TODO: get device name from device ID?
                device_display_name: 'Device',
                // TODO: get locale from device?
                lang: 'en',
                // TODO: how to pass the URL to bridge? or should this be hard-coded bridge-side?
                data: {
                    format: 'event_id_only',
                    url: `${GLOBAL_MATRIX_PUSH_SERVER}/_matrix/push/v1/notify`,
                },
                app_id: appId,
                pushkey: token,
            },
        })
    }

    async ignoreUser(userId: string) {
        return this.fedimint.matrixIgnoreUser({ userId })
    }

    async unignoreUser(userId: string) {
        return this.fedimint.matrixUnignoreUser({ userId })
    }

    async roomKickUser(roomId: string, userId: string, reason?: string) {
        await this.fedimint.matrixRoomKickUser({
            roomId,
            userId,
            reason: reason ?? null,
        })
        // Refetch room members
        await this.observeRoomMembers(roomId)
    }

    async roomBanUser(roomId: string, userId: string, reason?: string) {
        await this.fedimint.matrixRoomBanUser({
            roomId,
            userId,
            reason: reason ?? null,
        })
        // Refetch room members
        await this.observeRoomMembers(roomId)
    }

    async roomUnbanUser(roomId: string, userId: string, reason?: string) {
        await this.fedimint.matrixRoomUnbanUser({
            roomId,
            userId,
            reason: reason ?? null,
        })
        // Refetch room members
        await this.observeRoomMembers(roomId)
    }

    emit<TEventName extends keyof MatrixChatClientEventMap>(
        eventName: TEventName,
        argument: MatrixChatClientEventMap[TEventName],
    ) {
        this.emitter.emit(eventName, argument)
    }

    on<TEventName extends keyof MatrixChatClientEventMap>(
        eventName: TEventName,
        handler: (argument: MatrixChatClientEventMap[TEventName]) => void,
    ) {
        this.emitter.on(eventName, handler)
    }

    off<TEventName extends keyof MatrixChatClientEventMap>(
        eventName: TEventName,
        handler: (argument: MatrixChatClientEventMap[TEventName]) => void,
    ) {
        this.emitter.off(eventName, handler)
    }

    removeAllListeners(event?: keyof MatrixChatClientEventMap) {
        this.emitter.removeAllListeners(event)
    }

    /*** Private methods ***/

    private observe<T>(
        id: number,
        handleUpdate: (update: ObservableUpdate<T>) => void,
    ) {
        this.observers[id] = handleUpdate
    }

    private unobserve(id: number) {
        return this.fedimint
            .matrixObserverCancel({ id: id as unknown as bigint })
            .then(() => {
                if (this.observers[id]) delete this.observers[id]
            })
            .catch(err => {
                log.warn('Failed to cancel observer', { id, err })
            })
    }

    private handleObservableUpdate(update: ObservableUpdate<unknown>) {
        const observer = this.observers[update.id]
        if (!observer) {
            log.info(
                'Received observable update without associated observer handler',
                JSON.stringify(update),
            )
            return this.unobserve(update.id)
        }
        observer(update)
    }

    private async observeSyncStatus() {
        log.debug(
            'observeSyncStatus this.clientObserverMap[status]',
            this.clientObserverMap['status'],
        )
        // Only observe the sync status once, subsequent calls are no-ops.
        if (this.clientObserverMap['status'] !== undefined) return

        // Immediately add to the map with a fake id to prevent additional calls.
        this.clientObserverMap['status'] = Number.MAX_SAFE_INTEGER

        const { id, initial } = await this.fedimint.matrixObserveSyncIndicator()

        // Update the map with the real id
        this.clientObserverMap['status'] = id

        const handleEmit = (status: typeof initial) => {
            this.emit(
                'status',
                status === 'show'
                    ? MatrixSyncStatus.syncing
                    : MatrixSyncStatus.synced,
            )
        }
        handleEmit(initial)

        this.observe(id, (update: ObservableUpdate<typeof initial>) => {
            log.debug(
                'Recieved syncStatus observable update',
                JSON.stringify(update),
            )
            handleEmit(update.update)
        })
    }

    private async observeRoomList() {
        // Only observe the roomList once, subsequent calls are no-ops.
        if (this.clientObserverMap['roomListUpdate'] !== undefined) return

        // Immediately add to the map with a fake id to prevent additional calls.
        this.clientObserverMap['roomListUpdate'] = Number.MAX_SAFE_INTEGER

        const { id, initial } = await this.fedimint.matrixRoomList()

        // Update the map with the real id
        this.clientObserverMap['roomListUpdate'] = id

        // Emit a fake "update" using the initial values
        this.emit(
            'roomListUpdate',
            makeInitialResetUpdate(initial.map(this.serializeRoomListItem)),
        )

        // Join rooms we're invited to

        // Listen and emit on observable updates
        this.observe(id, (update: ObservableVecUpdate<RpcRoomListEntry>) => {
            this.emit(
                'roomListUpdate',
                mapObservableUpdates(update.update, this.serializeRoomListItem),
            )
            getNewObservableIds(update.update, room =>
                room.kind !== 'empty' && room.kind !== 'invalidated'
                    ? room.value
                    : false,
            ).forEach(roomId => {
                this.observeRoomInfo(roomId).catch(err =>
                    log.warn('Failed to observe room info', {
                        roomId,
                        err,
                    }),
                )
                this.observeRoomPowerLevels(roomId).catch(err =>
                    log.warn('Failed to observe room power levels', {
                        roomId,
                        err,
                    }),
                )
                this.observeRoomNotificationMode(roomId).catch(err =>
                    log.warn('Failed to observe room notification mode', {
                        roomId,
                        err,
                    }),
                )
            })
        })

        // Observe all of the rooms
        await Promise.all(
            initial.map(async room => {
                if ('value' in room) {
                    await this.observeRoomInfo(room.value)
                    await this.observeRoomPowerLevels(room.value)
                    await this.observeRoomNotificationMode(room.value)
                }
            }),
        )
    }
    // private async

    private async observeRoomInfo(roomId: string) {
        // Only observe a room once, subsequent calls are no-ops.
        if (this.roomObserverMap[roomId]?.info !== undefined) return

        // Immediately add to the map with a fake id to prevent additional calls.
        this.roomObserverMap[roomId] = {
            ...this.roomObserverMap[roomId],
            info: Number.MAX_SAFE_INTEGER,
        }

        const { id, initial } = await this.fedimint.matrixRoomObserveInfo({
            roomId,
        })

        // Update the map with the real id
        this.roomObserverMap[roomId] = {
            ...this.roomObserverMap[roomId],
            info: id,
        }

        // Emit the initial info
        const room = this.serializeRoomInfo(initial)

        // Previously, room invite and room list were separate
        // but now they are combined.
        // All updates are merged too

        this.emit('roomInfo', room)

        // If it's a DM, fetch the member since it's small and we use recent DM users.
        if (room.directUserId) {
            this.observeRoomMembers(roomId).catch(err => {
                log.warn(
                    'Failed to observe room members from initial room info',
                    { roomId, err },
                )
            })

            // HACK: Observe all DMs to claim ecash in the background.
            // TODO: Move this to the bridge... intercept messages that contain
            // ecash and claim before passing to the frontend.
            this.observeRoomTimeline(roomId).catch(err => {
                log.warn('Failed to observe room timeline', { roomId, err })
            })
        }

        // Listen and emit on observable updates
        this.observe(id, (update: ObservableUpdate<unknown>) => {
            this.emit('roomInfo', this.serializeRoomInfo(update.update))
        })

        return initial
    }

    private async observeRoomTimeline(roomId: string) {
        // Only observe a room once, subsequent calls are no-ops.
        if (this.roomObserverMap[roomId]?.timeline !== undefined) return

        // Immediately add to the map with a fake id to prevent additional calls.
        this.roomObserverMap[roomId] = {
            ...this.roomObserverMap[roomId],
            timeline: Number.MAX_SAFE_INTEGER,
        }

        const { id, initial } = await this.fedimint.matrixRoomTimelineItems({
            roomId,
        })

        // Update the map with the real id
        this.roomObserverMap[roomId] = {
            ...this.roomObserverMap[roomId],
            timeline: id,
        }

        // Emit a fake "update" using the initial values
        this.emit('roomTimelineUpdate', {
            roomId,
            updates: makeInitialResetUpdate(
                initial.map(ev => this.serializeTimelineItem(ev, roomId)),
            ),
        })

        // Listen and emit on observable updates
        this.observe(id, (update: ObservableVecUpdate<RpcRoomListEntry>) => {
            this.emit('roomTimelineUpdate', {
                roomId,
                updates: mapObservableUpdates(update.update, ev =>
                    this.serializeTimelineItem(ev, roomId),
                ),
            })
        })
    }

    // Fake observe - just fetches
    private async observeRoomMembers(roomId: string) {
        // TODO: Listen for new room member events, re-fetch.
        // // Only observe room members once, subsequent calls are no-ops.
        // if (this.roomObserverMap[roomId]?.members !== undefined) return

        // // Immediately add to the map with a fake id to prevent additional calls.
        // this.roomObserverMap[roomId] = {
        //     ...this.roomObserverMap[roomId],
        //     members: Number.MAX_SAFE_INTEGER,
        // }

        const members = await this.fedimint.matrixRoomGetMembers({ roomId })
        const serializedMembers = members.map(member =>
            this.serializeRoomMember(member, roomId),
        )
        this.emit('roomMembers', { roomId, members: serializedMembers })
    }

    // Fake observe - just fetches
    private async observeRoomPowerLevels(roomId: string) {
        // TODO: Listen for room power level events, re-fetch.
        try {
            const powerLevels = await this.fedimint.matrixRoomGetPowerLevels({
                roomId,
            })
            this.emit('roomPowerLevels', { roomId, powerLevels })
        } catch (error) {
            log.warn('Failed to get power levels for roomId', roomId, error)
        }
    }

    private async observeRoomNotificationMode(roomId: string) {
        // TODO: Listen for notification mode, re-fetch. (observables)
        const mode = await this.fedimint.matrixRoomGetNotificationMode({
            roomId,
        })
        this.emit('roomNotificationMode', {
            roomId,
            // defaults to "allMessages"
            mode: mode ?? 'allMessages',
        })
    }

    private serializeRoomListItem(room: RpcRoomListEntry): MatrixRoomListItem {
        if (room.kind === 'empty' || room.kind === 'invalidated') {
            return { status: MatrixRoomListItemStatus.loading }
        } else {
            return {
                status: MatrixRoomListItemStatus.ready,
                id: room.value,
            }
        }
    }

    // TODO: get type for this from bridge?
    private serializePublicRoomInfo(room: any): MatrixRoom {
        return {
            id: room.room_id,
            name: room.name,
            // We need preview timeline items to determine this, which is a separate call.
            // For now leave this undefined, and just apply it with a redux selector.
            notificationCount: undefined,
            joinedMemberCount: room.num_joined_members || 0,
            // We need power levels to determine this, which is a separate call.
            // For now leave this undefined, and just apply it with a redux selector.
            // broadcastOnly: false,
            // Private rooms don't have previews so these are always true
            isPreview: true,
            isPublic: true,
            inviteCode: encodeFediMatrixRoomUri(room.room_id),
            // TODO: HACK - move this to bridge
            roomState: 'Invited',
        }
    }

    // TODO: get type for this from bridge?
    private serializeRoomInfo(room: any): MatrixRoom {
        const avatarUrl = room.base_info.avatar?.Original?.content?.url
        const directUserId = room.base_info.dm_targets?.[0]
        let preview: MatrixRoom['preview']
        if (room.latest_event) {
            const { event, sender_profile } = room.latest_event
            const isDeleted = !!event.event.unsigned?.redacted_because
            // Try to use the redaction timestamp if found, fallback to event timestamp
            const timestamp = isDeleted
                ? event.event.unsigned?.redacted_because.origin_server_ts ||
                  event.event.origin_server_ts
                : event.event.origin_server_ts
            preview = {
                eventId: event.event.event_id,
                senderId: sender_profile.Original.content.id,
                displayName: this.ensureDisplayName(
                    sender_profile.Original.content.displayname,
                ),
                avatarUrl: sender_profile.Original.content.avatar_url,
                body: event.event.content.body,
                // Deleted/redacted messages have this in the unsigned field
                isDeleted,
                timestamp,
            }
        }

        // TODO (cleanup): Remove base_info.name fallback
        // cached_display_name seems to be the best source of truth for the room name
        // for both groups and DMS assuming matrix-rust-sdk handles computing it correctly
        // but since it is a newer field we leave the base_info.name as a fallback temporarily
        const roomName =
            room.cached_display_name?.Calculated ||
            room.base_info.name?.Original?.content?.name

        return {
            directUserId,
            preview,
            id: room.room_id,
            name: directUserId ? this.ensureDisplayName(roomName) : roomName,
            notificationCount: room.read_receipts?.num_unread || 0,
            isMarkedUnread: room.base_info.is_marked_unread,
            // TODO: Sometimes non-dm room with 1 user has an avatar of the user, figure out how to stop that
            // TODO: Make opaque mxc type, have each component do the conversion with width / height args
            avatarUrl: avatarUrl
                ? mxcUrlToHttpUrl(avatarUrl, 200, 200, 'crop')
                : undefined,
            // We need power levels to determine this, which is a separate call.
            // For now leave this undefined, and just apply it with a redux selector.
            // broadcastOnly: false,
            isPublic: room.base_info.encryption === null,
            inviteCode: encodeFediMatrixRoomUri(room.room_id),
            // TODO: use zod OR export types more strictly...
            roomState: room.room_state,
        }
    }

    private serializeRoomMember(
        member: RpcRoomMember,
        roomId: string,
    ): MatrixRoomMember {
        return {
            roomId,
            id: member.userId,
            displayName: this.ensureDisplayName(member.displayName),
            powerLevel: member.powerLevel,
            membership: member.membership,
            // TODO: Make opaque mxc type, have each component do the conversion with width / height args
            avatarUrl: member.avatarUrl
                ? mxcUrlToHttpUrl(member.avatarUrl, 200, 200, 'crop')
                : undefined,
        }
    }

    private serializeAuth(auth: RpcMatrixAccountSession): MatrixAuth {
        return {
            userId: auth.userId,
            displayName: this.ensureDisplayName(auth.displayName),
            avatarUrl: auth.avatarUrl
                ? mxcUrlToHttpUrl(auth.avatarUrl, 200, 200, 'crop')
                : undefined,
            deviceId: auth.deviceId,
        }
    }

    private serializeUserDirectorySearchResponse = (
        res: RpcMatrixUserDirectorySearchResponse,
    ): MatrixSearchResults => {
        return {
            results: res.results.map(user => ({
                id: user.userId,
                displayName: this.ensureDisplayName(user.displayName),
                avatarUrl: user.avatarUrl
                    ? mxcUrlToHttpUrl(user.avatarUrl, 200, 200, 'crop')
                    : undefined,
            })),
            limited: res.limited,
        }
    }

    // TODO: get type for this from bridge?
    private serializeTimelineItem(
        item: any,
        roomId: string,
    ): MatrixTimelineItem {
        // Return null for items we don't want. Because observable updates work
        // on indexes, even if we don't want certain events we need to keep them
        // in the event list so that the updates apply properly. If we filtered
        // them out, the indexes would point to the wrong places.
        if (item.kind !== 'event') return null
        if (
            item.value.content.kind === 'json' &&
            item.value.content.value.type !== 'm.room.message'
        )
            return null

        // Map the status to an enum, include the error if it failed
        let status: MatrixEventStatus
        let error: Error | null = null
        if (!item.value.localEcho) {
            status = MatrixEventStatus.sent
        } else {
            const kind = item.value.sendState?.kind
            status =
                kind === 'sent'
                    ? MatrixEventStatus.sent
                    : kind === 'cancelled'
                    ? MatrixEventStatus.cancelled
                    : kind === 'sendingFailed'
                    ? MatrixEventStatus.failed
                    : MatrixEventStatus.pending
            if (status === MatrixEventStatus.failed) {
                error = new Error(
                    item.value.sendState?.error || 'Unknown error',
                )
            }
        }

        const eventContent = item.value.content
        let content: MatrixEventContent | undefined
        if (eventContent.kind === 'json') {
            content = eventContent.value.content
        } else {
            content = eventContent.value
        }
        /*
         * We detect and handle redacted messages in two ways:
         * 1) when a message is deleted in real-time, a timeline update fires a redactedMessage event kind
         * 2) when we load a timeline and find a deleted message, the event content contains the unsigned.redacted_because fields
         */
        if (eventContent.kind === 'redactedMessage') {
            content = {
                msgtype: 'xyz.fedi.deleted',
                body: '',
                redacts: item.value.eventId,
            }
        } else if (
            'unsigned' in eventContent.value &&
            'redacted_because' in eventContent.value.unsigned
        ) {
            content = {
                msgtype: 'xyz.fedi.deleted',
                body: '',
                ...eventContent.value.unsigned.redacted_because.content,
            }
        }

        if (!content) return null

        return {
            roomId,
            id: item.value.id,
            txnId: item.value.txnId,
            eventId: item.value.eventId,
            content: formatMatrixEventContent(content),
            timestamp: item.value.timestamp,
            senderId: item.value.sender,
            status,
            error,
        }
    }

    // Ref: https://github.com/fedibtc/fedi/issues/1184#issuecomment-2137529842
    private ensureDisplayName = (name: string | null) => {
        if (!name) return ''
        if (!this.displayNameValidator) return name
        const res = this.displayNameValidator.safeParse(name)
        if (res.success) return name
        // TODO: figure out efficient way to localize this.
        // What's a place this can live such that locales are accessible?
        // Ideally, we only want to validate a displayName once, so
        // this shouldn't live inside of the ui components.
        return INVALID_NAME_PLACEHOLDER
    }
}
