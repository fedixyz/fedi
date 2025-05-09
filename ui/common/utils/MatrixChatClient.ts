import EventEmitter from 'events'

import {
    GLOBAL_MATRIX_PUSH_SERVER,
    INVALID_NAME_PLACEHOLDER,
} from '../constants/matrix'
import {
    bindings,
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
    MsEventData,
    MultispendListedEvent,
    NetworkError,
    ObservableVecUpdate,
    RpcBackPaginationStatus,
    RpcMatrixAccountSession,
    RpcMatrixUserDirectorySearchResponse,
    RpcMultispendGroupStatus,
    RpcRoomId,
    RpcRoomMember,
    RpcRoomNotificationMode,
    RpcSPv2SyncResponse,
    RpcSyncIndicator,
    RpcTimelineItem,
} from '../types/bindings'
import { DisplayNameValidatorType, getDisplayNameValidator } from './chat'
import { FedimintBridge, UnsubscribeFn } from './fedimint'
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
        roomId: MatrixRoom['id']
        updates: MatrixTimelineObservableUpdates
    }
    roomTimelinePaginationStatus: {
        roomId: MatrixRoom['id']
        paginationStatus: RpcBackPaginationStatus
    }
    roomPowerLevels: {
        roomId: MatrixRoom['id']
        powerLevels: MatrixRoomPowerLevels
    }
    roomNotificationMode: {
        roomId: MatrixRoom['id']
        mode: RpcRoomNotificationMode
    }
    ignoredUsers: MatrixUser['id'][]
    multispendUpdate: {
        roomId: MatrixRoom['id']
        status: RpcMultispendGroupStatus | null
    }
    multispendEventUpdate: {
        roomId: MatrixRoom['id']
        eventId: string
        update: MsEventData | null
    }
    multispendAccountUpdate: {
        roomId: MatrixRoom['id']
        info: { Ok: RpcSPv2SyncResponse } | { Err: NetworkError } | null
    }
    multispendTransactions: {
        roomId: MatrixRoom['id']
        transactions: MultispendListedEvent[]
    }
    user: MatrixUser
    error: MatrixError
    auth: MatrixAuth
}

export class MatrixChatClient {
    hasStarted = false

    private emitter = new EventEmitter()
    private fedimint!: FedimintBridge
    private startPromise: Promise<MatrixAuth> | undefined
    private roomInfoUnsubscribeMap: Record<
        MatrixRoom['id'],
        UnsubscribeFn | undefined
    > = {}
    private roomTimelineUnsubscribeMap: Record<
        MatrixRoom['id'],
        UnsubscribeFn | undefined
    > = {}
    private roomPaginationStatusUnsubscribeMap: Record<
        MatrixRoom['id'],
        UnsubscribeFn | undefined
    > = {}
    private multispendUnsubscribeMap: Record<
        MatrixRoom['id'],
        UnsubscribeFn | undefined
    > = {}
    private multispendEventUnsubscribeMap: Record<
        MatrixRoom['id'],
        Record<string, UnsubscribeFn | undefined>
    > = {}
    private multispendAccountUnsubscribeMap: Record<
        MatrixRoom['id'],
        UnsubscribeFn | undefined
    > = {}
    private roomListUnsubscribe: UnsubscribeFn | undefined = undefined
    private syncStatusUnsubscribe: UnsubscribeFn | undefined = undefined
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

                    this.listIgnoredUsers()
                    this.observeRoomList().catch(reject)
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
        this.observeRoomPaginationStatus(roomId).catch(err => {
            log.warn('Failed to observe room pagination status', {
                roomId,
                err,
            })
        })
        this.observeRoomTimeline(roomId).catch(err => {
            log.warn('Failed to observe room', { roomId, err })
        })
        this.observeRoomMembers(roomId).catch(err => {
            log.warn('Failed to observe room members', { roomId, err })
        })
        this.observeRoomPowerLevels(roomId).catch(err => {
            log.warn('Failed to observe room power levels', { roomId, err })
        })
        this.observeMultispendGroup(roomId).catch(err => {
            log.warn('Failed to observe multispend group', { roomId, err })
        })
    }

    // MUST be in the federation to use
    observeMultispendAccount(roomId: string) {
        this.observeMultispendAccountInfo(roomId).catch(err => {
            log.warn('Failed to observe multispend account info', {
                roomId,
                err,
            })
        })
    }

    unobserveMultispendAccount(roomId: string) {
        const multispendAccountUnsubscribe =
            this.multispendAccountUnsubscribeMap[roomId]
        if (multispendAccountUnsubscribe !== undefined) {
            multispendAccountUnsubscribe()
            delete this.multispendAccountUnsubscribeMap[roomId]
        }
    }

    unobserveRoom(roomId: string) {
        const roomUnsubscribe = this.roomTimelineUnsubscribeMap[roomId]
        if (roomUnsubscribe !== undefined) {
            roomUnsubscribe()
            delete this.roomTimelineUnsubscribeMap[roomId]
        }

        const paginationStatusUnsubscribe =
            this.roomPaginationStatusUnsubscribeMap[roomId]
        if (paginationStatusUnsubscribe !== undefined) {
            paginationStatusUnsubscribe()
            delete this.roomPaginationStatusUnsubscribeMap[roomId]
        }

        const multispendUnsubscribe = this.multispendUnsubscribeMap[roomId]
        if (multispendUnsubscribe !== undefined) {
            multispendUnsubscribe()
            delete this.multispendUnsubscribeMap[roomId]
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
     * TODO: Refactor this to avoid observing the room info and timeline
     * This is currently leaking observables, as the unsubscribes are lost.
     * Also, this leads to duplicate concurrent observables in the room.
     * which breaks everything
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
                limit: 20,
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

    private async observeRoomPaginationStatus(roomId: string) {
        // Only observe a room once, subsequent calls are no-ops.
        if (this.roomPaginationStatusUnsubscribeMap[roomId] !== undefined)
            return

        // Listen and emit on observable updates
        const unsubscribe =
            this.fedimint.subscribeObservableSimple<RpcBackPaginationStatus>(
                id => {
                    return this.fedimint.matrixRoomObserveTimelineItemsPaginateBackwards(
                        {
                            roomId,
                            observableId: id,
                        },
                    )
                },
                paginationStatus => {
                    this.emit('roomTimelinePaginationStatus', {
                        roomId,
                        paginationStatus,
                    })
                },
            )
        // store unsubscribe functions to cancel later if needed
        this.roomPaginationStatusUnsubscribeMap[roomId] = unsubscribe
    }

    async paginateTimeline(roomId: string, eventNum: number) {
        return this.fedimint.matrixRoomTimelineItemsPaginateBackwards({
            roomId,
            eventNum,
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
        const oldRoomListUnsubscribe = this.roomListUnsubscribe

        if (oldRoomListUnsubscribe !== undefined) {
            await oldRoomListUnsubscribe()
            this.roomListUnsubscribe = undefined
        }
        // Recreate observer with fresh room list
        await this.observeRoomList()
    }

    async unsubscribeSyncStatus() {
        await this.syncStatusUnsubscribe?.()
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

    async listIgnoredUsers() {
        const users = await this.fedimint.matrixListIgnoredUsers({})
        this.emit('ignoredUsers', users)
        return users
    }

    async fetchMultispendTransactions({
        roomId,
        startAfter = null,
        limit = 100,
    }: bindings.RpcPayload<'matrixMultispendListEvents'>) {
        try {
            const transactions = await this.fedimint.matrixMultispendListEvents(
                {
                    roomId,
                    startAfter,
                    limit,
                },
            )
            this.emit('multispendTransactions', { roomId, transactions })
            return transactions
        } catch (error) {
            log.warn('Failed to get transactions for roomId', roomId, error)
        }
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

    observeSyncStatus() {
        // Only observe the sync status once, subsequent calls are no-ops.
        if (this.syncStatusUnsubscribe !== undefined) return

        // Listen and emit on observable updates
        const unsubscribe =
            this.fedimint.subscribeObservableSimple<RpcSyncIndicator>(
                id => {
                    return this.fedimint.matrixObserveSyncIndicator({
                        observableId: id,
                    })
                },
                status => {
                    this.emit(
                        'status',
                        status === 'show'
                            ? MatrixSyncStatus.syncing
                            : MatrixSyncStatus.synced,
                    )
                },
            )
        // store unsubscribe functions to cancel later if needed
        this.syncStatusUnsubscribe = unsubscribe
    }

    /*** Private methods ***/

    private async observeRoomList() {
        // Only observe the roomList once, subsequent calls are no-ops.
        if (this.roomListUnsubscribe !== undefined) return
        // Listen and emit on observable updates
        const unsubscribe = this.fedimint.subscribeObservable<
            RpcRoomId[],
            ObservableVecUpdate<RpcRoomId>['update']
        >(
            id => {
                return this.fedimint.matrixRoomList({ observableId: id })
            },
            rooms => {
                // Emit a fake "update" using the initial values
                this.emit(
                    'roomListUpdate',
                    makeInitialResetUpdate(
                        rooms.map(this.serializeRoomListItem),
                    ),
                )

                // Observe all of the rooms
                rooms.map(async room => {
                    await this.observeRoomInfo(room)
                    await this.observeRoomPowerLevels(room)
                    await this.observeRoomNotificationMode(room)
                })
            },
            update => {
                this.emit(
                    'roomListUpdate',
                    mapObservableUpdates(update, this.serializeRoomListItem),
                )
                getNewObservableIds(update, room => {
                    return room
                }).forEach(roomId => {
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
            },
        )
        // store unsubscribe functions to cancel later if needed
        this.roomListUnsubscribe = unsubscribe
    }

    private async observeRoomInfo(roomId: string) {
        // Only observe a room once, subsequent calls are no-ops.
        if (this.roomInfoUnsubscribeMap[roomId] !== undefined) return

        // Listen and emit on observable updates
        const unsubscribe = this.fedimint.subscribeObservableSimple(
            id => {
                return this.fedimint.matrixRoomObserveInfo({
                    roomId,
                    observableId: id,
                })
            },
            (update, isInitialUpdate) => {
                // Emit the initial info
                const room = this.serializeRoomInfo(update)
                this.emit('roomInfo', room)

                // If it's the initial update of a DM:
                // - fetch the member since it's small and we use recent DM users.
                // - HACK: observe all DMs to claim ecash in the background.
                if (isInitialUpdate && room.directUserId) {
                    // TODO: remove this when members list is observable
                    this.observeRoomMembers(roomId).catch(err => {
                        log.warn(
                            'Failed to observe room members from initial room info',
                            { roomId, err },
                        )
                    })

                    // TODO: Move this to the bridge... intercept messages that contain
                    // ecash and claim before passing to the frontend.
                    this.observeRoomTimeline(roomId).catch(err => {
                        log.warn('Failed to observe room timeline', {
                            roomId,
                            err,
                        })
                    })
                }
            },
        )
        // store unsubscribe functions to cancel later if needed
        this.roomInfoUnsubscribeMap[roomId] = unsubscribe
    }

    private async observeMultispendGroup(roomId: string) {
        if (this.multispendUnsubscribeMap[roomId] !== undefined) return

        const unsubscribe =
            this.fedimint.subscribeObservableSimple<RpcMultispendGroupStatus | null>(
                observableId =>
                    this.fedimint.matrixObserveMultispendGroup({
                        observableId,
                        roomId,
                    }),
                update => {
                    this.emit('multispendUpdate', {
                        roomId,
                        status: update,
                    })
                },
            )

        this.multispendUnsubscribeMap[roomId] = unsubscribe
    }

    public async observeMultispendEvent(roomId: string, eventId: string) {
        if (this.multispendEventUnsubscribeMap[roomId]?.[eventId] !== undefined)
            return

        const unsubscribe =
            this.fedimint.subscribeObservableSimple<MsEventData | null>(
                observableId =>
                    this.fedimint.matrixObserveMultispendEventData({
                        observableId,
                        roomId,
                        eventId,
                    }),
                update => {
                    this.emit('multispendEventUpdate', {
                        roomId,
                        eventId,
                        update,
                    })
                },
            )

        this.multispendEventUnsubscribeMap[roomId] = {
            ...(this.multispendUnsubscribeMap[roomId] || {}),
            [eventId]: unsubscribe,
        }
    }

    public async unobserveMultispendEvent(roomId: string, eventId: string) {
        const multispendEventUnsubscribe =
            this.multispendEventUnsubscribeMap[roomId]?.[eventId]

        if (multispendEventUnsubscribe !== undefined) {
            multispendEventUnsubscribe()

            this.multispendEventUnsubscribeMap[roomId] = {
                ...(this.multispendEventUnsubscribeMap[roomId] || {}),
                [eventId]: undefined,
            }
        }
    }

    private async observeMultispendAccountInfo(roomId: string) {
        if (this.multispendAccountUnsubscribeMap[roomId] !== undefined) return

        const unsubscribe = this.fedimint.subscribeObservableSimple<
            { Ok: RpcSPv2SyncResponse } | { Err: NetworkError } | null
        >(
            observableId =>
                this.fedimint.matrixMultispendAccountInfo({
                    roomId,
                    observableId,
                }),
            update => {
                this.emit('multispendAccountUpdate', {
                    roomId,
                    info: update,
                })
            },
        )

        this.multispendAccountUnsubscribeMap[roomId] = unsubscribe
    }

    private async observeRoomTimeline(roomId: string) {
        // Only observe a room once, subsequent calls are no-ops.
        if (this.roomTimelineUnsubscribeMap[roomId] !== undefined) return

        // Listen and emit on observable updates
        const unsubscribe = this.fedimint.subscribeObservable<
            RpcTimelineItem[],
            ObservableVecUpdate<RpcTimelineItem>['update']
        >(
            id => {
                return this.fedimint.matrixRoomTimelineItems({
                    roomId,
                    observableId: id,
                })
            },
            initial => {
                // // Emit a fake "update" using the initial values
                this.emit('roomTimelineUpdate', {
                    roomId,
                    updates: makeInitialResetUpdate(
                        initial.map(ev =>
                            this.serializeTimelineItem(ev, roomId),
                        ),
                    ),
                })
            },
            update => {
                this.emit('roomTimelineUpdate', {
                    roomId,
                    updates: mapObservableUpdates(update, ev =>
                        this.serializeTimelineItem(ev, roomId),
                    ),
                })
            },
        )
        // store unsubscribe functions to cancel later if needed
        this.roomTimelineUnsubscribeMap[roomId] = unsubscribe
    }

    // Fake observe - just fetches
    private async observeRoomMembers(roomId: string) {
        // TODO: Listen for new room member events, re-fetch.
        // // Only observe room members once, subsequent calls are no-ops.
        // if (this.roomMembersUnsubscribeMap[roomId] !== undefined) return

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

    private serializeRoomListItem(room: RpcRoomId): MatrixRoomListItem {
        return { status: MatrixRoomListItemStatus.ready, id: room }
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
            if ('kind' in event && 'Decrypted' in event.kind) {
                const { event: decryptedEvent } = event.kind.Decrypted
                let timestamp = decryptedEvent.origin_server_ts
                let isDeleted = false
                // Deleted/redacted messages have the redaction timestamp in the unsigned field
                if (
                    'unsigned' in decryptedEvent &&
                    'redacted_because' in decryptedEvent.unsigned &&
                    !!decryptedEvent.unsigned?.redacted_because
                ) {
                    isDeleted = true
                    timestamp =
                        decryptedEvent.unsigned.redacted_because
                            .origin_server_ts
                }
                preview = {
                    eventId: decryptedEvent.event_id,
                    senderId: sender_profile.Original.content.id,
                    displayName: this.ensureDisplayName(
                        sender_profile.Original.content.displayname,
                    ),
                    avatarUrl: sender_profile.Original.content.avatar_url,
                    body: decryptedEvent.content.body,
                    isDeleted,
                    timestamp,
                }
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
            ignored: member.ignored,
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
            item.value.content.value.type !== 'm.room.message' &&
            // deleted messages are not decrypted so they have this type
            // we keep them so we can display the 'message deleted' placeholder
            item.value.content.value.type !== 'm.room.encrypted'
        )
            return null

        // Map the status to an enum, include the error if it failed
        let status: MatrixEventStatus
        let error: string | null = null
        // Send but not acknowledged by the server
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
                error =
                    typeof item.value.sendState?.error === 'string'
                        ? item.value.sendState?.error
                        : 'Unknown error'
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
        } else if (eventContent.value.type === 'm.room.encrypted') {
            content = {
                msgtype: 'm.room.encrypted',
                body: '',
                ...eventContent.value.content,
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
