import {
    createSlice,
    PayloadAction,
    createAsyncThunk,
    createSelector,
} from '@reduxjs/toolkit'
import { v4 as uuidv4 } from 'uuid'

import { CommonState } from '.'
import {
    GLOBAL_MATRIX_SERVER,
    GLOBAL_MATRIX_SLIDING_SYNC_PROXY,
} from '../constants/matrix'
import {
    MatrixUser,
    MatrixRoom,
    MatrixAuth,
    MatrixRoomMember,
    MatrixError,
    MatrixPowerLevel,
    MatrixSearchResults,
    MatrixPaymentEvent,
    MSats,
    MatrixPaymentStatus,
    MatrixPaymentEventContent,
    MatrixRoomListObservableUpdates,
    MatrixTimelineObservableUpdates,
    MatrixRoomListItem,
    MatrixTimelineItem,
    MatrixEvent,
    MatrixRoomPowerLevels,
    MatrixSyncStatus,
    MatrixCreateRoomOptions,
} from '../types'
import amountUtils from '../utils/AmountUtils'
import { MatrixChatClient } from '../utils/MatrixChatClient'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import {
    isPaymentEvent,
    matrixIdToUsername,
    mxcUrlToHttpUrl,
} from '../utils/matrix'
import { getRoomEventPowerLevel } from '../utils/matrix'
import { applyObservableUpdates } from '../utils/observable'
import { upsertListItem, upsertRecordEntity } from '../utils/redux'
import { loadFromStorage } from './storage'

const log = makeLog('redux/matrix')

let matrixClient: MatrixChatClient | null = null
const getMatrixClient = () => {
    if (!matrixClient) {
        matrixClient = new MatrixChatClient()
    }
    return matrixClient
}

/*** Initial State ***/

const initialState = {
    auth: null as null | MatrixAuth,
    status: MatrixSyncStatus.stopped,
    roomList: [] as MatrixRoomListItem[],
    roomInfo: {} as Record<MatrixRoom['id'], MatrixRoom | undefined>,
    roomMembers: {} as Record<MatrixRoom['id'], MatrixRoomMember[] | undefined>,
    roomTimelines: {} as Record<
        MatrixRoom['id'],
        MatrixTimelineItem[] | undefined
    >,
    roomPowerLevels: {} as Record<
        MatrixRoom['id'],
        MatrixRoomPowerLevels | undefined
    >,
    users: {} as Record<MatrixUser['id'], MatrixUser | undefined>,
    errors: [] as MatrixError[],
}

export type MatrixState = typeof initialState

/*** Slice definition ***/

export const matrixSlice = createSlice({
    name: 'matrix',
    initialState,
    reducers: {
        setMatrixStatus(state, action: PayloadAction<MatrixState['status']>) {
            state.status = action.payload
        },
        setMatrixAuth(state, action: PayloadAction<MatrixState['auth']>) {
            state.auth = action.payload
        },
        addMatrixRoomInfo(state, action: PayloadAction<MatrixRoom>) {
            state.roomInfo = upsertRecordEntity(state.roomInfo, action.payload)
        },
        handleMatrixRoomListObservableUpdates(
            state,
            action: PayloadAction<MatrixRoomListObservableUpdates>,
        ) {
            state.roomList = applyObservableUpdates(
                state.roomList,
                action.payload,
            )
        },
        addMatrixRoomMember(state, action: PayloadAction<MatrixRoomMember>) {
            const { roomId } = action.payload
            const oldRoomMembers = state.roomMembers[roomId]
            const newRoomMembers = upsertListItem(
                oldRoomMembers,
                action.payload,
            )
            if (newRoomMembers !== oldRoomMembers) {
                state.roomMembers[roomId] = newRoomMembers
            }
        },
        setMatrixRoomMembers(
            state,
            action: PayloadAction<{
                roomId: MatrixRoom['id']
                members: MatrixRoomMember[]
            }>,
        ) {
            state.roomMembers[action.payload.roomId] = action.payload.members
        },
        addMatrixUser(state, action: PayloadAction<MatrixUser>) {
            state.users = upsertRecordEntity(state.users, action.payload)
        },
        setMatrixUsers(state, action: PayloadAction<MatrixUser[]>) {
            state.users = action.payload.reduce(
                (acc, user) => ({ ...acc, [user.id]: user }),
                {},
            )
        },
        handleMatrixRoomTimelineObservableUpdates(
            state,
            action: PayloadAction<{
                roomId: string
                updates: MatrixTimelineObservableUpdates
            }>,
        ) {
            const { roomId, updates } = action.payload
            state.roomTimelines[roomId] = applyObservableUpdates(
                state.roomTimelines[roomId] || [],
                updates,
            )
        },
        setMatrixRoomPowerLevels(
            state,
            action: PayloadAction<{
                roomId: MatrixRoom['id']
                powerLevels: MatrixRoomPowerLevels
            }>,
        ) {
            const { roomId, powerLevels } = action.payload
            state.roomPowerLevels[roomId] = powerLevels
        },
        addMatrixError(state, action: PayloadAction<MatrixError>) {
            state.errors = [...state.errors, action.payload]
        },
        resetMatrixState() {
            return { ...initialState }
        },
    },
    extraReducers: builder => {
        builder.addCase(startMatrixClient.pending, state => {
            state.status = MatrixSyncStatus.initialSync
        })
        builder.addCase(startMatrixClient.fulfilled, (state, action) => {
            state.auth = action.payload
        })
        builder.addCase(startMatrixClient.rejected, state => {
            state.status = MatrixSyncStatus.stopped
        })

        builder.addCase(setMatrixDisplayName.fulfilled, (state, action) => {
            if (!state.auth) return
            state.auth = {
                ...state.auth,
                displayName: action.meta.arg.displayName,
            }
        })

        builder.addCase(
            uploadAndSetMatrixAvatarUrl.fulfilled,
            (state, action) => {
                if (!state.auth) return
                state.auth = {
                    ...state.auth,
                    // TODO: Make opaque mxc type, have each component do the conversion with width / height args
                    avatarUrl: mxcUrlToHttpUrl(
                        action.payload,
                        200,
                        200,
                        'crop',
                    ),
                }
            },
        )

        builder.addCase(
            setMatrixRoomBroadcastOnly.fulfilled,
            (state, action) => {
                state.roomPowerLevels[action.meta.arg.roomId] = action.payload
            },
        )

        builder.addCase(
            setMatrixRoomMemberPowerLevel.fulfilled,
            (state, action) => {
                // Update room power levels
                const { roomId, powerLevel } = action.meta.arg
                state.roomPowerLevels[roomId] = action.payload
                // Update member power level
                const member = state.roomMembers[roomId]?.find(
                    m => m.id === action.meta.arg.userId,
                )
                if (member) {
                    state.roomMembers[roomId] = upsertListItem(
                        state.roomMembers[roomId],
                        { ...member, powerLevel },
                    )
                }
            },
        )

        builder.addCase(searchMatrixUsers.fulfilled, (state, action) => {
            for (const user of action.payload.results) {
                // TODO: more efficient way than running this for each result?
                state.users = upsertRecordEntity(state.users, user)
            }
        })

        builder.addCase(loadFromStorage.fulfilled, (_state, action) => {
            if (!action.payload) return
            // state.auth = action.payload.matrixAuth
        })
    },
})

/*** Basic actions ***/

export const {
    setMatrixStatus,
    setMatrixAuth,
    addMatrixRoomInfo,
    addMatrixRoomMember,
    setMatrixRoomMembers,
    addMatrixUser,
    setMatrixUsers,
    setMatrixRoomPowerLevels,
    addMatrixError,
    handleMatrixRoomListObservableUpdates,
    handleMatrixRoomTimelineObservableUpdates,
    resetMatrixState,
} = matrixSlice.actions

/*** Async thunk actions ***/

export const startMatrixClient = createAsyncThunk<
    MatrixAuth,
    { fedimint: FedimintBridge },
    { state: CommonState }
>('matrix/startMatrix', async ({ fedimint }, { getState, dispatch }) => {
    // Create or grab existing client, bail out if we've already started.
    // TODO: when short circuiting on hasStarted, we should try to return
    // the same promise as the existing start call. Otherwise we may show
    // success on a second call, but failure on the first one.
    const client = getMatrixClient()
    if (client.hasStarted) {
        log.warn('Matrix client already started')
        throw new Error('Matrix client already started')
    }

    // Bind all the listeners we need to dispatch actions
    client.on('roomListUpdate', updates =>
        dispatch(handleMatrixRoomListObservableUpdates(updates)),
    )
    client.on('roomInfo', room => dispatch(addMatrixRoomInfo(room)))
    client.on('roomMember', member => dispatch(addMatrixRoomMember(member)))
    client.on('roomMembers', ev => dispatch(setMatrixRoomMembers(ev)))
    client.on('roomTimelineUpdate', ev =>
        dispatch(handleMatrixRoomTimelineObservableUpdates(ev)),
    )
    client.on('roomPowerLevels', ev => dispatch(setMatrixRoomPowerLevels(ev)))
    client.on('error', err => dispatch(addMatrixError(err)))

    client.on('status', status => {
        if (status === getState().matrix.status) return
        dispatch(setMatrixStatus(status))
    })

    // Start the client
    return client.start({
        fedimint,
        homeServer: GLOBAL_MATRIX_SERVER,
        slidingSyncProxy: GLOBAL_MATRIX_SLIDING_SYNC_PROXY,
    })
})

export const setMatrixDisplayName = createAsyncThunk<
    void,
    { displayName: string }
>('matrix/setMatrixDisplayName', async ({ displayName }) => {
    const client = getMatrixClient()
    return client.setDisplayName(displayName)
})

export const uploadAndSetMatrixAvatarUrl = createAsyncThunk<
    string,
    { fedimint: FedimintBridge; path: string; mimeType: string }
>('matrix/setMatrixAvatarUrl', async ({ fedimint, path, mimeType }) => {
    const { contentUri } = await fedimint.matrixUploadMedia({ path, mimeType })

    const client = getMatrixClient()
    await client.setAvatarUrl(contentUri)
    return contentUri
})

export const joinMatrixRoom = createAsyncThunk<
    void,
    { roomId: MatrixRoom['id'] }
>('matrix/joinMatrixRoom', async ({ roomId }) => {
    const client = getMatrixClient()
    return client.joinRoom(roomId)
})

export const createMatrixRoom = createAsyncThunk<
    { roomId: MatrixRoom['id'] },
    { name: MatrixRoom['name']; broadcastOnly?: boolean }
>('matrix/createMatrixRoom', async ({ name, broadcastOnly }) => {
    const client = getMatrixClient()
    const roomArgs: MatrixCreateRoomOptions = { name }
    if (broadcastOnly) {
        roomArgs.power_level_content_override = {
            events_default: MatrixPowerLevel.Moderator,
        }
    }
    return client.createRoom(roomArgs)
})

export const leaveMatrixRoom = createAsyncThunk<
    void,
    { roomId: MatrixRoom['id'] }
>('matrix/leaveMatrixRoom', async ({ roomId }) => {
    const client = getMatrixClient()
    return client.leaveRoom(roomId)
})

export const observeMatrixRoom = createAsyncThunk<
    void,
    { roomId: MatrixRoom['id'] }
>('matrix/observeMatrixRoom', async ({ roomId }) => {
    const client = getMatrixClient()
    return client.observeRoom(roomId)
})

export const unobserveMatrixRoom = createAsyncThunk<
    void,
    { roomId: MatrixRoom['id'] }
>('matrix/unobserveMatrixRoom', async ({ roomId }) => {
    const client = getMatrixClient()
    return client.unobserveRoom(roomId)
})

export const inviteUserToMatrixRoom = createAsyncThunk<
    void,
    { roomId: MatrixRoom['id']; userId: MatrixUser['id'] }
>('matrix/inviteUserToMatrixRoom', async ({ roomId, userId }) => {
    const client = getMatrixClient()
    return client.inviteUserToRoom(roomId, userId)
})

export const setMatrixRoomName = createAsyncThunk<
    void,
    { roomId: MatrixRoom['id']; name: MatrixRoom['name'] }
>('matrix/setMatrixRoomName', async ({ roomId, name }) => {
    const client = getMatrixClient()
    return client.setRoomName(roomId, name)
})

export const setMatrixRoomBroadcastOnly = createAsyncThunk<
    MatrixRoomPowerLevels,
    { roomId: MatrixRoom['id']; broadcastOnly: boolean }
>('matrix/setMatrixRoomBroadcastOnly', async ({ roomId, broadcastOnly }) => {
    const client = getMatrixClient()
    return client.setRoomPowerLevels(roomId, {
        events_default: broadcastOnly
            ? MatrixPowerLevel.Moderator
            : MatrixPowerLevel.Member,
    })
})

export const setMatrixRoomMemberPowerLevel = createAsyncThunk<
    MatrixRoomPowerLevels,
    {
        roomId: MatrixRoom['id']
        userId: MatrixUser['id']
        powerLevel: MatrixPowerLevel
    }
>(
    'matrix/setMatrixRoomMemberPowerLevel',
    async ({ roomId, userId, powerLevel }) => {
        const client = getMatrixClient()
        return client.setRoomMemberPowerLevel(roomId, userId, powerLevel)
    },
)

export const sendMatrixMessage = createAsyncThunk<
    void,
    { roomId: MatrixRoom['id']; body: string }
>('matrix/sendMatrixDirectMessage', async ({ roomId, body }) => {
    const client = getMatrixClient()
    await client.sendMessage(roomId, {
        msgtype: 'm.text',
        body,
    })
})

export const sendMatrixDirectMessage = createAsyncThunk<
    { roomId: string },
    { userId: MatrixUser['id']; body: string }
>('matrix/sendMatrixDirectMessage', async ({ userId, body }) => {
    const client = getMatrixClient()
    return await client.sendDirectMessage(userId, {
        msgtype: 'm.text',
        body: body,
    })
})

export const sendMatrixPaymentPush = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        federationId: string
        roomId: MatrixRoom['id']
        recipientId: MatrixUser['id']
        amount: MSats
    },
    { state: CommonState }
>(
    'matrix/sendMatrixPaymentPush',
    async (
        { fedimint, federationId, roomId, recipientId, amount },
        { getState },
    ) => {
        const matrixAuth = selectMatrixAuth(getState())
        if (!matrixAuth) throw new Error('Not authenticated')

        const client = getMatrixClient()
        const { ecash } = await fedimint.generateEcash(amount, federationId)

        await client.sendMessage(roomId, {
            msgtype: 'xyz.fedi.payment',
            body: `Sent payment of ${amountUtils.formatSats(
                amountUtils.msatToSat(amount),
            )} SATS. Use the Fedi app to accept this payment.`, // TODO: i18n? this only shows to matrix clients, not Fedi users
            status: MatrixPaymentStatus.pushed,
            paymentId: uuidv4(),
            senderId: matrixAuth.userId,
            amount,
            recipientId,
            federationId,
            ecash,
        })
    },
)

export const sendMatrixPaymentRequest = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        federationId: string
        roomId: MatrixRoom['id']
        amount: MSats
    },
    { state: CommonState }
>(
    'matrix/sendMatrixDirectPaymentRequestMessage',
    async ({ federationId, roomId, amount }, { getState }) => {
        const matrixAuth = selectMatrixAuth(getState())
        if (!matrixAuth) throw new Error('Not authenticated')

        const client = getMatrixClient()

        await client.sendMessage(roomId, {
            msgtype: 'xyz.fedi.payment',
            body: `Requested payment of ${amountUtils.formatSats(
                amountUtils.msatToSat(amount),
            )} SATS. Use the Fedi app to complete this request.`, // TODO: i18n?
            paymentId: uuidv4(),
            status: MatrixPaymentStatus.requested,
            recipientId: matrixAuth.userId,
            amount,
            federationId,
        })
    },
)

export const claimMatrixPayment = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; event: MatrixPaymentEvent }
>('matrix/claimMatrixPayment', async ({ fedimint, event }) => {
    const client = getMatrixClient()

    const { ecash, federationId } = event.content
    if (!ecash) throw new Error('Payment message is missing ecash token')

    await fedimint.receiveEcash(ecash, federationId)
    await client.sendMessage(event.roomId, {
        ...event.content,
        body: 'Payment received.', // TODO: i18n?
        status: MatrixPaymentStatus.received,
    })
})

export const cancelMatrixPayment = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; event: MatrixPaymentEvent }
>('matrix/cancelMatrixPayment', async ({ fedimint, event }) => {
    const client = getMatrixClient()

    if (event.content.ecash) {
        await fedimint.cancelEcash(
            event.content.ecash,
            event.content.federationId,
        )
    }

    await client.sendMessage(event.roomId, {
        ...event.content,
        body: 'Payment canceled.', // TODO: i18n?
        status: MatrixPaymentStatus.canceled,
    })
})

export const acceptMatrixPaymentRequest = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; event: MatrixPaymentEvent },
    { state: CommonState }
>(
    'matrix/acceptMatrixPaymentRequest',
    async ({ fedimint, event }, { getState }) => {
        const matrixAuth = selectMatrixAuth(getState())
        if (!matrixAuth) throw new Error('Not authenticated')

        const client = getMatrixClient()
        const { federationId, amount } = event.content
        const { ecash } = await fedimint.generateEcash(
            amount as MSats,
            federationId,
        )
        client.sendMessage(event.roomId, {
            ...event.content,
            body: `Sent payment of ${amountUtils.formatSats(
                amountUtils.msatToSat(amount as MSats),
            )} SATS. Use the Fedi app to accept this payment.`, // TODO: i18n?
            status: MatrixPaymentStatus.accepted,
            senderId: matrixAuth.userId,
            ecash,
        })
    },
)

export const rejectMatrixPaymentRequest = createAsyncThunk<
    void,
    { event: MatrixPaymentEvent }
>('matrix/rejectMatrixPaymentRequest', async ({ event }) => {
    const client = getMatrixClient()
    client.sendMessage(event.roomId, {
        ...event.content,
        body: 'Payment request rejected.', // TODO: i18n?
        status: MatrixPaymentStatus.rejected,
    })
})

export const searchMatrixUsers = createAsyncThunk<MatrixSearchResults, string>(
    'matrix/searchMatrixUsers',
    async query => {
        const client = getMatrixClient()
        return client.userDirectorySearch(query)
    },
)

export const paginateMatrixRoomTimeline = createAsyncThunk<
    { end: boolean },
    { roomId: MatrixRoom['id']; limit?: number },
    { state: CommonState }
>(
    'matrix/paginateMatrixRoomTimeline',
    async ({ roomId, limit = 20 }, { getState }) => {
        const numEvents = getState().matrix.roomTimelines[roomId]?.length || 0
        const client = getMatrixClient()
        return client.roomPaginateTimeline(roomId, numEvents + limit)
    },
)

export const sendMatrixReadReceipt = createAsyncThunk<
    void,
    { roomId: MatrixRoom['id']; eventId: MatrixEvent['id'] }
>('matrix/sendMatrixEventReadReceipt', async ({ roomId, eventId }) => {
    const client = getMatrixClient()
    await client.sendReadReceipt(roomId, eventId)
})

/*** Selectors ***/

export const selectMatrixStatus = (s: CommonState) => s.matrix.status

/**
 * Returns a list of matrix rooms, excluding any that are loading or missing room information.
 * TODO: Alternate selector that includes loading rooms, or refactor all to handle loading rooms?
 */
export const selectMatrixRooms = createSelector(
    (s: CommonState) => s.matrix.roomList,
    (s: CommonState) => s.matrix.roomInfo,
    (s: CommonState) => s.matrix.roomPowerLevels,
    (roomList, roomInfo, roomPowerLevels) => {
        const rooms: MatrixRoom[] = []
        for (const item of roomList) {
            if (!item.id) continue
            const room = roomInfo[item.id]
            if (!room) continue
            const powerLevels = roomPowerLevels[room.id]
            rooms.push({
                ...room,
                broadcastOnly: powerLevels
                    ? getRoomEventPowerLevel(powerLevels, [
                          'm.room.message',
                          'm.room.encrypted',
                      ]) >= MatrixPowerLevel.Moderator
                    : false,
            })
        }
        return rooms
    },
)

export const selectMatrixAuth = createSelector(
    (s: CommonState) => s.matrix.auth,
    auth => {
        if (!auth) return auth
        return {
            ...auth,
            displayName: auth.displayName || matrixIdToUsername(auth.userId),
        }
    },
)

export const selectMatrixUsers = (s: CommonState) => s.matrix.users

export const selectMatrixUser = (s: CommonState, userId: MatrixUser['id']) =>
    s.matrix.users[userId]

export const selectMatrixOrderedRoomsList = createSelector(
    selectMatrixRooms,
    rooms => {
        return rooms
    },
)

export const selectMatrixRoom = (s: CommonState, roomId: MatrixRoom['id']) =>
    selectMatrixRooms(s).find(room => room.id === roomId)

export const selectMatrixRoomPowerLevels = (
    s: CommonState,
    roomId: MatrixRoom['id'],
) => s.matrix.roomPowerLevels[roomId]

export const selectMatrixRoomMembers = (
    s: CommonState,
    roomId: MatrixRoom['id'],
) => s.matrix.roomMembers[roomId] || []

export const selectMatrixRoomMemberMap = createSelector(
    selectMatrixRoomMembers,
    members =>
        members.reduce((acc, member) => {
            acc[member.id] = member
            return acc
        }, {} as Record<MatrixRoomMember['id'], MatrixRoomMember | undefined>),
)

export const selectMatrixRoomMember = (
    s: CommonState,
    roomId: string,
    userId: string,
) => selectMatrixRoomMembers(s, roomId).find(m => m.id === userId)

export const selectMatrixRoomEvents = createSelector(
    (s: CommonState) => s.matrix.roomTimelines,
    (_s: CommonState, roomId: MatrixRoom['id']) => roomId,
    (roomTimelines, roomId): MatrixEvent[] => {
        const timeline = roomTimelines[roomId]
        if (!timeline) return []

        // Filter out non-events from the timeline
        let events = timeline.filter((item): item is MatrixEvent => {
            return item !== null
        })

        // Filter out payment events that aren't the initial push or request
        // since we only render the original event. Keep track of the latest
        // payment for each payment ID, and replace the intial event's content
        // with the latest content.
        const latestPayments: Record<string, MatrixPaymentEvent> = {}
        events = events.filter(event => {
            if (!isPaymentEvent(event)) return true
            latestPayments[event.content.paymentId] = event
            return [
                MatrixPaymentStatus.pushed,
                MatrixPaymentStatus.requested,
            ].includes(event.content.status)
        })
        events = events.map(event => {
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

        return events
    },
)

export const selectMatrixRoomLatestPaymentEvent = createSelector(
    selectMatrixRoomEvents,
    (
        _s: CommonState,
        _roomId: MatrixRoom['id'],
        paymentId: MatrixPaymentEventContent['paymentId'],
    ) => paymentId,
    (events, paymentId) => {
        for (let i = events.length - 1; i >= 0; i--) {
            const event = events[i]
            if (
                isPaymentEvent(event) &&
                event.content.paymentId === paymentId
            ) {
                return event
            }
        }
    },
)

export const selectMatrixRoomSelfPowerLevel = createSelector(
    selectMatrixRoomMembers,
    selectMatrixAuth,
    (members, auth) => {
        const member = members.find(m => m.id === auth?.userId)
        return member?.powerLevel || 0
    },
)

export const selectMatrixRoomIsReadOnly = createSelector(
    selectMatrixRoomPowerLevels,
    selectMatrixRoomSelfPowerLevel,
    (roomPowerLevels, selfPowerLevel) => {
        if (!roomPowerLevels) return false
        return (
            getRoomEventPowerLevel(roomPowerLevels, [
                'm.room.message',
                'm.room.encrypted',
            ]) > selfPowerLevel
        )
    },
)

export const selectMatrixDirectMessageRoom = createSelector(
    (_: CommonState, userId: string) => userId,
    selectMatrixRooms,
    (userId, rooms) => rooms.find(room => room.directUserId === userId),
)

export const selectMatrixHasNotifications = (s: CommonState) =>
    selectMatrixRooms(s).some(room => room.notificationCount > 0)

/**
 * Returns users who we have DM'd with most recently. Optionally
 * takes in an argument of the number to return, defaults to 4.
 */
export const selectRecentMatrixRoomMembers = createSelector(
    selectMatrixRooms,
    (s: CommonState) => s.matrix.roomMembers,
    (_: CommonState, limit?: number) => limit || 4,
    (rooms, roomMembers, limit) => {
        const recentUsers: MatrixRoomMember[] = []
        for (const room of rooms) {
            // Only grab users from direct chats
            const { directUserId } = room
            if (!directUserId) continue
            if (recentUsers.some(u => u.id === directUserId)) continue
            const user = roomMembers[room.id]?.find(m => m.id === directUserId)
            if (!user) continue
            recentUsers.push(user)
            // Break out if we reach limit
            if (recentUsers.length >= limit) break
        }
        return recentUsers
    },
)

export const selectLatestMatrixRoomEventId = (
    s: CommonState,
    roomId: MatrixRoom['id'],
): MatrixEvent['eventId'] | undefined => {
    const timeline = s.matrix.roomTimelines[roomId]
    if (timeline) {
        for (let i = timeline?.length - 1; i >= 0; i--) {
            const item = timeline[i]
            if (!item) continue
            const { eventId } = item
            if (!eventId) continue
            return eventId
        }
    }
}
