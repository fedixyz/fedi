import EventEmitter from 'events'

import {
    MatrixRoom,
    MatrixUser,
    MatrixError,
    MatrixRoomMember,
    MatrixSearchResults,
    MatrixAuth,
    MatrixCreateRoomOptions,
    MatrixTimelineObservableUpdates,
    MatrixRoomListObservableUpdates,
    MatrixRoomListItem,
    MatrixRoomListItemStatus,
    MatrixTimelineItem,
    MatrixEventStatus,
    MatrixRoomPowerLevels,
    MatrixSyncStatus,
} from '../types'
import {
    ObservableUpdate,
    ObservableVecUpdate,
    RpcBackPaginationStatus,
    RpcMatrixAccountSession,
    RpcMatrixUserDirectorySearchResponse,
    RpcRoomListEntry,
    RpcRoomMember,
} from '../types/bindings'
import { FedimintBridge } from './fedimint'
import { makeLog } from './log'
import {
    MatrixEventContent,
    formatMatrixEventContent,
    mxcUrlToHttpUrl,
} from './matrix'
import {
    applyObservableUpdates,
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
    user: MatrixUser
    error: MatrixError
}

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
    private roomInvites: RpcRoomListEntry[] = []
    private joinedInvites: Set<string> = new Set()

    /*** Public methods ***/

    async start({
        fedimint,
        homeServer,
        slidingSyncProxy,
    }: {
        fedimint: FedimintBridge
        homeServer: string
        slidingSyncProxy: string
    }) {
        if (this.startPromise) {
            return this.startPromise
        }
        this.hasStarted = true
        this.fedimint = fedimint

        fedimint.addListener('observableUpdate', ev => {
            log.debug('Received observable update', { ev })
            this.handleObservableUpdate(ev)
        })

        this.startPromise = new Promise((resolve, reject) => {
            fedimint
                .matrixInit({
                    homeServer,
                    slidingSyncProxy,
                })
                .then(auth => {
                    this.observeRoomList()
                        .then(() => {
                            resolve(this.serializeAuth(auth))
                            this.observeSyncStatus()
                            this.autoJoinInvites()
                        })
                        .catch(reject)
                })
                .catch(reject)
        })

        return this.startPromise
    }

    async getAccountSession() {
        return this.fedimint.matrixGetAccountSession()
    }

    async joinRoom(roomId: string) {
        await this.fedimint.matrixRoomJoin({ roomId })
    }

    async createRoom(options: MatrixCreateRoomOptions = {}) {
        const roomId = await this.fedimint.matrixRoomCreate({
            request: options,
        })
        // TODO: Remove timeouts, matrixCreateRoom is kind of racey.
        await new Promise(resolve => setTimeout(resolve, 500))
        await this.observeRoomInfo(roomId)
        await new Promise(resolve => setTimeout(resolve, 500))
        await this.observeRoomTimeline(roomId)
        await this.observeRoomPowerLevels(roomId)
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
        await this.observeRoomMembers(roomId)
    }

    async setRoomMemberPowerLevel(
        roomId: string,
        userId: string,
        powerLevel: number,
    ) {
        const oldPowerLevels = await this.fedimint.matrixRoomGetPowerLevels({
            roomId,
        })
        const users = oldPowerLevels.users || {}
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
            data,
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

    async setDisplayName(displayName: string) {
        await this.fedimint.matrixSetDisplayName({ displayName })
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
        if (!this.observers[id]) {
            log.warn('Attempted to cancel observer that does not exist', { id })
            return
        }
        this.fedimint
            .matrixObserverCancel({ id: id as unknown as bigint })
            .then(() => {
                delete this.observers[id]
            })
            .catch(err => {
                log.warn('Failed to cancel observer', { id, err })
            })
    }

    private handleObservableUpdate(update: ObservableUpdate<unknown>) {
        const observer = this.observers[update.id]
        if (!observer) {
            log.warn(
                'Received observable update without associated observer handler',
                { update },
            )
            return
        }
        observer(update)
    }

    private async observeSyncStatus() {
        const handleEmit = (status: typeof initial) => {
            this.emit(
                'status',
                status === 'show'
                    ? MatrixSyncStatus.syncing
                    : MatrixSyncStatus.synced,
            )
        }

        const { id, initial } = await this.fedimint.matrixObserveSyncIndicator()
        handleEmit(initial)

        this.observe(id, (update: ObservableUpdate<typeof initial>) => {
            handleEmit(update.update)
        })
    }

    private async observeRoomList() {
        const { id, initial } = await this.fedimint.matrixRoomList()
        // Emit a fake "update" using the initial values
        this.emit(
            'roomListUpdate',
            makeInitialResetUpdate(initial.map(this.serializeRoomListItem)),
        )

        // Observe all of the rooms
        await Promise.all(
            initial.map(async room => {
                if ('value' in room) {
                    await this.observeRoomInfo(room.value)
                    await this.observeRoomPowerLevels(room.value)
                }
            }),
        )

        // Listen and emit on observable updates
        this.observe(id, (update: ObservableVecUpdate<RpcRoomListEntry>) => {
            this.emit(
                'roomListUpdate',
                mapObservableUpdates(update.update, this.serializeRoomListItem),
            )
            getNewObservableIds(update.update, room =>
                room.kind !== 'empty' ? room.value : false,
            ).forEach(roomId => {
                this.observeRoomInfo(roomId).catch(err =>
                    log.warn('Failed to observe room info', {
                        roomId,
                        err,
                    })
                )
                this.observeRoomPowerLevels(roomId).catch(err =>
                    log.warn('Failed to observe room power levels', {
                        roomId,
                        err,
                    })
                )
            })
        })
    }

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
        this.emit('roomInfo', room)

        // If it's a DM, fetch the member since it's small and we use recent DM users.
        if (room.directUserId) {
            this.observeRoomMembers(roomId).catch(err => {
                log.warn(
                    'Failed to observe room members from initial room info',
                    { roomId, err },
                )
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

    private async observeRoomMembers(roomId: string) {
        // TODO: Listen for new room member events, re-fetch.
        const members = await this.fedimint.matrixRoomGetMembers({ roomId })
        members.forEach(member => {
            this.emit('roomMember', this.serializeRoomMember(member, roomId))
        })
    }

    private async observeRoomPowerLevels(roomId: string) {
        // TODO: Listen for room power level events, re-fetch.
        const powerLevels = await this.fedimint.matrixRoomGetPowerLevels({
            roomId,
        })
        this.emit('roomPowerLevels', { roomId, powerLevels })
    }

    private async autoJoinInvites() {
        const attemptJoins = () => {
            this.roomInvites.forEach(invite => {
                if (invite.kind === 'empty') return
                const roomId = invite.value
                if (this.joinedInvites.has(roomId)) return
                this.joinedInvites.add(invite.value)
                this.joinRoom(invite.value).catch(err => {
                    log.warn(
                        'Failed to auto-join invite, will try again later',
                        { invite, err },
                    )
                    this.joinedInvites.delete(invite.value)
                })
            })
        }

        const { id, initial } = await this.fedimint.matrixRoomListInvites()
        this.roomInvites = initial
        attemptJoins()

        // Listen and re-run auto accept on updates
        this.observe(id, (update: ObservableVecUpdate<RpcRoomListEntry>) => {
            this.roomInvites = applyObservableUpdates(
                this.roomInvites,
                update.update,
            )
            attemptJoins()
        })
    }

    private serializeRoomListItem(room: RpcRoomListEntry): MatrixRoomListItem {
        if (room.kind === 'empty') {
            return { status: MatrixRoomListItemStatus.loading }
        } else {
            return {
                status: MatrixRoomListItemStatus.ready,
                id: room.value,
            }
        }
    }

    // TODO: get type for this from bridge?
    private serializeRoomInfo(room: any): MatrixRoom {
        const avatarUrl = room.base_info.avatar?.Original?.content?.url
        const directUserId = room.base_info.dm_targets?.[0]
        let preview: MatrixRoom['preview']
        if (room.latest_event) {
            preview = {
                eventId: room.latest_event.event.event.event_id,
                senderId: room.latest_event.sender_profile.Original.content.id,
                displayName:
                    room.latest_event.sender_profile.Original.content
                        .displayname,
                avatarUrl:
                    room.latest_event.sender_profile.Original.content
                        .avatar_url,
                body: room.latest_event.event.event.content.body,
                timestamp: room.latest_event.event.event.origin_server_ts,
            }
        }

        return {
            directUserId,
            preview,
            id: room.room_id,
            name: room.base_info.name?.Original?.content?.name,
            notificationCount:
                room.notification_counts?.notification_count || 0,
            // TODO: Sometimes non-dm room with 1 user has an avatar of the user, figure out how to stop that
            // TODO: Make opaque mxc type, have each component do the conversion with width / height args
            avatarUrl: avatarUrl
                ? mxcUrlToHttpUrl(avatarUrl, 200, 200, 'crop')
                : undefined,
            // We need power levels to determine this, which is a separate call.
            // For now leave this undefined, and just apply it with a redux selector.
            // broadcastOnly: false,
        }
    }

    private serializeRoomMember(
        member: RpcRoomMember,
        roomId: string,
    ): MatrixRoomMember {
        return {
            roomId,
            id: member.userId,
            displayName: member.displayName || undefined,
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
            displayName: auth.displayName || undefined,
            avatarUrl: auth.avatarUrl
                ? mxcUrlToHttpUrl(auth.avatarUrl, 200, 200, 'crop')
                : undefined,
            deviceId: auth.deviceId,
        }
    }

    private serializeUserDirectorySearchResponse(
        res: RpcMatrixUserDirectorySearchResponse,
    ): MatrixSearchResults {
        return {
            results: res.results.map(user => ({
                id: user.userId,
                displayName: user.displayName || undefined,
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

        return {
            roomId,
            id: item.value.id,
            txnId: item.value.txnId,
            eventId: item.value.eventId,
            content: formatMatrixEventContent(
                item.value.content.kind === 'json'
                    ? item.value.content.value.content
                    : item.value.content.value,
            ),
            timestamp: item.value.timestamp,
            senderId: item.value.sender,
            status,
            error,
        }
    }
}
