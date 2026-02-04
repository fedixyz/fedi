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
    MatrixEvent,
    MatrixRoom,
    MatrixRoomListItem,
    MatrixRoomListItemStatus,
    MatrixRoomListStreamUpdates,
    MatrixRoomMember,
    MatrixRoomPowerLevels,
    MatrixSearchResults,
    MatrixSendableContent,
    MatrixSyncStatus,
    MatrixTimelineStreamUpdates,
    MatrixUser,
    RpcMatrixEventKind,
} from '../types'
import {
    JSONObject,
    MsEventData,
    MultispendListedEvent,
    NetworkError,
    RpcBackPaginationStatus,
    RpcMatrixAccountSession,
    RpcMatrixUserDirectorySearchResponse,
    RpcMultispendGroupStatus,
    RpcPublicRoomInfo,
    RpcRoomId,
    RpcRoomMember,
    RpcRoomNotificationMode,
    RpcSerializedRoomInfo,
    RpcSPv2SyncResponse,
    RpcTimelineItem,
} from '../types/bindings'
import {
    DisplayNameValidatorType,
    SetDisplayNameValidatorType,
    generateRandomDisplayName,
    getDisplayNameValidator,
    setDisplayNameValidator,
} from './chat'
import { FedimintBridge, UnsubscribeFn } from './fedimint'
import { makeLog } from './log'
import {
    encodeFediMatrixRoomUri,
    isRpcMatrixEvent,
    mxcUrlToHttpUrl,
} from './matrix'
import { mapStreamUpdate, getNewStreamIds } from './stream'

const log = makeLog('MatrixChatClient')

export enum UserPowerLevel {
    User = 0,
    Moderator = 50,
    Admin = 100,
}

interface MatrixChatClientEventMap {
    status: MatrixSyncStatus
    roomListUpdate: MatrixRoomListStreamUpdates
    roomInfo: MatrixRoom
    roomMember: MatrixRoomMember
    roomMembers: {
        roomId: MatrixRoom['id']
        members: MatrixRoomMember[]
    }
    roomTimelineUpdate: {
        roomId: MatrixRoom['id']
        updates: MatrixTimelineStreamUpdates
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
    private getDisplayNameValidator: DisplayNameValidatorType | undefined
    private setDisplayNameValidator: SetDisplayNameValidatorType | undefined

    /*** Public methods ***/

    async start(fedimint: FedimintBridge) {
        if (this.startPromise) {
            return this.startPromise
        }
        this.hasStarted = true
        this.fedimint = fedimint
        if (!this.getDisplayNameValidator) {
            this.getDisplayNameValidator = getDisplayNameValidator()
        }
        if (!this.setDisplayNameValidator) {
            this.setDisplayNameValidator = setDisplayNameValidator()
        }

        this.startPromise = new Promise((resolve, reject) => {
            const unsubscribe = this.fedimint.matrixInitializeStatus({
                callback: status => {
                    if (status.type === 'success') {
                        log.debug(
                            'got success from matrixInitializeStatus, unsubscribing...',
                        )
                        unsubscribe()
                        this.getInitialAuth()
                            .then(auth => {
                                log.debug(
                                    'resolving auth from getInitialAuth...',
                                    auth,
                                )
                                // resolve cached auth before fetching anything
                                // to support offline UX
                                resolve(auth)
                                this.emit('auth', auth)

                                // try to refetch auth in the background to
                                // asynchronously get the user's avatarUrl
                                this.refetchAuth()

                                // get initial list of ignored users
                                this.listIgnoredUsers()
                                // these should always be observing
                                this.observeSyncStatus()
                                this.observeRoomList().catch(reject)
                            })
                            .catch(err => {
                                log.error(
                                    'matrix initialized but failed to start MatrixChatClient',
                                    err,
                                )
                                reject(err)
                            })
                    } else if (status.type === 'error') {
                        // for now we handle this as a critical error, since it blocks app initialization
                        // TODO: allow user interaction even if we don't have a success status yet
                        unsubscribe()
                        log.error(
                            'matrixInitializeStatus returned an error',
                            status.error,
                        )
                        reject(status.error)
                    }
                },
            })
        })

        return this.startPromise
    }

    async getInitialAuth() {
        // Don't emit cached auth to make sure the startPromise
        // resolves before matrixAuth is set
        const session = await this.getAccountSession()
        log.debug('getInitialAuth', session)
        // if the display name is set to the npub in the user ID,
        // we haven't set a display name yet, so generate a random one
        const npub = session.userId.slice(1).split(/[:]/).at(0)
        if (session.displayName && session.displayName === npub) {
            const name = generateRandomDisplayName()
            log.debug('setting random display name:', name)
            await this.setDisplayName(name)
        } else {
            log.debug('no need to set random display name')
        }
        return this.serializeAuth(session)
    }

    async refetchAuth() {
        const session = await this.getAccountSession(false)
        log.debug('refetchAuth session', session)
        const auth = this.serializeAuth(session)
        log.debug('refetchAuth emitting auth', auth)
        this.emit('auth', auth)
        return auth
    }

    private async getAccountSession(cached = true) {
        return this.fedimint.matrixGetAccountSession({ cached })
    }

    // arrow function notation is important here! otherwise this.fedimint is
    // can be undefined for some reason, idk why exactly...
    // TODO: consider whether other functions are also at risk of this.fedimint being undefined?
    getRoomPreview = async (roomId: string) => {
        let previewInfo: MatrixRoom
        let previewTimeline: MatrixEvent[]
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
            previewTimeline = previewContent
                .map(item => this.serializeTimelineItem(item, roomId, true))
                .filter(item => item !== null)
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

    async sendMessage(roomId: string, content: MatrixSendableContent) {
        const { msgtype, body, ...data } = content
        await this.fedimint.matrixSendMessage({
            roomId,
            data: {
                msgtype,
                body,
                // TODO: fix parsing on the rust side to avoid this nested garbage
                // TODO: verify the expected type of data
                data: data as JSONObject,
                // TODO: add mentions
                mentions: null,
            },
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
    async sendDirectMessage(userId: string, content: MatrixSendableContent) {
        const roomId = await this.fedimint.matrixRoomCreateOrGetDm({ userId })
        await this.sendMessage(roomId, content)
        await this.observeRoomInfo(roomId)
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
            displayName:
                this.ensureDisplayName(displayName, 'set') ?? displayName,
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
            this.fedimint.matrixRoomSubscribeTimelineItemsPaginateBackwardsStatus(
                {
                    roomId,
                    callback: paginationStatus => {
                        this.emit('roomTimelinePaginationStatus', {
                            roomId,
                            paginationStatus,
                        })
                    },
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
        const unsubscribe = this.fedimint.matrixSubscribeSyncIndicator({
            callback: status => {
                this.emit(
                    'status',
                    status === 'show'
                        ? MatrixSyncStatus.syncing
                        : MatrixSyncStatus.synced,
                )
            },
        })
        // store unsubscribe functions to cancel later if needed
        this.syncStatusUnsubscribe = unsubscribe
    }

    /*** Private methods ***/

    private async observeRoomList() {
        // Only observe the roomList once, subsequent calls are no-ops.
        if (this.roomListUnsubscribe !== undefined) return

        // Listen and emit on stream updates
        const unsubscribe = this.fedimint.matrixSubscribeRoomList({
            callback: data => {
                // Get newly added room IDs before updating the list
                const newRoomIds = getNewStreamIds(data, room => room)

                // Emit the actual updates
                this.emit(
                    'roomListUpdate',
                    data.map(update =>
                        mapStreamUpdate(update, this.serializeRoomListItem),
                    ),
                )

                // observe new added rooms
                newRoomIds.forEach(roomId => {
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
        })
        // store unsubscribe functions to cancel later if needed
        this.roomListUnsubscribe = unsubscribe
    }
    private async observeRoomInfo(roomId: string) {
        // Only observe a room once, subsequent calls are no-ops.
        if (this.roomInfoUnsubscribeMap[roomId] !== undefined) return

        // Listen and emit on stream updates
        const unsubscribe = this.fedimint.matrixRoomSubscribeInfo({
            roomId,
            callback: room => {
                try {
                    // Emit the room info
                    const serializedRoom = this.serializeRoomInfo(room)
                    this.emit('roomInfo', serializedRoom)

                    // If it's a DM:
                    // - fetch the member since it's small and we use recent DM users.
                    // - HACK: observe all DMs to claim ecash in the background.
                    if (serializedRoom.directUserId) {
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
                } catch (error: unknown) {
                    const err =
                        error instanceof Error
                            ? error
                            : new Error(String(error))

                    log.error('Error handling room update', {
                        roomId,
                        room,
                        errorMessage: err.message,
                        errorStack: err.stack,
                    })
                }
            },
        })

        // store unsubscribe functions to cancel later if needed
        this.roomInfoUnsubscribeMap[roomId] = unsubscribe
    }

    private async observeMultispendGroup(roomId: string) {
        if (this.multispendUnsubscribeMap[roomId] !== undefined) return

        const unsubscribe = this.fedimint.matrixSubscribeMultispendGroup({
            roomId,
            callback: update => {
                this.emit('multispendUpdate', {
                    roomId,
                    status: update,
                })
            },
        })

        this.multispendUnsubscribeMap[roomId] = unsubscribe
    }

    public async observeMultispendEvent(roomId: string, eventId: string) {
        if (this.multispendEventUnsubscribeMap[roomId]?.[eventId] !== undefined)
            return

        const unsubscribe = this.fedimint.matrixSubscribeMultispendEventData({
            roomId,
            eventId,
            callback: update => {
                this.emit('multispendEventUpdate', {
                    roomId,
                    eventId,
                    update,
                })
            },
        })

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

        const unsubscribe = this.fedimint.matrixSubscribeMultispendAccountInfo({
            roomId,
            callback: info => {
                this.emit('multispendAccountUpdate', {
                    roomId,
                    info,
                })
            },
        })

        this.multispendAccountUnsubscribeMap[roomId] = unsubscribe
    }

    private async observeRoomTimeline(roomId: string) {
        // Only observe a room once, subsequent calls are no-ops.
        if (this.roomTimelineUnsubscribeMap[roomId] !== undefined) return

        // Listen and emit on stream updates
        const unsubscribe = this.fedimint.matrixSubscribeRoomTimelineItems({
            roomId,
            callback: data => {
                this.emit('roomTimelineUpdate', {
                    roomId,
                    updates: data.map(update =>
                        mapStreamUpdate(update, ev =>
                            this.serializeTimelineItem(ev, roomId),
                        ),
                    ),
                })
            },
        })

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
    private serializePublicRoomInfo(room: RpcPublicRoomInfo): MatrixRoom {
        return {
            ...room,
            name: room.name ?? '',
            isPublic: true,
            // Private rooms don't have previews so these are always true
            isPreview: true,
            inviteCode: encodeFediMatrixRoomUri(room.id),
            directUserId: null,
            // We need to preview timeline items to determine this, which is a separate call.
            // For now leave this as zero, and just apply it with a redux selector.
            // Maybe should delete this from the room type?
            notificationCount: 0,
            isMarkedUnread: false,
            // TODO: HACK - move this to bridge
            roomState: 'invited',
            preview: null,
            isDirect: false,
        }
    }

    private serializeRoomInfo(room: RpcSerializedRoomInfo): MatrixRoom {
        const adjustedAvatarUrl = room.avatarUrl
            ? mxcUrlToHttpUrl(room.avatarUrl, 200, 200, 'crop')
            : undefined

        const preview = room.preview
            ? this.serializeTimelineItem(
                  { value: room.preview, kind: 'event' },
                  room.id,
              )
            : null

        return {
            ...room,
            preview,
            // TODO: Move this to bridge?
            name: room.directUserId
                ? this.ensureDisplayName(room.name)
                : room.name,
            // this ensures we show a different ChatRoomInvite screen for public rooms
            inviteCode: encodeFediMatrixRoomUri(room.id),
            // Avoid showing a user's avatar for non-DM rooms that currently
            // only have one joined member (often just the creator).
            // In that case, suppress any provided avatar and let the UI fall back.
            avatarUrl:
                !room.directUserId && room.joinedMemberCount <= 1
                    ? null
                    : (adjustedAvatarUrl ?? null),
            // TODO: Make opaque mxc type, have each component do the conversion with width / height args
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

    // filters out virtual items (date dividers, etc.)
    private serializeTimelineItem(
        item: RpcTimelineItem,
        roomId: string,
        _isPreview = false,
    ): MatrixEvent<RpcMatrixEventKind> | null {
        // Return null for items we don't want. Because observable updates work
        // on indexes, even if we don't want certain events we need to keep them
        // in the event list so that the updates apply properly. If we filtered
        // them out, the indexes would point to the wrong places.
        if (item.kind !== 'event') return null
        const event = item.value
        if (event.content.msgtype === 'unknown') return null

        if (!event.content) return null
        const ev = { ...event, roomId }
        if (!isRpcMatrixEvent(ev)) return null

        return ev
    }

    // Ref: https://github.com/fedibtc/fedi/issues/1184#issuecomment-2137529842
    private ensureDisplayName = (
        name: string | null,
        mode: 'get' | 'set' = 'get',
    ) => {
        if (!name) return ''
        const validator =
            mode === 'get'
                ? this.getDisplayNameValidator
                : this.setDisplayNameValidator
        if (!validator) return name
        const res = validator.safeParse(name)
        if (res.success) return name
        // TODO: figure out efficient way to localize this.
        // What's a place this can live such that locales are accessible?
        // Ideally, we only want to validate a displayName once, so
        // this shouldn't live inside of the ui components.
        return INVALID_NAME_PLACEHOLDER
    }
}
