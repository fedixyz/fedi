import {
    createSlice,
    PayloadAction,
    createAsyncThunk,
    createSelector,
} from '@reduxjs/toolkit'
import orderBy from 'lodash/orderBy'
import { v4 as uuidv4 } from 'uuid'

import {
    CommonState,
    selectAuthenticatedMember,
    selectFederation,
    selectFederations,
    selectGlobalCommunityMeta,
    selectWalletFederations,
} from '.'
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
    Sats,
    MatrixGroupPreview,
    FederationListItem,
} from '../types'
import { RpcRoomId, RpcRoomNotificationMode } from '../types/bindings'
import amountUtils from '../utils/AmountUtils'
import { getFederationGroupChats } from '../utils/FederationUtils'
import { MatrixChatClient } from '../utils/MatrixChatClient'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import {
    getReceivablePaymentEvents,
    getUserSuffix,
    isPaymentEvent,
    makeChatFromPreview,
    matrixIdToUsername,
    mxcUrlToHttpUrl,
    shouldShowUnreadIndicator,
} from '../utils/matrix'
import { getRoomEventPowerLevel } from '../utils/matrix'
import { applyObservableUpdates } from '../utils/observable'
import { isBolt11 } from '../utils/parser'
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
    status: MatrixSyncStatus.uninitialized,
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
    roomNotificationMode: {} as Record<
        MatrixRoom['id'],
        RpcRoomNotificationMode | undefined
    >,
    users: {} as Record<MatrixUser['id'], MatrixUser | undefined>,
    errors: [] as MatrixError[],
    pushNotificationToken: null as string | null,
    groupPreviews: {} as Record<MatrixRoom['id'], MatrixGroupPreview>,
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
        setMatrixRoomNotificationMode(
            state,
            action: PayloadAction<{
                roomId: MatrixRoom['id']
                mode: RpcRoomNotificationMode
            }>,
        ) {
            const { roomId, mode } = action.payload
            state.roomNotificationMode[roomId] = mode
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
            log.debug('startMatrixClient.pending')
            state.status = MatrixSyncStatus.initialSync
        })
        builder.addCase(startMatrixClient.fulfilled, (state, action) => {
            state.auth = action.payload
        })
        builder.addCase(startMatrixClient.rejected, state => {
            log.debug('startMatrixClient.rejected')
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

        builder.addCase(
            configureMatrixPushNotifications.fulfilled,
            (state, action) => {
                state.pushNotificationToken = action.payload
            },
        )

        builder.addCase(loadFromStorage.fulfilled, (_state, action) => {
            if (!action.payload) return
            // state.auth = action.payload.matrixAuth
        })

        builder.addCase(
            updateMatrixRoomNotificationMode.fulfilled,
            (state, action) => {
                state.roomNotificationMode[action.meta.arg.roomId] =
                    action.payload
            },
        )
        builder.addCase(previewDefaultGroupChats.fulfilled, (state, action) => {
            const updatedDefaultGroups = action.payload.reduce(
                (
                    result: Record<RpcRoomId, MatrixGroupPreview>,
                    preview: MatrixGroupPreview,
                ) => {
                    result[preview.info.id] = {
                        ...preview,
                        isDefaultGroup: true,
                    }
                    return result
                },
                {},
            )
            state.groupPreviews = updatedDefaultGroups
        })
        builder.addCase(getMatrixRoomPreview.fulfilled, (state, action) => {
            if (!action.payload) return
            const existingPreview = state.groupPreviews[action.meta.arg] || {}
            state.groupPreviews[action.meta.arg] = {
                ...existingPreview,
                ...action.payload,
            }
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
    setMatrixRoomNotificationMode,
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
    client.on('auth', auth => dispatch(setMatrixAuth(auth)))
    client.on('roomListUpdate', updates =>
        dispatch(handleMatrixRoomListObservableUpdates(updates)),
    )
    client.on('roomInfo', room => {
        dispatch(addMatrixRoomInfo(room))
        if (room.roomState === 'Invited') {
            dispatch(joinMatrixRoom({ roomId: room.id }))
        }
    })
    client.on('roomMember', member => dispatch(addMatrixRoomMember(member)))
    client.on('roomMembers', ev => dispatch(setMatrixRoomMembers(ev)))
    client.on('roomTimelineUpdate', ev =>
        dispatch(handleMatrixRoomTimelineObservableUpdates(ev)),
    )
    client.on('roomPowerLevels', ev => dispatch(setMatrixRoomPowerLevels(ev)))

    client.on('roomNotificationMode', ev =>
        dispatch(setMatrixRoomNotificationMode(ev)),
    )

    client.on('error', err => dispatch(addMatrixError(err)))

    client.on('status', status => {
        log.debug('Matrix client status update: ', status)
        if (status === getState().matrix.status) return
        dispatch(setMatrixStatus(status))
    })

    // Start the client
    return client.start(fedimint)
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
    { roomId: MatrixRoom['id']; isPublic?: boolean }
>('matrix/joinMatrixRoom', async ({ roomId, isPublic = false }) => {
    const client = getMatrixClient()
    return client.joinRoom(roomId, isPublic)
})

export const createMatrixRoom = createAsyncThunk<
    { roomId: MatrixRoom['id'] },
    { name: MatrixRoom['name']; broadcastOnly?: boolean; isPublic?: boolean }
>('matrix/createMatrixRoom', async ({ name, broadcastOnly, isPublic }) => {
    const client = getMatrixClient()
    const roomArgs: MatrixCreateRoomOptions = { name }
    if (broadcastOnly) {
        roomArgs.power_level_content_override = {
            events_default: MatrixPowerLevel.Moderator,
        }
    }
    if (isPublic === true) {
        roomArgs.visibility = 'public'
        roomArgs.initial_state = [
            {
                content: {
                    history_visibility: 'world_readable',
                },
                type: 'm.room.history_visibility',
                state_key: '',
            },
        ]
    }
    const { roomId } = await client.createRoom(roomArgs)
    if (isPublic === true) {
        // for public rooms set the roomId as the topic so it is filterable for room previews
        await client.setRoomTopic(roomId, roomId)
    }
    return { roomId }
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
    {
        fedimint: FedimintBridge
        roomId: MatrixRoom['id']
        body: string
        // this allows us to convert a copy-pasted bolt11 invoice
        // into a custom message for smoother payments UX
        // TODO: add support for copy-pasting bolt11 invoices in a groupchat
        options?: { interceptBolt11: boolean }
    }
>(
    'matrix/sendMatrixMessage',
    async ({
        fedimint,
        roomId,
        body,
        options = { interceptBolt11: false },
    }) => {
        const client = getMatrixClient()
        if (options.interceptBolt11) {
            try {
                if (isBolt11(body)) {
                    const decoded = await fedimint.decodeInvoice(body)
                    log.info(
                        'Intercepted a Bolt 11 invoice in m.text msgtype, sending as xyz.fedi.payment msgtype instead',
                    )
                    // make sure to do this only if we have an amount
                    // TODO: support amount-less invoices
                    if (decoded.amount) {
                        const sats = amountUtils.msatToSat(decoded.amount)
                        return client.sendMessage(roomId, {
                            msgtype: 'xyz.fedi.payment',
                            body: `Requested payment of ${amountUtils.formatSats(
                                sats,
                            )} SATS. Use the Fedi app to complete this request.`, // TODO: i18n?
                            paymentId: uuidv4(),
                            status: MatrixPaymentStatus.requested,
                            amount: decoded.amount,
                            bolt11: decoded.invoice,
                        })
                    }
                }
            } catch (error) {
                log.info('not a bolt11 invoice... send as m.text')
            }
        }
        await client.sendMessage(roomId, {
            msgtype: 'm.text',
            body,
        })
    },
)

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
        amount: Sats
    },
    { state: CommonState }
>(
    'matrix/sendMatrixPaymentPush',
    async (
        { fedimint, federationId, roomId, recipientId, amount },
        { getState },
    ) => {
        const state = getState()
        const federation = selectFederation(state, federationId)
        const matrixAuth = selectMatrixAuth(state)
        if (!matrixAuth) throw new Error('Not authenticated')
        if (!federation) throw new Error('Federation not found')
        log.info('sendMatrixPaymentPush', amount, 'sats')
        const msats = amountUtils.satToMsat(amount)

        const client = getMatrixClient()
        const { ecash } = await fedimint.generateEcash(msats, federationId)

        await client.sendMessage(roomId, {
            msgtype: 'xyz.fedi.payment',
            body: `Sent payment of ${amountUtils.formatSats(
                amount,
            )} SATS. Use the Fedi app to accept this payment.`, // TODO: i18n? this only shows to matrix clients, not Fedi users
            status: MatrixPaymentStatus.pushed,
            paymentId: uuidv4(),
            senderId: matrixAuth.userId,
            amount: msats,
            recipientId,
            ecash,
            federationId: federation?.id,
            inviteCode: federation?.inviteCode,
        })
    },
)

export const sendMatrixPaymentRequest = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        federationId: string
        roomId: MatrixRoom['id']
        amount: Sats
    },
    { state: CommonState }
>(
    'matrix/sendMatrixDirectPaymentRequestMessage',
    async ({ federationId, roomId, amount }, { getState }) => {
        const matrixAuth = selectMatrixAuth(getState())
        if (!matrixAuth) throw new Error('Not authenticated')
        log.info('sendMatrixPaymentRequest', amount, 'sats')
        const msats = amountUtils.satToMsat(amount)

        const client = getMatrixClient()

        await client.sendMessage(roomId, {
            msgtype: 'xyz.fedi.payment',
            body: `Requested payment of ${amountUtils.formatSats(
                amount,
            )} SATS. Use the Fedi app to complete this request.`, // TODO: i18n?
            paymentId: uuidv4(),
            status: MatrixPaymentStatus.requested,
            recipientId: matrixAuth.userId,
            amount: msats,
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
    if (!federationId)
        throw new Error('Payment message is missing federationId')

    await fedimint.receiveEcash(ecash, federationId)
    await client.sendMessage(event.roomId, {
        ...event.content,
        body: 'Payment received.', // TODO: i18n?
        status: MatrixPaymentStatus.received,
    })
    await client.markRoomAsUnread(event.roomId, true)
})

export const checkForReceivablePayments = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        roomId?: MatrixRoom['id']
        receivedPayments: Set<string>
    },
    { state: CommonState }
>(
    'matrix/checkForReceivablePayments',
    async ({ fedimint, roomId, receivedPayments }, { getState, dispatch }) => {
        const state = getState()
        const myId = state.matrix.auth?.userId
        // if we have a roomId, check only that room's timeline
        // otherwise check all loaded timelines for receivable payments
        // note: timelines are only loaded when clicking into a chat so this
        // isn't as bad on performance as it might seem
        const timeline = roomId
            ? state.matrix.roomTimelines[roomId]
            : // flattens all timelines into 1 array
              Object.values(state.matrix.roomTimelines).reduce<
                  MatrixTimelineItem[]
              >((result, t) => {
                  if (!t) return result
                  return [...result, ...t]
              }, [])
        if (!myId || !timeline) return
        const walletFederations = selectWalletFederations(getState())
        log.info('Looking for receivable payment events...')

        const receivablePayments = getReceivablePaymentEvents(
            timeline,
            myId,
            walletFederations,
        )
        log.info(`Found ${receivablePayments.length} receivable payments`)
        receivablePayments.forEach(event => {
            if (receivedPayments.has(event.content.paymentId)) return
            receivedPayments.add(event.content.paymentId)
            log.info(
                'Unclaimed matrix payment event detected, attempting to claim',
                event,
            )
            dispatch(claimMatrixPayment({ fedimint, event }))
                .unwrap()
                .then(() => {
                    log.info('Successfully claimed matrix payment', event)
                })
                .catch(err => {
                    log.warn(
                        'Failed to claim matrix payment, will try again later',
                        err,
                    )
                    receivedPayments.delete(event.content.paymentId)
                })
        })
    },
)

export const cancelMatrixPayment = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; event: MatrixPaymentEvent }
>('matrix/cancelMatrixPayment', async ({ fedimint, event }) => {
    const client = getMatrixClient()

    if (event.content.ecash && event.content.federationId) {
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
        if (!federationId)
            throw new Error('Need federation id to generate ecash')
        const { ecash } = await fedimint.generateEcash(
            amount as MSats,
            federationId,
        )
        await client.sendMessage(event.roomId, {
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
    await client.sendMessage(event.roomId, {
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

export const fetchMatrixProfile = createAsyncThunk<any, string>(
    'matrix/fetchMatrixProfile',
    async userId => {
        const client = getMatrixClient()
        return client.fetchMatrixProfile(userId)
    },
)

export const getMatrixRoomPreview = createAsyncThunk<
    MatrixGroupPreview,
    string
>('matrix/getMatrixRoomPreview', async roomId => {
    const client = getMatrixClient()
    return client.getRoomPreview(roomId)
})

export const refetchMatrixRoomMembers = createAsyncThunk<void, string>(
    'matrix/refetchRoomMembers',
    async roomId => {
        const client = getMatrixClient()
        return client.refetchRoomMembers(roomId)
    },
)

export const refetchMatrixRoomList = createAsyncThunk<void, void>(
    'matrix/refetchRoomList',
    async () => {
        const client = getMatrixClient()
        return client.refetchRoomList()
    },
)

export const paginateMatrixRoomTimeline = createAsyncThunk<
    { end: boolean },
    { roomId: MatrixRoom['id']; limit?: number },
    { state: CommonState }
>(
    'matrix/paginateMatrixRoomTimeline',
    async ({ roomId, limit = 30 }, { getState }) => {
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
    await client.markRoomAsUnread(roomId, false)
})

export const configureMatrixPushNotifications = createAsyncThunk<
    string,
    { getToken: () => Promise<string>; appId: string; appName: string }
>(
    'matrix/configureMatrixPushNotifications',
    async ({ getToken, appId, appName }) => {
        const client = getMatrixClient()
        const token = await getToken()
        await client.configureNotificationsPusher(token, appId, appName)
        return token
    },
)

export const updateMatrixRoomNotificationMode = createAsyncThunk<
    RpcRoomNotificationMode,
    { roomId: MatrixRoom['id']; mode: RpcRoomNotificationMode }
>('matrix/updateMatrixRoomNotificationMode', async ({ roomId, mode }) => {
    const client = getMatrixClient()
    await client.setRoomNotificationMode(roomId, mode)
    return mode
})

export const ignoreUser = createAsyncThunk<void, { userId: MatrixUser['id'] }>(
    'matrix/ignoreUser',
    async ({ userId }) => {
        const client = getMatrixClient()
        await client.ignoreUser(userId)
    },
)

export const unignoreUser = createAsyncThunk<
    void,
    { userId: MatrixUser['id'] }
>('matrix/unignoreUser', async ({ userId }) => {
    const client = getMatrixClient()
    await client.unignoreUser(userId)
})

export const kickUser = createAsyncThunk<
    void,
    {
        roomId: MatrixRoom['id']
        userId: MatrixRoomMember['id']
        reason?: string
    }
>('matrix/kickUser', async ({ roomId, userId, reason }) => {
    const client = getMatrixClient()
    await client.roomKickUser(roomId, userId, reason)
})

export const banUser = createAsyncThunk<
    void,
    {
        roomId: MatrixRoom['id']
        userId: MatrixRoomMember['id']
        reason?: string
    }
>('matrix/banUser', async ({ roomId, userId, reason }) => {
    const client = getMatrixClient()
    await client.roomBanUser(roomId, userId, reason)
})

export const unbanUser = createAsyncThunk<
    void,
    {
        roomId: MatrixRoom['id']
        userId: MatrixRoomMember['id']
        reason?: string
    }
>('matrix/unbanUser', async ({ roomId, userId, reason }) => {
    const client = getMatrixClient()
    await client.roomUnbanUser(roomId, userId, reason)
})

export const previewCommunityDefaultChats = createAsyncThunk<
    MatrixGroupPreview[],
    string,
    { state: CommonState }
>('matrix/previewCommunityDefaultChats', async (federationId, { getState }) => {
    const client = getMatrixClient()
    const federation = selectFederation(getState(), federationId)
    if (!federation) return []
    const defaultChats = getFederationGroupChats(federation.meta)
    log.info(
        `Found ${defaultChats.length} default groups for federation ${federation.name}...`,
    )
    const roomPreviews = await Promise.allSettled(
        defaultChats.map(client.getRoomPreview),
    )
    return roomPreviews.flatMap(preview => {
        if (preview.status === 'fulfilled') {
            return [preview.value]
        } else {
            log.error('getRoomPreview', preview.reason)
            return []
        }
    })
})

export const previewDefaultGroupChats = createAsyncThunk<
    MatrixGroupPreview[],
    void,
    { state: CommonState }
>('matrix/previewDefaultGroupChats', async (_, { getState, dispatch }) => {
    const client = getMatrixClient()
    const federations = getState().federation.federations
    // Previews default chats for each federation
    const federationDefaultChatResults = await Promise.allSettled(
        // For each federation, return a promise that that resolves to
        // the result of the dispatched previewCommunityDefaultChats action
        federations.map(f => {
            const federation = selectFederation(getState(), f.id)
            if (!federation) return Promise.reject()
            return dispatch(
                previewCommunityDefaultChats(federation.id),
            ).unwrap()
        }),
    )
    // Collect each federation's default chats list and flatten
    // them into a single array of roomPreviews
    const federationChats = federationDefaultChatResults.flatMap(preview =>
        preview.status === 'fulfilled' ? preview.value : [],
    )
    // Also check the Fedi Global community for default groups
    const globalCommunityMeta = selectGlobalCommunityMeta(getState())

    const globalDefaultChatIds = globalCommunityMeta
        ? getFederationGroupChats(globalCommunityMeta)
        : []
    log.info(
        `Found ${globalDefaultChatIds.length} default groups for global communiy...`,
    )

    const globalChatResults = await Promise.allSettled(
        globalDefaultChatIds.map(client.getRoomPreview),
    )
    const globalChats: MatrixGroupPreview[] = globalChatResults.flatMap(
        preview => (preview.status === 'fulfilled' ? [preview.value] : []),
    )
    return [...federationChats, ...globalChats]
})

export const ensureHealthyMatrixStream = createAsyncThunk<void, void>(
    'chat/ensureHealthyMatrixStream',
    () => {
        const client = getMatrixClient()
        client.refreshSyncStatus()
    },
)

/*** Selectors ***/

export const selectMatrixStatus = (s: CommonState) => s.matrix.status

export const selectIsMatrixReady = createSelector(
    selectMatrixStatus,
    status => status === MatrixSyncStatus.synced,
)

export const selectMatrixPushNotificationToken = (s: CommonState) =>
    s.matrix.pushNotificationToken

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

export const selectGroupPreviews = createSelector(
    (s: CommonState) => s.matrix.groupPreviews,
    groupPreviews => groupPreviews,
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

export const selectHasSetMatrixDisplayName = createSelector(
    (s: CommonState) => s.matrix.auth,
    auth => {
        // upon registration, displayName will be the 65-character userId by default
        // so use this as a proxy for detecting if the user has set a display name yet
        if (auth && auth.displayName && auth.displayName.length <= 21)
            return true
        return false
    },
)

export const selectMatrixDisplayNameSuffix = createSelector(
    (s: CommonState) => s.matrix.auth,
    auth => (auth ? getUserSuffix(auth.userId) : ''),
)

export const selectNeedsMatrixRegistration = createSelector(
    (s: CommonState) => s.matrix.auth,
    selectHasSetMatrixDisplayName,
    (auth, hasSetMatrixDisplayName) => {
        if (!auth) return true
        if (!hasSetMatrixDisplayName) return true
        return false
    },
)

// TODO: Consider deprecating this after a long enough time has passed and no users exist with old legacy XMPP state
export const selectShouldShowUpgradeChat = createSelector(
    selectNeedsMatrixRegistration,
    (s: CommonState) => selectAuthenticatedMember(s),
    (needsChatRegistration, xmppAuth) => {
        return needsChatRegistration && xmppAuth !== null
    },
)

export const selectMatrixUsers = (s: CommonState) => s.matrix.users

export const selectMatrixUser = (s: CommonState, userId: MatrixUser['id']) =>
    s.matrix.users[userId]

export const selectMatrixChatsList = createSelector(
    selectMatrixRooms,
    selectGroupPreviews,
    (roomsList, defaultGroupPreviews): MatrixRoom[] => {
        // Here we add preview rooms from the default groups list to be
        // displayed alongside the user's joined rooms to make it seem like
        // the user has joined these rooms when really they are just public previews
        // TODO: These should be moved to the Community screen and only shown
        // when the user switches to view that community
        const defaultGroupsList = Object.entries(defaultGroupPreviews).reduce<
            MatrixRoom[]
        >((result, [_, preview]: [RpcRoomId, MatrixGroupPreview]) => {
            const { info, timeline } = preview
            // don't include previews if we dont have info and timeline
            if (!info || !timeline) return result
            // don't include previews unless they are default groups
            if (!preview.isDefaultGroup) return result
            // don't include previews that have no messages in the timeline
            if (timeline.filter(t => t !== null).length === 0) return result
            // don't include previews for rooms we are already joined to
            if (roomsList.find(r => r.id === info.id)) return result
            result.push(makeChatFromPreview(preview))
            return result
        }, [])
        // don't include rooms that we have not joined yet this should happen
        // automatically but we filter here anyway in case the join fails for some reason
        const joinedRoomsList = roomsList.filter(r => r.roomState === 'Joined')
        const chatList: MatrixRoom[] = [
            ...joinedRoomsList,
            ...defaultGroupsList,
        ]
        return orderBy(chatList, item => item.preview?.timestamp || 0, 'desc')
    },
)

export const selectIsMatrixChatEmpty = (s: CommonState) =>
    selectMatrixChatsList(s).length === 0

export const selectMatrixRoom = (s: CommonState, roomId: MatrixRoom['id']) =>
    selectMatrixRooms(s).find(room => room.id === roomId)

export const selectGroupPreview = createSelector(
    selectGroupPreviews,
    (_s: CommonState, roomId: RpcRoomId) => roomId,
    (groupPreviews: Record<RpcRoomId, MatrixGroupPreview>, roomId: RpcRoomId) =>
        groupPreviews[roomId] || undefined,
)

export const selectMatrixRoomPowerLevels = (
    s: CommonState,
    roomId: MatrixRoom['id'],
) => s.matrix.roomPowerLevels[roomId]

export const selectMatrixRoomNotificationMode = (
    s: CommonState,
    roomId: MatrixRoom['id'],
) => s.matrix.roomNotificationMode[roomId]

export const selectMatrixRoomMembers = (
    s: CommonState,
    roomId: MatrixRoom['id'],
) => s.matrix.roomMembers[roomId] || ([] as MatrixRoomMember[])

export const selectActiveMatrixRoomMembers = createSelector(
    selectMatrixRoomMembers,
    members => members.filter(m => m.membership === 'join'),
)

/**
 * Get the list of members in a room.
 * Make the first member the current user.
 * Leave the rest of the list as is.
 */
export const selectMatrixRoomMembersByMe = createSelector(
    selectActiveMatrixRoomMembers,
    selectMatrixAuth,
    (members, auth) => {
        const index = members.findIndex(({ id }) => id === auth?.userId)
        if (index === -1) return members
        return [
            members[index],
            ...members.slice(0, index),
            ...members.slice(index + 1),
        ]
    },
)

/**
 * Returns count of active room members.
 * Doesn't include members who left or
 * have been invited but have not joined.
 */
export const selectMatrixRoomMembersCount = (
    s: CommonState,
    roomId: MatrixRoom['id'],
) => selectActiveMatrixRoomMembers(s, roomId).length ?? 0

export const selectMatrixRoomMemberMap = createSelector(
    selectMatrixRoomMembers,
    members =>
        members.reduce((acc, member) => {
            acc[member.id] = member
            return acc
        }, {} as Record<MatrixRoomMember['id'], MatrixRoomMember | undefined>),
)

export const selectMatrixRoomMember = createSelector(
    (s: CommonState, roomId: MatrixRoom['id']): MatrixRoomMember[] =>
        selectMatrixRoomMembers(s, roomId),
    (_s: CommonState, _roomId: MatrixRoom['id'], userId: MatrixUser['id']) =>
        userId,
    (members, userId): MatrixRoomMember | undefined =>
        members.find(m => m.id === userId),
)

export const selectMatrixRoomEventsHaveLoaded = (
    s: CommonState,
    roomId: MatrixRoom['id'],
) => s.matrix.roomTimelines[roomId] !== undefined

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

export const selectMatrixHasNotifications = createSelector(
    selectMatrixRooms,
    rooms =>
        rooms.some(room =>
            shouldShowUnreadIndicator(
                room.notificationCount,
                room.isMarkedUnread,
            ),
        ),
)

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

export const selectCanPayFromOtherFeds = createSelector(
    (s: CommonState) => selectFederations(s),
    (s: CommonState, chatPayment: MatrixPaymentEvent) => chatPayment,
    (federations, chatPayment): boolean => {
        return !!federations.find(
            f =>
                f.hasWallet &&
                f.balance &&
                f.balance > chatPayment.content.amount,
        )
    },
)

export const selectCanSendPayment = createSelector(
    (s: CommonState) => selectFederations(s),
    (s: CommonState, chatPayment: MatrixPaymentEvent) => chatPayment,
    (federations, chatPayment): boolean => {
        return !!federations.find(
            f =>
                f.id === chatPayment.content.federationId &&
                f.hasWallet &&
                f.balance &&
                f.balance > chatPayment.content.amount,
        )
    },
)

export const selectCanClaimPayment = createSelector(
    (s: CommonState) => selectFederations(s),
    (s: CommonState, chatPayment: MatrixPaymentEvent) => chatPayment,
    (federations, chatPayment): boolean => {
        return !!federations.find(
            f => f.id === chatPayment.content.federationId,
        )
    },
)

export const selectCommunityDefaultRoomIds = createSelector(
    (s: CommonState, federationId: string) => selectFederation(s, federationId),
    federation => {
        if (!federation) return []
        return getFederationGroupChats(federation.meta)
    },
)

export const selectDefaultMatrixRoomIds = createSelector(
    (s: CommonState) => selectFederations(s),
    (s: CommonState) => selectGlobalCommunityMeta(s),
    (federations, globalCommunityMeta) => {
        let defaultMatrixRoomIds: MatrixRoom['id'][] = federations.reduce(
            (result: MatrixRoom['id'][], f: FederationListItem) => {
                const defaultRoomIds = getFederationGroupChats(f.meta)
                return [...result, ...defaultRoomIds]
            },
            [],
        )
        // Also check the Fedi Global community for default groups
        if (globalCommunityMeta) {
            const defaultGlobalRoomIds =
                getFederationGroupChats(globalCommunityMeta)
            defaultMatrixRoomIds = [
                ...defaultMatrixRoomIds,
                ...defaultGlobalRoomIds,
            ]
        }
        return defaultMatrixRoomIds
    },
)
