import {
    PayloadAction,
    createAsyncThunk,
    createSelector,
    createSlice,
    isAnyOf,
} from '@reduxjs/toolkit'
import isEqual from 'lodash/isEqual'
import orderBy from 'lodash/orderBy'
import { v4 as uuidv4 } from 'uuid'

import {
    CommonState,
    selectLastUsedFederation,
    selectBtcUsdExchangeRate,
    selectLoadedFederation,
    selectLoadedFederations,
    selectCommunity,
    selectCommunities,
    selectGlobalCommunityMetadata,
    setGuardianitoBot,
    cancelEcash,
} from '.'
import { GUARDIANITO_BOT_DISPLAY_NAME } from '../constants/matrix'
import {
    ChatReplyState,
    Federation,
    InputMedia,
    MSats,
    MatrixAuth,
    MatrixCreateRoomOptions,
    MatrixError,
    MatrixEvent,
    MatrixEventContentType,
    MatrixGroupPreview,
    MatrixPaymentEvent,
    MatrixPaymentEventContent,
    MatrixPowerLevel,
    MatrixRoom,
    MatrixRoomListItem,
    MatrixRoomListStreamUpdates,
    MatrixRoomMember,
    MatrixRoomPowerLevels,
    MatrixSearchResults,
    MatrixSyncStatus,
    MatrixTimelineStreamUpdates,
    MatrixUser,
    MultispendActiveInvitation,
    MultispendFinalized,
    MultispendRole,
    Sats,
    SelectableMessageKind,
    UsdCents,
} from '../types'
import {
    FrontendMetadata,
    GroupInvitation,
    JSONObject,
    MsEventData,
    MultispendListedEvent,
    NetworkError,
    RpcBackPaginationStatus,
    RpcMentions,
    RpcFormResponse,
    RpcMultispendGroupStatus,
    RpcRoomId,
    RpcRoomNotificationMode,
    RpcSPv2SyncResponse,
    RpcTimelineEventItemId,
} from '../types/bindings'
import amountUtils from '../utils/AmountUtils'
import {
    getDefaultGroupChats,
    shouldShowInviteCode,
} from '../utils/FederationUtils'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import {
    filterMultispendEvents,
    consolidatePaymentEvents,
    doesEventContentMatchPreviewMedia,
    getMultispendInvite,
    getMultispendRole,
    getReceivablePaymentEvents,
    getRoomEventPowerLevel,
    getUserSuffix,
    isMultispendInvitation,
    isMultispendWithdrawalEvent,
    isPaymentEvent,
    makeChatFromUnjoinedRoomPreview,
    matrixIdToUsername,
    mxcUrlToHttpUrl,
    shouldShowUnreadIndicator,
    isMultispendFinancialEvent,
    prepareMentionsDataPayload,
    hasMentions,
    isTextEvent,
    isPowerLevelGreaterOrEqual,
    getReclaimablePaymentEvents,
} from '../utils/matrix'
import { isBolt11 } from '../utils/parser'
import { upsertListItem, upsertRecordEntity } from '../utils/redux'
import { applyStreamUpdates } from '../utils/stream'
import { loadFromStorage } from './storage'

const log = makeLog('redux/matrix')

/*** Initial State ***/

const initialState = {
    setup: false,
    started: false,
    auth: null as null | MatrixAuth,
    status: MatrixSyncStatus.uninitialized,
    roomList: [] as MatrixRoomListItem[],
    roomInfo: {} as Record<MatrixRoom['id'], MatrixRoom | undefined>,
    roomMembers: {} as Record<MatrixRoom['id'], MatrixRoomMember[] | undefined>,
    roomTimelines: {} as Record<
        MatrixRoom['id'],
        (MatrixEvent | null)[] | undefined
    >,
    roomPaginationStatus: {} as Record<
        MatrixRoom['id'],
        RpcBackPaginationStatus | undefined
    >,
    roomPowerLevels: {} as Record<
        MatrixRoom['id'],
        MatrixRoomPowerLevels | undefined
    >,
    roomNotificationMode: {} as Record<
        MatrixRoom['id'],
        RpcRoomNotificationMode | undefined
    >,
    roomMultispendStatus: {} as Record<
        MatrixRoom['id'],
        MultispendActiveInvitation | MultispendFinalized | undefined
    >,
    roomMultispendAccountInfo: {} as Record<
        MatrixRoom['id'],
        { Ok: RpcSPv2SyncResponse } | { Err: NetworkError } | undefined
    >,
    // TODO: change this to something like `roomMultispendEventStates`
    // and remove the `counter` and `time` fields. Since we're using this
    // for multiple things (txn list, withdraw screen, chat), the type of this
    // should be the union of all possible event types.
    //
    // e.g. type MultispendEvent = MultispendTransaction | MultispendInvitationEvent
    roomMultispendEvents: {} as Record<
        MatrixRoom['id'],
        MultispendListedEvent[] | undefined
    >,
    users: {} as Record<MatrixUser['id'], MatrixUser | undefined>,
    ignoredUsers: [] as MatrixUser['id'][],
    errors: [] as MatrixError[],
    pushNotificationToken: null as string | null,
    groupPreviews: {} as Record<MatrixRoom['id'], MatrixGroupPreview>,
    drafts: {} as Record<MatrixRoom['id'], string>,
    selectedChatMessage: null as MatrixEvent<SelectableMessageKind> | null,
    messageToEdit: null as MatrixEvent<'m.text'> | null,
    previewMedia: [] as Array<{
        // whether to show a placeholder ChatEvent for the sent `media`
        visible: boolean
        media: InputMedia
    }>,
    replyingToMessage: {
        roomId: undefined as MatrixRoom['id'] | undefined,
        event: null as MatrixEvent | null,
    } satisfies ChatReplyState,
    tempMediaUriMap: {} as Record<string, string>,
    chatsListSearchQuery: '' as string,
    chatTimelineSearchQuery: '' as string,
}

export type MatrixState = typeof initialState

/**
 * Given a list of new events and optionally the old ones, return a
 * combined list that has been sorted and deduplicated.
 *
 * TODO: only modify updated fields for existing transactions
 */
const updateMultispendEvents = (
    newTransactions: MultispendListedEvent[],
    oldTransactions: MultispendListedEvent[] = [],
) => {
    // Use a Map for O(1) lookups during deduplication
    // The Map preserves insertion order, with newer transactions added first
    const transactionMap = new Map<string, MultispendListedEvent>()

    for (const ev of newTransactions) {
        transactionMap.set(ev.eventId, ev)
    }

    // Add old transactions only if they don't already exist in the map
    for (const ev of oldTransactions) {
        if (!transactionMap.has(ev.eventId)) {
            transactionMap.set(ev.eventId, ev)
        }
    }

    const transactions = Array.from(transactionMap.values())

    // Sort list in descending order of when the transaction was created
    return orderBy(transactions, 'counter', 'desc')
}

/*** Slice definition ***/

export const matrixSlice = createSlice({
    name: 'matrix',
    initialState,
    reducers: {
        setMatrixSetup(state, action: PayloadAction<boolean>) {
            state.setup = action.payload
        },
        setMatrixStatus(state, action: PayloadAction<MatrixState['status']>) {
            state.status = action.payload
        },
        setMatrixAuth(state, action: PayloadAction<MatrixState['auth']>) {
            state.auth = action.payload
        },
        addMatrixRoomInfo(state, action: PayloadAction<MatrixRoom>) {
            // Caused by 'form' event in RpcMsgLikeKind in bindings.ts
            state.roomInfo = upsertRecordEntity(state.roomInfo, action.payload)
        },
        handleMatrixRoomListStreamUpdates(
            state,
            action: PayloadAction<MatrixRoomListStreamUpdates>,
        ) {
            state.roomList = applyStreamUpdates(state.roomList, action.payload)
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
        setMatrixIgnoredUsers(
            state,
            action: PayloadAction<MatrixUser['id'][]>,
        ) {
            state.ignoredUsers = action.payload
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
        handleMatrixRoomTimelineStreamUpdates(
            state,
            action: PayloadAction<{
                roomId: string
                updates: MatrixTimelineStreamUpdates
            }>,
        ) {
            const { roomId, updates } = action.payload
            state.roomTimelines[roomId] = applyStreamUpdates(
                state.roomTimelines[roomId] || [],
                updates,
            )
        },
        handleMatrixRoomTimelinePaginationStatus(
            state,
            action: PayloadAction<{
                roomId: string
                paginationStatus: RpcBackPaginationStatus
            }>,
        ) {
            const { roomId, paginationStatus } = action.payload
            state.roomPaginationStatus[roomId] = paginationStatus
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
        setMatrixRoomMultispendStatus(
            state,
            action: PayloadAction<{
                roomId: MatrixRoom['id']
                status: RpcMultispendGroupStatus
            }>,
        ) {
            const { roomId, status } = action.payload
            state.roomMultispendStatus[roomId] =
                status.status === 'inactive'
                    ? undefined
                    : (status as
                          | MultispendActiveInvitation
                          | MultispendFinalized)
        },
        setMatrixRoomMultispendAccountInfo(
            state,
            action: PayloadAction<{
                roomId: MatrixRoom['id']
                info:
                    | { Ok: RpcSPv2SyncResponse }
                    | { Err: NetworkError }
                    | undefined
            }>,
        ) {
            const { roomId, info } = action.payload
            state.roomMultispendAccountInfo[roomId] = info
        },
        setMatrixRoomMultispendTransactions(
            state,
            action: PayloadAction<{
                roomId: MatrixRoom['id']
                events: MultispendListedEvent[]
            }>,
        ) {
            const { roomId, events: transactions } = action.payload
            state.roomMultispendEvents[roomId] = transactions
        },
        updateMatrixRoomMultispendTxns(
            state,
            action: PayloadAction<{
                roomId: MatrixRoom['id']
                events: MultispendListedEvent[]
            }>,
        ) {
            const { roomId, events } = action.payload
            const currentTxns = state.roomMultispendEvents[roomId] || []
            const updatedTxns = updateMultispendEvents(events, currentTxns)
            state.roomMultispendEvents[roomId] = updatedTxns
        },
        updateMatrixRoomMultispendEvent(
            state,
            action: PayloadAction<{
                roomId: MatrixRoom['id']
                eventId: string
                update: MsEventData
            }>,
        ) {
            const existingRoomEvents =
                state.roomMultispendEvents[action.payload.roomId]

            if (!existingRoomEvents) {
                state.roomMultispendEvents[action.payload.roomId] = [
                    {
                        eventId: action.payload.eventId,
                        event: action.payload.update,
                        // TODO: Remove this once we change the type of roomMultispendTransactions
                        counter: 0,
                        time: 0,
                    },
                ]
            } else {
                state.roomMultispendEvents[action.payload.roomId] =
                    existingRoomEvents.map(evt =>
                        evt.eventId === action.payload.eventId
                            ? {
                                  ...evt,
                                  event: action.payload.update,
                                  eventId: action.payload.eventId,
                              }
                            : evt,
                    )
            }
        },
        addMatrixError(state, action: PayloadAction<MatrixError>) {
            state.errors = [...state.errors, action.payload]
        },
        resetMatrixState() {
            return { ...initialState }
        },
        setChatDraft(
            state,
            action: PayloadAction<{ roomId: MatrixRoom['id']; text: string }>,
        ) {
            const { roomId, text } = action.payload
            const id = roomId as keyof MatrixState['drafts']

            if (text.length === 0 && state.drafts[id]) delete state.drafts[id]

            state.drafts[id] = text
        },
        setSelectedChatMessage(
            state,
            action: PayloadAction<MatrixEvent<SelectableMessageKind> | null>,
        ) {
            state.selectedChatMessage = action.payload
        },
        setMessageToEdit(
            state,
            action: PayloadAction<MatrixEvent<'m.text'> | null>,
        ) {
            state.messageToEdit = action.payload
        },
        addPreviewMedia(state, action: PayloadAction<Array<InputMedia>>) {
            state.previewMedia = [
                ...state.previewMedia,
                ...action.payload.map(media => ({ media, visible: true })),
            ]
        },
        matchAndHidePreviewMedia(
            state,
            action: PayloadAction<Array<MatrixEvent<'m.image' | 'm.video'>>>,
        ) {
            let hasUpdates = false
            const updatedPreviewMedia = state.previewMedia.map(cached => {
                if (
                    action.payload.some(event =>
                        doesEventContentMatchPreviewMedia(
                            cached.media,
                            event.content,
                        ),
                    )
                ) {
                    if (cached.visible) {
                        hasUpdates = true
                        return { ...cached, visible: false }
                    }
                }
                return cached
            })

            if (hasUpdates) {
                state.previewMedia = updatedPreviewMedia
            }
        },
        setChatReplyingToMessage(
            state,
            action: PayloadAction<{
                roomId: MatrixRoom['id']
                event: MatrixEvent
            }>,
        ) {
            state.replyingToMessage = {
                roomId: action.payload.roomId,
                event: action.payload.event,
            }
        },
        clearChatReplyingToMessage(state) {
            state.replyingToMessage = { roomId: undefined, event: null }
        },
        addTempMediaUriEntry(
            state,
            action: PayloadAction<{ uri: string; hash: string }>,
        ) {
            state.tempMediaUriMap[action.payload.hash] = action.payload.uri
        },
        setChatsListSearchQuery(state, action: PayloadAction<string>) {
            state.chatsListSearchQuery = action.payload
        },
        setChatTimelineSearchQuery(state, action: PayloadAction<string>) {
            state.chatTimelineSearchQuery = action.payload
        },
    },
    extraReducers: builder => {
        builder.addCase(startMatrixClient.pending, state => {
            log.debug('startMatrixClient.pending')
            state.status = MatrixSyncStatus.initialSync
        })
        builder.addCase(startMatrixClient.fulfilled, state => {
            state.started = true
        })
        builder.addCase(startMatrixClient.rejected, state => {
            log.debug('startMatrixClient.rejected')
            state.status = MatrixSyncStatus.stopped
            state.started = false
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
                        {
                            ...member,
                            powerLevel: { type: 'int', value: powerLevel },
                        },
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

        builder.addCase(fetchMatrixProfile.fulfilled, (state, action) => {
            state.users = upsertRecordEntity(state.users, action.payload)
        })

        builder.addCase(
            configureMatrixPushNotifications.fulfilled,
            (state, action) => {
                state.pushNotificationToken = action.payload
            },
        )

        builder.addCase(loadFromStorage.fulfilled, (state, action) => {
            if (!action.payload) return
            // state.auth = action.payload.matrixAuth
            state.drafts = action.payload.chatDrafts
        })

        builder.addCase(
            updateMatrixRoomNotificationMode.fulfilled,
            (state, action) => {
                state.roomNotificationMode[action.meta.arg.roomId] =
                    action.payload
            },
        )
        builder.addCase(getMatrixRoomPreview.fulfilled, (state, action) => {
            if (!action.payload) return
            const existingPreview =
                state.groupPreviews[action.meta.arg.roomId] || {}
            state.groupPreviews[action.meta.arg.roomId] = {
                ...existingPreview,
                ...action.payload,
            }
        })
        builder.addCase(editMatrixMessage.fulfilled, state => {
            state.messageToEdit = null
        })
        builder.addMatcher(
            isAnyOf(ignoreUser.fulfilled, unignoreUser.fulfilled),
            (state, action) => {
                const oldRoomMembers = state.roomMembers
                Object.entries(oldRoomMembers).forEach(
                    ([roomId, roomMembers]) => {
                        const member = roomMembers?.find(
                            m => m.id === action.meta.arg.userId,
                        )
                        if (!member) return
                        const newRoomMembers = upsertListItem(roomMembers, {
                            ...member,
                            ignored: action.payload,
                        })
                        state.roomMembers[roomId] = newRoomMembers
                    },
                )
            },
        )
        builder.addMatcher(
            isAnyOf(
                previewCommunityDefaultChats.fulfilled,
                previewFederationDefaultChats.fulfilled,
                previewAllDefaultChats.fulfilled,
            ),
            (state, action) => {
                let hasUpdates = false
                const updatedDefaultGroups = action.payload.reduce(
                    (
                        result: Record<RpcRoomId, MatrixGroupPreview>,
                        preview: MatrixGroupPreview,
                    ) => {
                        const existingPreview = result[preview.info.id]
                        const updatedPreview = {
                            ...preview,
                            isDefaultGroup: true,
                        }

                        if (
                            !existingPreview ||
                            !isEqual(existingPreview, updatedPreview)
                        ) {
                            hasUpdates = true
                            result[preview.info.id] = updatedPreview
                        }

                        return result
                    },
                    { ...state.groupPreviews },
                )

                if (hasUpdates) {
                    state.groupPreviews = updatedDefaultGroups
                }
            },
        )
    },
})

/*** Basic actions ***/

export const {
    setMatrixSetup,
    setMatrixStatus,
    setMatrixAuth,
    addMatrixRoomInfo,
    addMatrixRoomMember,
    setMatrixRoomMembers,
    setMatrixIgnoredUsers,
    addMatrixUser,
    setMatrixUsers,
    setMatrixRoomPowerLevels,
    setMatrixRoomNotificationMode,
    setMatrixRoomMultispendStatus,
    setMatrixRoomMultispendAccountInfo,
    setMatrixRoomMultispendTransactions,
    updateMatrixRoomMultispendTxns,
    addMatrixError,
    handleMatrixRoomListStreamUpdates,
    handleMatrixRoomTimelineStreamUpdates,
    handleMatrixRoomTimelinePaginationStatus,
    resetMatrixState,
    setChatDraft,
    setSelectedChatMessage,
    setMessageToEdit,
    addPreviewMedia,
    matchAndHidePreviewMedia,
    updateMatrixRoomMultispendEvent,
    setChatReplyingToMessage,
    clearChatReplyingToMessage,
    addTempMediaUriEntry,
    setChatsListSearchQuery,
    setChatTimelineSearchQuery,
} = matrixSlice.actions

/*** Async thunk actions ***/

export const matrixApproveMultispendInvitation = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; roomId: MatrixRoom['id'] },
    { state: CommonState }
>(
    'matrix/approveMultispendInvitation',
    async ({ fedimint, roomId }, { getState }) => {
        const multispendStatus = selectMatrixRoomMultispendStatus(
            getState(),
            roomId,
        )

        if (multispendStatus?.status !== 'activeInvitation')
            throw new Error(
                'Cannot vote if multispend status is not activeInvitation',
            )

        await fedimint.matrixApproveMultispendGroupInvitation({
            roomId,
            invitation: multispendStatus.active_invite_id,
        })
    },
)

export const matrixRejectMultispendInvitation = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; roomId: MatrixRoom['id'] },
    { state: CommonState }
>(
    'matrix/approveMultispendInvitation',
    async ({ fedimint, roomId }, { getState }) => {
        const multispendStatus = selectMatrixRoomMultispendStatus(
            getState(),
            roomId,
        )

        if (multispendStatus?.status !== 'activeInvitation')
            throw new Error(
                'Cannot vote if multispend status is not activeInvitation',
            )

        await fedimint.matrixRejectMultispendGroupInvitation({
            roomId,
            invitation: multispendStatus.active_invite_id,
        })
    },
)

export const observeMultispendEvent = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; roomId: MatrixRoom['id']; eventId: string }
>('matrix/observeMultispendEvent', async ({ fedimint, roomId, eventId }) => {
    const client = fedimint.getMatrixClient()
    return client.observeMultispendEvent(roomId, eventId)
})

export const unobserveMultispendEvent = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; roomId: MatrixRoom['id']; eventId: string }
>('matrix/unobserveMultispendEvent', async ({ fedimint, roomId, eventId }) => {
    const client = fedimint.getMatrixClient()
    return client.unobserveMultispendEvent(roomId, eventId)
})

export const startMatrixClient = createAsyncThunk<
    void,
    { fedimint: FedimintBridge },
    { state: CommonState }
>('matrix/startMatrix', async ({ fedimint }, { getState, dispatch }) => {
    // Create or grab existing client, bail out if we've already started.
    // TODO: when short circuiting on hasStarted, we should try to return
    // the same promise as the existing start call. Otherwise we may show
    // success on a second call, but failure on the first one.
    const client = fedimint.getMatrixClient()
    if (client.hasStarted) {
        log.info('Matrix client already started')
        return
    }

    // Bind all the listeners we need to dispatch actions
    client.on('auth', auth => dispatch(setMatrixAuth(auth)))
    client.on('roomListUpdate', updates => {
        dispatch(handleMatrixRoomListStreamUpdates(updates))
    })
    client.on('roomInfo', room => {
        dispatch(addMatrixRoomInfo(room))
        if (room.roomState === 'invited') {
            dispatch(joinMatrixRoom({ fedimint, roomId: room.id }))
        }

        // Check if this room is a guardianito room and save it in redux
        if (room.name === GUARDIANITO_BOT_DISPLAY_NAME && room.directUserId) {
            dispatch(
                setGuardianitoBot({
                    bot_user_id: room.directUserId,
                    bot_room_id: room.id,
                }),
            )
        }
    })
    client.on('roomMember', member => dispatch(addMatrixRoomMember(member)))
    client.on('roomMembers', ev => dispatch(setMatrixRoomMembers(ev)))
    client.on('roomTimelineUpdate', ev =>
        dispatch(handleMatrixRoomTimelineStreamUpdates(ev)),
    )
    client.on('roomTimelinePaginationStatus', ev =>
        dispatch(handleMatrixRoomTimelinePaginationStatus(ev)),
    )
    client.on('roomPowerLevels', ev => dispatch(setMatrixRoomPowerLevels(ev)))
    client.on('roomNotificationMode', ev =>
        dispatch(setMatrixRoomNotificationMode(ev)),
    )
    client.on('multispendUpdate', ev => {
        if (ev.status)
            dispatch(
                setMatrixRoomMultispendStatus({
                    roomId: ev.roomId,
                    status: ev.status,
                }),
            )
    })
    client.on('multispendEventUpdate', ({ update, roomId, eventId }) => {
        if (!update) return

        dispatch(
            updateMatrixRoomMultispendEvent({
                roomId,
                eventId,
                update,
            }),
        )
    })
    client.on('multispendAccountUpdate', ev => {
        if (ev.info) {
            dispatch(
                setMatrixRoomMultispendAccountInfo({
                    roomId: ev.roomId,
                    info: ev.info,
                }),
            )
        }
    })
    client.on('multispendTransactions', ev => {
        if (ev.transactions) {
            dispatch(
                updateMatrixRoomMultispendTxns({
                    roomId: ev.roomId,
                    events: ev.transactions,
                }),
            )
        }
    })

    client.on('ignoredUsers', ev => dispatch(setMatrixIgnoredUsers(ev)))

    client.on('error', err => dispatch(addMatrixError(err)))

    client.on('status', status => {
        log.debug('Matrix client status update: ', status)
        if (status === getState().matrix.status) return
        dispatch(setMatrixStatus(status))
    })

    // Start the client
    await client.start(fedimint)
    // preview default chats after matrix is ready
    dispatch(previewAllDefaultChats({ fedimint }))
})

export const setMatrixDisplayName = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; displayName: string }
>('matrix/setMatrixDisplayName', async ({ fedimint, displayName }) => {
    const client = fedimint.getMatrixClient()
    return client.setDisplayName(displayName)
})

export const uploadAndSetMatrixAvatarUrl = createAsyncThunk<
    string,
    { fedimint: FedimintBridge; path: string; mimeType: string }
>('matrix/setMatrixAvatarUrl', async ({ fedimint, path, mimeType }) => {
    const { contentUri } = await fedimint.matrixUploadMedia({ path, mimeType })

    const client = fedimint.getMatrixClient()
    await client.setAvatarUrl(contentUri)
    return contentUri
})

export const joinMatrixRoom = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; roomId: MatrixRoom['id']; isPublic?: boolean }
>('matrix/joinMatrixRoom', async ({ fedimint, roomId, isPublic = false }) => {
    const client = fedimint.getMatrixClient()
    return client.joinRoom(roomId, isPublic)
})

export const createMatrixRoom = createAsyncThunk<
    { roomId: MatrixRoom['id'] },
    {
        fedimint: FedimintBridge
        name: MatrixRoom['name']
        broadcastOnly?: boolean
        isPublic?: boolean
    }
>(
    'matrix/createMatrixRoom',
    async ({ fedimint, name, broadcastOnly, isPublic }) => {
        const client = fedimint.getMatrixClient()
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
    },
)

export const leaveMatrixRoom = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; roomId: MatrixRoom['id'] }
>('matrix/leaveMatrixRoom', async ({ fedimint, roomId }) => {
    const client = fedimint.getMatrixClient()
    return client.leaveRoom(roomId)
})

export const observeMatrixRoom = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; roomId: MatrixRoom['id'] }
>('matrix/observeMatrixRoom', async ({ fedimint, roomId }) => {
    const client = fedimint.getMatrixClient()
    return client.observeRoom(roomId)
})

export const unobserveMatrixRoom = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; roomId: MatrixRoom['id'] },
    { state: CommonState }
>(
    'matrix/unobserveMatrixRoom',
    async ({ fedimint, roomId }, { dispatch, getState }) => {
        const state = getState()

        // Clear reply if leaving the room we're replying in
        if (state.matrix.replyingToMessage.roomId === roomId) {
            dispatch(clearChatReplyingToMessage())
        }

        const client = fedimint.getMatrixClient()
        return client.unobserveRoom(roomId)
    },
)
export const observeMultispendAccountInfo = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; roomId: MatrixRoom['id'] }
>('matrix/observeMultispendRoomDetails', async ({ fedimint, roomId }) => {
    const client = fedimint.getMatrixClient()
    return client.observeMultispendAccount(roomId)
})

export const unobserveMultispendAccountInfo = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; roomId: MatrixRoom['id'] }
>('matrix/unobserveMultispendRoomDetails', async ({ fedimint, roomId }) => {
    const client = fedimint.getMatrixClient()
    return client.unobserveMultispendAccount(roomId)
})

export const inviteUserToMatrixRoom = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        roomId: MatrixRoom['id']
        userId: MatrixUser['id']
    }
>('matrix/inviteUserToMatrixRoom', async ({ fedimint, roomId, userId }) => {
    const client = fedimint.getMatrixClient()
    return client.inviteUserToRoom(roomId, userId)
})

export const setMatrixRoomName = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        roomId: MatrixRoom['id']
        name: MatrixRoom['name']
    }
>('matrix/setMatrixRoomName', async ({ fedimint, roomId, name }) => {
    const client = fedimint.getMatrixClient()
    return client.setRoomName(roomId, name)
})

export const setMatrixRoomBroadcastOnly = createAsyncThunk<
    MatrixRoomPowerLevels,
    {
        fedimint: FedimintBridge
        roomId: MatrixRoom['id']
        broadcastOnly: boolean
    }
>(
    'matrix/setMatrixRoomBroadcastOnly',
    async ({ fedimint, roomId, broadcastOnly }) => {
        const client = fedimint.getMatrixClient()
        return client.setRoomPowerLevels(roomId, {
            events_default: broadcastOnly
                ? MatrixPowerLevel.Moderator
                : MatrixPowerLevel.Member,
        })
    },
)

export const setMatrixRoomMemberPowerLevel = createAsyncThunk<
    MatrixRoomPowerLevels,
    {
        fedimint: FedimintBridge
        roomId: MatrixRoom['id']
        userId: MatrixUser['id']
        powerLevel: MatrixPowerLevel
    },
    { state: CommonState }
>(
    'matrix/setMatrixRoomMemberPowerLevel',
    async ({ fedimint, roomId, userId, powerLevel }, { getState }) => {
        const roomMultispendStatus = selectMatrixRoomMultispendStatus(
            getState(),
            roomId,
        )

        if (
            powerLevel === MatrixPowerLevel.Admin &&
            roomMultispendStatus?.status === 'activeInvitation'
        ) {
            throw new Error('errors.admin-promotion-pending-multispend')
        }

        const client = fedimint.getMatrixClient()
        return client.setRoomMemberPowerLevel(roomId, userId, powerLevel)
    },
)

export const sendMatrixMessageWithMentions = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        roomId: string
        body: string
        mentions: RpcMentions | null
        extra?: JSONObject
    }
>(
    'matrix/sendMatrixMessageWithMentions',
    async ({ fedimint, roomId, body, mentions, extra }) => {
        await fedimint.matrixSendMessage({
            roomId,
            data: {
                msgtype: 'm.text',
                body,
                data: extra ?? {},
                mentions: hasMentions(mentions) ? mentions : null,
            },
        })
    },
)

export const sendMatrixReplyWithMentions = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        roomId: string
        replyToEventId: string
        body: string
        mentions: RpcMentions | null
        extra?: JSONObject
    }
>(
    'matrix/sendMatrixReplyWithMentions',
    async ({ fedimint, roomId, replyToEventId, body, mentions, extra }) => {
        await fedimint.matrixSendReply(roomId, replyToEventId, body, {
            mentions,
            extra,
        })
    },
)

export const editMatrixMessageWithMentions = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        roomId: string
        eventId: RpcTimelineEventItemId
        body: string
        mentions: RpcMentions | null
        extra?: JSONObject
    }
>(
    'matrix/editMatrixMessageWithMentions',
    async ({ fedimint, roomId, eventId, body, mentions, extra }) => {
        await fedimint.matrixEditMessage(roomId, eventId, body, {
            mentions,
            extra,
        })
    },
)

export const editMatrixMessage = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        roomId: MatrixRoom['id']
        eventId: RpcTimelineEventItemId
        body: string
    },
    { state: CommonState }
>(
    'matrix/editMatrixMessage',
    async ({ fedimint, roomId, eventId, body }, { getState, dispatch }) => {
        const state = getState()
        const selfUserId = selectMatrixAuth(state)?.userId
        const members = selectMatrixRoomMembers(state, roomId)
        const { mentions, extra } = prepareMentionsDataPayload(body, members, {
            excludeUserId: selfUserId,
        })

        await dispatch(
            editMatrixMessageWithMentions({
                fedimint,
                roomId,
                eventId,
                body,
                mentions,
                extra,
            }),
        ).unwrap()
    },
)

export const sendMatrixMessage = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        roomId: MatrixRoom['id']
        body: string
        repliedEventId?: string
        // this allows us to convert a copy-pasted bolt11 invoice
        // into a custom message for smoother payments UX
        // TODO: add support for copy-pasting bolt11 invoices in a groupchat
        options?: { interceptBolt11: boolean }
    },
    { state: CommonState }
>(
    'matrix/sendMatrixMessage',
    async (
        {
            fedimint,
            roomId,
            body,
            repliedEventId,
            options = { interceptBolt11: false },
        },
        { getState, dispatch },
    ) => {
        const client = fedimint.getMatrixClient()
        const state = getState()
        const selfUserId = selectMatrixAuth(state)?.userId

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
                        const paymentId = uuidv4()
                        // bolt11 there's no operation ID - cannot get historical value
                        // returned from external invoices - forces current rate fallback

                        return client.sendMessage(roomId, {
                            msgtype: 'xyz.fedi.payment',
                            body: `Requested payment of ${amountUtils.formatSats(sats)} SATS. Use the Fedi app to complete this request.`, // TODO: i18n?
                            paymentId,
                            status: 'requested',
                            amount: decoded.amount,
                            bolt11: decoded.invoice,
                        })
                    }
                }
            } catch (error) {
                log.info(
                    'Not a valid bolt11 invoice or failed to decode... sending as regular text message',
                    error,
                )
            }
        }

        const members = selectMatrixRoomMembers(state, roomId)
        const { mentions, extra } = prepareMentionsDataPayload(body, members, {
            excludeUserId: selfUserId,
        })

        // Handle regular text messages (with or without reply)
        if (repliedEventId) {
            const replyToEventId: string = repliedEventId
            await dispatch(
                sendMatrixReplyWithMentions({
                    fedimint,
                    roomId,
                    replyToEventId,
                    body,
                    mentions,
                    extra,
                }),
            ).unwrap()
            return
        }

        // Non-reply: send via bridge; add m.mentions/formatted_body when present, else plain m.text.
        await dispatch(
            sendMatrixMessageWithMentions({
                fedimint,
                roomId,
                body,
                mentions,
                extra,
            }),
        ).unwrap()
    },
)

export const sendMatrixDirectMessage = createAsyncThunk<
    { roomId: string },
    {
        fedimint: FedimintBridge
        userId: MatrixUser['id']
        body: string
        repliedEventId?: string
    },
    { state: CommonState }
>(
    'matrix/sendMatrixDirectMessage',
    async ({ fedimint, userId, body, repliedEventId }, { getState }) => {
        const client = fedimint.getMatrixClient()
        const state = getState()

        if (repliedEventId) {
            const existingRoom = selectMatrixDirectMessageRoom(state, userId)
            if (!existingRoom) {
                throw new Error(
                    'Cannot reply to message in new direct message room',
                )
            }

            await fedimint.matrixSendReply(
                existingRoom.id,
                repliedEventId,
                body,
            )

            return { roomId: existingRoom.id }
        }

        // Handle regular direct messages
        return await client.sendDirectMessage(userId, {
            msgtype: 'm.text',
            body,
        })
    },
)

export const sendMatrixFormResponse = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        roomId: MatrixRoom['id']
        formResponse: RpcFormResponse
    },
    { state: CommonState }
>(
    'matrix/sendMatrixFormResponse',
    async ({ fedimint, roomId, formResponse }, { getState }) => {
        const state = getState()
        const matrixAuth = selectMatrixAuth(state)
        if (!matrixAuth) throw new Error('Not authenticated')

        // body MUST contain the exact string value guardianito expects or it will be ignored
        const { responseValue } = formResponse
        const body = responseValue?.toString() ?? ''
        log.debug(
            `sendMatrixFormResponse to room ${roomId} with body ${body} and formResponse ${JSON.stringify(formResponse)}`,
        )

        const client = fedimint.getMatrixClient()
        await client.sendMessage(roomId, {
            msgtype: 'xyz.fedi.form',
            body,
            formResponse,
            i18nKeyLabel: formResponse.responseI18nKey,
            type: formResponse.responseType,
            // TODO: fix these nulls on the type gen side.
            options: null,
            value: null,
        })
    },
)

export const sendMatrixPaymentPush = createAsyncThunk<
    string,
    {
        fedimint: FedimintBridge
        federationId: string
        roomId: MatrixRoom['id']
        recipientId: MatrixUser['id']
        amount: Sats
        notes?: string
    },
    { state: CommonState }
>(
    'matrix/sendMatrixPaymentPush',
    async (
        { fedimint, federationId, roomId, recipientId, amount, notes = null },
        { getState },
    ) => {
        const state = getState()
        const federation = selectLoadedFederation(state, federationId)
        const matrixAuth = selectMatrixAuth(state)
        if (!matrixAuth) throw new Error('Not authenticated')
        if (!federation) throw new Error('Federation not found')

        log.info('sendMatrixPaymentPush', amount, 'sats')

        const msats = amountUtils.satToMsat(amount)
        const client = fedimint.getMatrixClient()
        const includeInvite = shouldShowInviteCode(federation.meta)

        const frontendMetadata = {
            recipientMatrixId: recipientId,
            senderMatrixId: matrixAuth.userId,
            initialNotes: notes,
        } satisfies FrontendMetadata

        const { ecash, operationId } = await fedimint.generateEcash(
            msats,
            federationId,
            includeInvite,
            frontendMetadata,
        )

        const senderOperationId = operationId
        const paymentId = uuidv4()

        await fedimint.updateTransactionNotes(
            operationId,
            notes || '',
            federationId,
        )

        await client.sendMessage(roomId, {
            msgtype: 'xyz.fedi.payment',
            body: `Sent payment of ${amountUtils.formatSats(amount)} SATS. Use the Fedi app to accept this payment.`, // TODO: i18n? this only shows to matrix clients, not Fedi users
            status: 'pushed',
            paymentId,
            senderOperationId,
            senderId: matrixAuth.userId,
            recipientId,
            amount: msats,
            ecash,
            federationId: federation.id,
        })

        return senderOperationId
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
    async ({ fedimint, federationId, roomId, amount }, { getState }) => {
        const matrixAuth = selectMatrixAuth(getState())
        if (!matrixAuth) throw new Error('Not authenticated')

        log.info('sendMatrixPaymentRequest', amount, 'sats')

        const msats = amountUtils.satToMsat(amount)
        const client = fedimint.getMatrixClient()

        const paymentId = uuidv4()

        await client.sendMessage(roomId, {
            msgtype: 'xyz.fedi.payment',
            body: `Requested payment of ${amountUtils.formatSats(amount)} SATS. Use the Fedi app to complete this request.`, // TODO: i18n?
            paymentId,
            status: 'requested',
            recipientId: matrixAuth.userId,
            amount: msats,
            federationId,
        })
    },
)

export const claimMatrixPayment = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; event: MatrixPaymentEvent },
    { state: CommonState }
>('matrix/claimMatrixPayment', async ({ fedimint, event }, { getState }) => {
    const client = fedimint.getMatrixClient()
    const matrixAuth = selectMatrixAuth(getState())
    if (!matrixAuth) throw new Error('Not authenticated')

    const { ecash, federationId } = event.content
    if (!ecash) throw new Error('Payment message is missing ecash token')
    if (!federationId)
        throw new Error('Payment message is missing federationId')

    const frontendMetadata = {
        recipientMatrixId: matrixAuth.userId,
        senderMatrixId: event.content.senderId || null,
        initialNotes: null,
    } satisfies FrontendMetadata

    // receive the ecash and get the receiver operation ID
    const [, receiverOperationId] = await fedimint.receiveEcash(
        ecash,
        federationId,
        frontendMetadata,
    )

    // send back the same payment event with updated status
    // old clients will ignore receiverOperationId, new clients will use it
    await client.sendMessage(event.roomId, {
        ...event.content,
        body: 'Payment received.', // TODO: i18n?
        status: 'received',
        receiverOperationId, // will be undefined for old clients, which is fine
    })

    await client.markRoomAsUnread(event.roomId, true)
})

export const tryReclaimMatrixPayment = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; event: MatrixPaymentEvent },
    { state: CommonState }
>(
    'matrix/tryReclaimMatrixPayment',
    async ({ fedimint, event }, { dispatch }) => {
        if (
            !event.content.ecash ||
            !event.content.federationId ||
            !event.content.senderOperationId ||
            event.content.status !== 'rejected'
        )
            return

        const transaction = await fedimint.getTransaction(
            event.content.federationId,
            event.content.senderOperationId,
        )

        if (
            !transaction ||
            transaction.kind !== 'oobSend' ||
            transaction.state?.type !== 'created'
        ) {
            log.info(
                `Skip reclaiming rejected matrix payment with operation ID ${event.content.senderOperationId}: already in "${transaction.state?.type}" state`,
            )
            return
        }

        log.info(
            'Reclaiming rejected payment with operation ID:',
            event.content.senderOperationId,
        )

        dispatch(cancelEcash({ fedimint, ecash: event.content.ecash }))
    },
)

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
        if (!myId) return

        // if we have a roomId, check only that room's timeline
        // otherwise check all loaded timelines for receivable payments
        // note: timelines are only loaded when clicking into a chat so this
        // isn't as bad on performance as it might seem
        const timeline = roomId
            ? state.matrix.roomTimelines[roomId]
            : // flattens all timelines into 1 array
              Object.values(state.matrix.roomTimelines).reduce<
                  (MatrixEvent | null)[]
              >((result, t) => {
                  if (!t) return result
                  return [...result, ...t]
              }, [])

        if (!timeline) return

        const walletFederations = selectLoadedFederations(state)
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

            // Remove the `ecash` field from the event before logging, to respect user privacy
            const eventToLog = {
                ...event,
                content: { ...event.content, ecash: undefined },
            }

            log.info(
                'Unclaimed matrix payment event detected, attempting to claim',
                eventToLog,
            )

            dispatch(claimMatrixPayment({ fedimint, event }))
                .unwrap()
                .then(() => {
                    log.info('Successfully claimed matrix payment', eventToLog)
                })
                .catch(err => {
                    log.warn(
                        'Failed to claim matrix payment, will try again later',
                        err,
                    )
                    // if claim fails, free up this payment ID to retry later
                    receivedPayments.delete(event.content.paymentId)
                })
        })

        const reclaimablePayments = getReclaimablePaymentEvents(
            timeline,
            myId,
            walletFederations,
        )
        log.info(
            `Found ${reclaimablePayments.length} potentially-reclaimable payments`,
        )

        reclaimablePayments.forEach(event => {
            if (receivedPayments.has(event.content.paymentId)) return
            receivedPayments.add(event.content.paymentId)
            // Remove the `ecash` field from the event before logging, to respect user privacy
            const eventToLog = {
                ...event,
                content: { ...event.content, ecash: undefined },
            }

            log.info(
                'Rejected matrix payment event detected, attempting to reclaim',
                eventToLog,
            )

            dispatch(tryReclaimMatrixPayment({ fedimint, event }))
                .unwrap()
                .then(() =>
                    log.info(
                        'Successfully reclaimed matrix payment',
                        eventToLog,
                    ),
                )
                .catch(err => {
                    log.warn(
                        'Failed to reclaim matrix payment, will try again later',
                        err,
                    )
                    // if claim fails, free up this payment ID to retry later
                    receivedPayments.delete(event.content.paymentId)
                })
        })
    },
)

export const cancelMatrixPayment = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; event: MatrixPaymentEvent }
>('matrix/cancelMatrixPayment', async ({ fedimint, event }) => {
    const client = fedimint.getMatrixClient()

    if (event.content.ecash && event.content.federationId) {
        await fedimint.cancelEcash(
            event.content.ecash,
            event.content.federationId,
        )
    }

    await client.sendMessage(event.roomId, {
        ...event.content,
        body: 'Payment canceled.', // TODO: i18n?
        status: 'canceled',
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

        if (event.content.status !== 'requested') {
            throw new Error('Can only accept payment requests')
        }

        const { amount, federationId, recipientId } = event.content
        if (!federationId) throw new Error('Payment missing federationId')
        if (!amount) throw new Error('Payment request missing amount')

        const federationMeta =
            selectLoadedFederation(getState(), federationId)?.meta ?? {}
        const includeInvite = shouldShowInviteCode(federationMeta)

        const msats = amount as MSats

        const frontendMetadata = {
            recipientMatrixId: recipientId || null,
            senderMatrixId: matrixAuth.userId,
            initialNotes: '',
        } satisfies FrontendMetadata

        const { ecash, operationId: senderOperationId } =
            await fedimint.generateEcash(
                msats,
                federationId,
                includeInvite,
                frontendMetadata,
            )

        const client = fedimint.getMatrixClient()

        // send the payment as accepted (not pushed)
        await client.sendMessage(event.roomId, {
            ...event.content,
            body: `Sent payment of ${amountUtils.formatSats(
                amountUtils.msatToSat(msats),
            )} SATS.`, // TODO: i18n?
            status: 'accepted',
            senderId: matrixAuth.userId,
            senderOperationId,
            ecash,
        })
    },
)

export const rejectMatrixPaymentRequest = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; event: MatrixPaymentEvent }
>('matrix/rejectMatrixPaymentRequest', async ({ fedimint, event }) => {
    const client = fedimint.getMatrixClient()
    await client.sendMessage(event.roomId, {
        ...event.content,
        body: 'Payment request rejected.', // TODO: i18n?
        status: 'rejected',
    })
})

export const checkBolt11PaymentResult = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; event: MatrixPaymentEvent },
    { state: CommonState }
>(
    'matrix/checkBolt11PaymentResult',
    async ({ fedimint, event }, { getState }) => {
        try {
            log.info(
                'calling checkBolt11PaymentResult for',
                JSON.stringify(event.content),
            )
            const matrixAuth = selectMatrixAuth(getState())
            if (!matrixAuth) throw new Error('Not authenticated')

            const client = fedimint.getMatrixClient()
            if (!event.content.bolt11) return
            // if request is canceled, rejected, or received, we can skip this check
            if (event.content.status !== 'requested') return
            // Only the sender will get a completed result from the RPC
            if (event.sender !== matrixAuth?.userId) return

            const lastUsedFederation = selectLastUsedFederation(getState())
            if (!lastUsedFederation) return
            const result = await fedimint.getPrevPayInvoiceResult(
                event.content.bolt11,
                lastUsedFederation.id,
            )
            log.info(
                `bolt11 payment result for ${event.content.bolt11}: `,
                result,
            )
            if (result.completed) {
                await client.sendMessage(event.roomId, {
                    ...event.content,
                    body: `Payment successful.`, // TODO: i18n?
                    status: 'received',
                    senderId: matrixAuth.userId,
                })
            }
        } catch (error) {
            log.error('checkBolt11PaymentResult', error)
        }
    },
)

export const searchMatrixUsers = createAsyncThunk<
    MatrixSearchResults,
    { fedimint: FedimintBridge; query: string }
>('matrix/searchMatrixUsers', async ({ fedimint, query }) => {
    const client = fedimint.getMatrixClient()
    return client.userDirectorySearch(query)
})

export const fetchMatrixProfile = createAsyncThunk<
    MatrixUser,
    { fedimint: FedimintBridge; userId: string }
>('matrix/fetchMatrixProfile', async ({ fedimint, userId }) => {
    try {
        const client = fedimint.getMatrixClient()
        return await client.fetchMatrixProfile(userId)
    } catch (err) {
        log.warn('fetchMatrixProfile failed', userId, err)
        throw err
    }
})

export const getMatrixRoomPreview = createAsyncThunk<
    MatrixGroupPreview,
    { fedimint: FedimintBridge; roomId: string }
>('matrix/getMatrixRoomPreview', async ({ fedimint, roomId }) => {
    const client = fedimint.getMatrixClient()
    return client.getRoomPreview(roomId)
})

export const refetchMatrixRoomMembers = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; roomId: string }
>('matrix/refetchRoomMembers', async ({ fedimint, roomId }) => {
    const client = fedimint.getMatrixClient()
    return client.refetchRoomMembers(roomId)
})

export const refetchMatrixRoomList = createAsyncThunk<
    void,
    { fedimint: FedimintBridge }
>('matrix/refetchRoomList', async ({ fedimint }) => {
    const client = fedimint.getMatrixClient()
    return client.refetchRoomList()
})

export const paginateMatrixRoomTimeline = createAsyncThunk<
    null,
    { fedimint: FedimintBridge; roomId: MatrixRoom['id']; limit?: number },
    { state: CommonState }
>(
    'matrix/paginateMatrixRoomTimeline',
    ({ fedimint, roomId, limit = 30 }, { getState }) => {
        const numEvents = getState().matrix.roomTimelines[roomId]?.length || 0
        const client = fedimint.getMatrixClient()
        return client.paginateTimeline(roomId, numEvents + limit)
    },
)

export const sendMatrixReadReceipt = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        roomId: MatrixRoom['id']
        eventId: MatrixEvent['id']
    }
>(
    'matrix/sendMatrixEventReadReceipt',
    async ({ fedimint, roomId, eventId }) => {
        const client = fedimint.getMatrixClient()
        await client.sendReadReceipt(roomId, eventId)
        await client.markRoomAsUnread(roomId, false)
    },
)

export const configureMatrixPushNotifications = createAsyncThunk<
    string,
    { fedimint: FedimintBridge; token: string; appId: string; appName: string }
>(
    'matrix/configureMatrixPushNotifications',
    async ({ fedimint, token, appId, appName }) => {
        const client = fedimint.getMatrixClient()
        if (!client.hasStarted) return token

        await client.configureNotificationsPusher(token, appId, appName)
        return token
    },
)

export const updateMatrixRoomNotificationMode = createAsyncThunk<
    RpcRoomNotificationMode,
    {
        fedimint: FedimintBridge
        roomId: MatrixRoom['id']
        mode: RpcRoomNotificationMode
    }
>(
    'matrix/updateMatrixRoomNotificationMode',
    async ({ fedimint, roomId, mode }) => {
        const client = fedimint.getMatrixClient()
        await client.setRoomNotificationMode(roomId, mode)
        return mode
    },
)

export const ignoreUser = createAsyncThunk<
    boolean,
    {
        fedimint: FedimintBridge
        userId: MatrixUser['id']
        roomId?: MatrixRoom['id']
    }
>('matrix/ignoreUser', async ({ fedimint, userId }) => {
    const client = fedimint.getMatrixClient()
    await client.ignoreUser(userId)

    // TODO: make the ignored list observable to avoid the need
    // to refetch manually. (this is kinda racy)
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Refresh the list of ignored users
    await client.listIgnoredUsers()
    return true
})

export const unignoreUser = createAsyncThunk<
    boolean,
    {
        fedimint: FedimintBridge
        userId: MatrixUser['id']
        roomId?: MatrixRoom['id']
    }
>('matrix/unignoreUser', async ({ fedimint, userId }) => {
    const client = fedimint.getMatrixClient()
    await client.unignoreUser(userId)

    // TODO: make the ignored list observable to avoid the need
    // to refetch manually. (this is kinda racy)
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Refresh the list of ignored users
    await client.listIgnoredUsers()
    return false
})

export const fetchMultispendEvents = createAsyncThunk<
    Promise<MultispendListedEvent[] | undefined>,
    {
        fedimint: FedimintBridge
        roomId: MatrixRoom['id']
        limit?: number
        more?: boolean
        refresh?: boolean
    },
    { state: CommonState }
>(
    'matrix/fetchMultispendEvents',
    async (
        { fedimint, roomId, refresh = false, limit = 100, more = false },
        { getState },
    ) => {
        const state = getState()
        const client = fedimint.getMatrixClient()
        if (refresh) {
            const txns = selectRoomMultispendFinancialEvents(state, roomId)
            // when refreshing:
            // - always use startAfter: null for fresh results. use { more: true } for pagination
            // - limit should be at least 100 or the # of fetched txns (if we have already paginated)
            // - refreshing will ignore limit param if passed to the thunk
            return client.fetchMultispendTransactions({
                roomId,
                startAfter: null,
                limit: Math.max(100, txns.length + 1),
            })
        } else if (more) {
            // when fetching more, find the latest txn (txn with highest counter field)
            const latestRoomTxn = selectLatestMultispendTxnInRoom(state, roomId)
            const startAfter = latestRoomTxn ? latestRoomTxn.counter : null
            return client.fetchMultispendTransactions({
                roomId,
                startAfter,
                limit,
            })
        } else {
            return client.fetchMultispendTransactions({
                roomId,
                startAfter: null,
                limit,
            })
        }
    },
)

export const listIgnoredUsers = createAsyncThunk<
    string[],
    { fedimint: FedimintBridge }
>('matrix/listIgnoredUsers', async ({ fedimint }) => {
    const client = fedimint.getMatrixClient()
    return client.listIgnoredUsers()
})

export const kickUser = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        roomId: MatrixRoom['id']
        userId: MatrixRoomMember['id']
        reason?: string
    }
>('matrix/kickUser', async ({ fedimint, roomId, userId, reason }) => {
    const client = fedimint.getMatrixClient()
    await client.roomKickUser(roomId, userId, reason)
})

export const banUser = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        roomId: MatrixRoom['id']
        userId: MatrixRoomMember['id']
        reason?: string
    }
>('matrix/banUser', async ({ fedimint, roomId, userId, reason }) => {
    const client = fedimint.getMatrixClient()
    await client.roomBanUser(roomId, userId, reason)
})

export const unbanUser = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        roomId: MatrixRoom['id']
        userId: MatrixRoomMember['id']
        reason?: string
    }
>('matrix/unbanUser', async ({ fedimint, roomId, userId, reason }) => {
    const client = fedimint.getMatrixClient()
    await client.roomUnbanUser(roomId, userId, reason)
})

export const previewCommunityDefaultChats = createAsyncThunk<
    MatrixGroupPreview[],
    { fedimint: FedimintBridge; communityId: string },
    { state: CommonState }
>(
    'matrix/previewCommunityDefaultChats',
    async ({ fedimint, communityId }, { getState }) => {
        const client = fedimint.getMatrixClient()
        // can't fetch preview until after matrix init + registration
        if (!selectMatrixAuth(getState())) return []
        const community = selectCommunity(getState(), communityId)
        // can't fetch preview if the community is not loaded yet
        if (!community) return []
        const defaultChats = getDefaultGroupChats(community.meta)
        log.info(
            `Found ${defaultChats.length} default groups for community ${community.name}...`,
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
    },
)

export const previewFederationDefaultChats = createAsyncThunk<
    MatrixGroupPreview[],
    { fedimint: FedimintBridge; federationId: string },
    { state: CommonState }
>(
    'matrix/previewFederationDefaultChats',
    async ({ fedimint, federationId }, { getState }) => {
        const client = fedimint.getMatrixClient()
        // can't fetch preview until after matrix init + registration
        if (!selectMatrixAuth(getState())) return []
        const federation = selectLoadedFederation(getState(), federationId)
        // can't fetch preview if the federation is not loaded yet
        if (!federation) return []
        const defaultChats = getDefaultGroupChats(federation.meta)
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
    },
)

/**
 * Fetches the room previews for any default chats configured in the meta
 * of any commmunities andfederations that have been loaded
 */
export const previewAllDefaultChats = createAsyncThunk<
    MatrixGroupPreview[],
    { fedimint: FedimintBridge },
    { state: CommonState }
>(
    'matrix/previewAllDefaultChats',
    async ({ fedimint }, { getState, dispatch }) => {
        log.debug('previewAllDefaultChats')
        const federations = selectLoadedFederations(getState())
        const communities = selectCommunities(getState())
        // Previews default chats for each federation
        const federationDefaultChatResults = await Promise.allSettled(
            // For each federation, return a promise that that resolves to
            // the result of the dispatched previewCommunityDefaultChats action
            federations.map(f => {
                log.debug('calling previewFederationDefaultChats for', f.id)
                return dispatch(
                    previewFederationDefaultChats({
                        fedimint,
                        federationId: f.id,
                    }),
                ).unwrap()
            }),
        )
        // Previews default chats for each community
        const communityDefaultChatResults = await Promise.allSettled(
            // For each community, return a promise that that resolves to
            // the result of the dispatched previewCommunityDefaultChats action
            communities.map(c => {
                log.debug('calling previewCommunityDefaultChats for', c.id)
                return dispatch(
                    previewCommunityDefaultChats({
                        fedimint,
                        communityId: c.id,
                    }),
                ).unwrap()
            }),
        )
        // Collect each federation & community's default chats list and flatten
        // them into a single array of roomPreviews
        const federationChats = federationDefaultChatResults.flatMap(preview =>
            preview.status === 'fulfilled' ? preview.value : [],
        )
        const communityChats = communityDefaultChatResults.flatMap(preview =>
            preview.status === 'fulfilled' ? preview.value : [],
        )
        return [...federationChats, ...communityChats]
    },
)

export const observeMatrixSyncStatus = createAsyncThunk<
    void,
    { fedimint: FedimintBridge }
>('matrix/observeMatrixSyncStatus', async ({ fedimint }) => {
    const client = fedimint.getMatrixClient()
    client.observeSyncStatus()
})

export const unsubscribeMatrixSyncStatus = createAsyncThunk<
    void,
    { fedimint: FedimintBridge }
>('matrix/unsubscribeMatrixSyncStatus', async ({ fedimint }) => {
    const client = fedimint.getMatrixClient()
    client.unsubscribeSyncStatus()
})

/*** Selectors ***/

export const selectMatrixStatus = (s: CommonState) => s.matrix.status

export const selectIsMatrixReady = createSelector(
    selectMatrixStatus,
    status => status === MatrixSyncStatus.synced,
)

export const selectMatrixPushNotificationToken = (
    s: CommonState,
): string | null => s.matrix.pushNotificationToken

/**
 * Returns a list of matrix rooms, excluding any that are loading or missing room information.
 * TODO: Alternate selector that includes loading rooms, or refactor all to handle loading rooms?
 */
export const selectMatrixRooms = createSelector(
    (s: CommonState) => s.matrix.roomList,
    (s: CommonState) => s.matrix.roomInfo,
    (s: CommonState) => s.matrix.roomPowerLevels,
    (s: CommonState) => s.matrix.ignoredUsers,
    (roomList, roomInfo, roomPowerLevels, ignoredUsers): MatrixRoom[] => {
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
                          'unableToDecrypt',
                      ]) >= MatrixPowerLevel.Moderator
                    : false,
                isBlocked: room.directUserId
                    ? ignoredUsers.includes(room.directUserId)
                    : false,
            })
        }
        return rooms
    },
)

export const selectGroupPreviews = (s: CommonState) => s.matrix.groupPreviews

// Returns a processed & sorted list of default chats for
// use in the chats list
const selectDefaultChatsForChatList = createSelector(
    selectMatrixRooms,
    selectGroupPreviews,
    (roomsList, defaultGroupPreviews) => {
        // Here we add preview rooms from the default groups list to be
        // displayed alongside the user's joined rooms to make it seem like
        // the user has joined these rooms when really they are just public previews
        // TODO: These should be moved to the Community screen and only shown
        // when the user switches to view that community
        const defaultGroupsList = Object.entries(defaultGroupPreviews).reduce<
            MatrixRoom[]
        >((result, [_, preview]: [RpcRoomId, MatrixGroupPreview]) => {
            const { info, timeline } = preview
            // don't include previews if we don't have info and timeline
            if (!info || !timeline) return result
            // don't include previews unless they are default groups
            if (!preview.isDefaultGroup) return result
            // don't include previews that have no messages in the timeline
            if (timeline.filter(t => t !== null).length === 0) return result
            // don't include previews for rooms we are already joined to
            if (roomsList.find(r => r.id === info.id)) return result
            result.push(makeChatFromUnjoinedRoomPreview(preview))
            return result
        }, [])
        // Sorts so merging with the joined rooms list is more efficient
        return orderBy(
            defaultGroupsList,
            room => room.preview?.timestamp ?? 0,
            'desc',
        )
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

export const selectMatrixDisplayNameSuffix = createSelector(
    (s: CommonState) => s.matrix.auth,
    auth => (auth ? getUserSuffix(auth.userId) : ''),
)

export const selectMatrixUsers = (s: CommonState) => s.matrix.users

export const selectMatrixUser = (s: CommonState, userId: MatrixUser['id']) =>
    s.matrix.users[userId]

export const selectMatrixChatsWithoutDefaultGroupPreviewsList = createSelector(
    selectMatrixRooms,
    (roomsList): MatrixRoom[] => {
        const joined = roomsList.filter(r => r.roomState === 'joined')
        return orderBy(
            joined,
            room => room.recencyStamp ?? Number.MAX_SAFE_INTEGER,
            'desc',
        )
    },
)

export const selectMatrixChatsList = createSelector(
    selectMatrixRooms,
    selectDefaultChatsForChatList,
    (roomsList, defaultGroupsList): MatrixRoom[] => {
        // don't include rooms that we have not joined yet this should happen
        // automatically but we filter here anyway in case the join fails for some reason
        const filteredRoomsList = roomsList.filter(
            r => r.roomState === 'joined',
        )
        // Sort by most-recent activity first using recencyStamp from the SDK.
        // recencyStamp applies uniformly to all room types (DMs, private
        // groups, public groups). Rooms with no recencyStamp yet use
        // MAX_SAFE_INTEGER so they float to the top of the list.
        const joinedRoomsList = orderBy(
            filteredRoomsList,
            room => room.recencyStamp ?? Number.MAX_SAFE_INTEGER,
            'desc',
        )

        const chatList: MatrixRoom[] = []
        let i = 0 // joinedRoomsList index
        let j = 0 // defaultGroupsList index

        // Merge the two sorted lists in linear time
        while (i < joinedRoomsList.length && j < defaultGroupsList.length) {
            const joinedRoom = joinedRoomsList[i]
            const defaultRoom = defaultGroupsList[j]

            // If a joined room doesn't have a recencyStamp yet, order it
            // before default groups.
            // Default groups use recencyStamp with 0 fallback so they
            // appear below active user rooms.
            const joinedStamp =
                joinedRoom.recencyStamp ?? Number.MAX_SAFE_INTEGER
            const defaultStamp = defaultRoom.recencyStamp ?? 0

            // insert each default room just before the first room with
            // a newer (larger) stamp
            if (joinedStamp >= defaultStamp) {
                chatList.push(joinedRoom)
                i++
            } else {
                chatList.push(defaultRoom)
                j++
            }
        }

        // Add remaining items from either list
        chatList.push(
            ...joinedRoomsList.slice(i),
            ...defaultGroupsList.slice(j),
        )

        return chatList
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

export const selectMatrixRoomMultispendStatus = (
    s: CommonState,
    roomId: MatrixRoom['id'],
) => s.matrix.roomMultispendStatus[roomId]

export const selectMatrixRoomMembers = createSelector(
    (s: CommonState) => s.matrix.roomMembers,
    (_: CommonState, roomId: MatrixRoom['id']) => roomId,
    (roomMembers, roomId) => roomMembers[roomId] || ([] as MatrixRoomMember[]),
)

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
        members.reduce(
            (acc, member) => {
                acc[member.id] = member
                return acc
            },
            {} as Record<MatrixRoomMember['id'], MatrixRoomMember | undefined>,
        ),
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
        const allEvents = timeline.filter((item): item is MatrixEvent => {
            return item !== null
        })

        const filteredEvents = filterMultispendEvents(allEvents)

        const events = consolidatePaymentEvents(filteredEvents)

        return events
    },
)

export const selectRoomTextEvents = createSelector(
    selectMatrixRoomEvents,
    events => events.filter(event => isTextEvent(event)),
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
        return member?.powerLevel
    },
)

export const selectMatrixRoomIsReadOnly = createSelector(
    selectMatrixRoomPowerLevels,
    selectMatrixRoomSelfPowerLevel,
    (roomPowerLevels, selfPowerLevel) => {
        if (!roomPowerLevels) return false
        if (!selfPowerLevel) return true
        const requiredLevel = getRoomEventPowerLevel(roomPowerLevels, [
            'm.room.message',
            'unableToDecrypt',
        ])
        return !isPowerLevelGreaterOrEqual(selfPowerLevel, requiredLevel)
    },
)

export const selectMatrixDirectMessageRoom = createSelector(
    (_: CommonState, userId: string) => userId,
    selectMatrixRooms,
    (userId, rooms) => rooms.find(room => room.directUserId === userId),
)

export const selectCanReply = createSelector(
    selectMatrixAuth,
    selectMatrixRoom,
    selectMatrixRoomIsReadOnly,
    (auth, room, isReadOnly) => {
        if (!auth) return false
        return room?.roomState === 'joined' && !isReadOnly
    },
)

const selectMatrixIgnoredUsers = (s: CommonState) => s.matrix.ignoredUsers

export const selectMatrixUserIsIgnored = createSelector(
    selectMatrixIgnoredUsers,
    (_: CommonState, userId: string) => userId,
    (ignoredUsers, userId) => ignoredUsers.includes(userId),
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
 * The contact list is composed of all users we have direct chats with
 */
export const selectMatrixContactsList = createSelector(
    selectMatrixRooms,
    (s: CommonState) => s.matrix.roomMembers,
    (rooms, roomMembers) => {
        const directChatUsers: MatrixRoomMember[] = []
        for (const room of rooms) {
            // Only grab users from direct chats
            const { directUserId } = room
            if (!directUserId) continue
            if (directChatUsers.some(u => u.id === directUserId)) continue
            const user = roomMembers[room.id]?.find(m => m.id === directUserId)
            if (!user) continue
            directChatUsers.push(user)
        }
        return directChatUsers
    },
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
): MatrixEvent['id'] | undefined => {
    const timeline = s.matrix.roomTimelines[roomId]
    if (timeline) {
        for (let i = timeline?.length - 1; i >= 0; i--) {
            const item = timeline[i]
            if (!item) continue
            const { id } = item
            if (!id) continue
            return id
        }
    }
}

export const selectCanPayFromOtherFeds = createSelector(
    (s: CommonState) => selectLoadedFederations(s),
    (s: CommonState, chatPayment: MatrixPaymentEvent) => chatPayment,
    (federations, chatPayment): boolean => {
        return !!federations.find(
            f => f.balance && f.balance > chatPayment.content.amount,
        )
    },
)

export const selectCanSendPayment = createSelector(
    (s: CommonState) => selectLoadedFederations(s),
    (s: CommonState, chatPayment: MatrixPaymentEvent) => chatPayment,
    (federations, chatPayment): boolean => {
        return !!federations.find(
            f =>
                f.id === chatPayment.content.federationId &&
                f.balance &&
                f.balance > chatPayment.content.amount,
        )
    },
)

export const selectCanClaimPayment = createSelector(
    (s: CommonState) => selectLoadedFederations(s),
    (s: CommonState, chatPayment: MatrixPaymentEvent) => chatPayment,
    (federations, chatPayment): boolean => {
        return !!federations.find(
            f => f.id === chatPayment.content.federationId,
        )
    },
)

export const selectCommunityDefaultRoomIds = createSelector(
    (s: CommonState, federationId: string) =>
        selectLoadedFederation(s, federationId),
    federation => {
        if (!federation) return []
        return getDefaultGroupChats(federation.meta)
    },
)

export const selectDefaultMatrixRoomIds = createSelector(
    (s: CommonState) => selectLoadedFederations(s),
    (s: CommonState) => selectGlobalCommunityMetadata(s),
    (federations, globalCommunityMeta) => {
        let defaultMatrixRoomIds: MatrixRoom['id'][] = federations.reduce(
            (result: MatrixRoom['id'][], f: Federation) => {
                const defaultRoomIds = getDefaultGroupChats(f.meta || {})
                return [...result, ...defaultRoomIds]
            },
            [],
        )
        // Also check the Fedi Global community for default groups
        if (globalCommunityMeta) {
            const defaultGlobalRoomIds =
                getDefaultGroupChats(globalCommunityMeta)
            defaultMatrixRoomIds = [
                ...defaultMatrixRoomIds,
                ...defaultGlobalRoomIds,
            ]
        }
        return defaultMatrixRoomIds
    },
)

export const selectIsDefaultGroup = (s: CommonState, id: string) =>
    selectDefaultMatrixRoomIds(s).includes(id)

export const selectMatrixRoomIsBlocked = (
    s: CommonState,
    id: MatrixRoom['id'],
) => selectMatrixRoom(s, id)?.isBlocked

export const selectMatrixRoomPaginationStatus = (
    s: CommonState,
    roomId: MatrixRoom['id'],
) => s.matrix.roomPaginationStatus[roomId]

export const selectChatDrafts = (s: CommonState) => s.matrix.drafts
export const selectSelectedChatMessage = (s: CommonState) =>
    s.matrix.selectedChatMessage
export const selectMessageToEdit = (s: CommonState) => s.matrix.messageToEdit
export const selectMatrixStarted = (s: CommonState) => s.matrix.started
export const selectPreviewMedia = (s: CommonState) => s.matrix.previewMedia

// Find a preview media item matching a specific ChatVideoEvent or ChatImageEvent
export const selectPreviewMediaMatchingEventContent = (
    s: CommonState,
    content: MatrixEventContentType<'m.video' | 'm.image'>,
) =>
    s.matrix.previewMedia.find(({ media }) =>
        doesEventContentMatchPreviewMedia(media, content),
    )

export const selectMyMultispendRole = (
    s: CommonState,
    roomId: string,
): MultispendRole | null => {
    const multispendStatus = selectMatrixRoomMultispendStatus(s, roomId)
    const myId = selectMatrixAuth(s)?.userId

    if (!myId || !multispendStatus) return null

    return getMultispendRole(multispendStatus, myId)
}

export const selectMultispendRole = (
    s: CommonState,
    roomId: string,
    userId: string,
): MultispendRole | null => {
    const multispendStatus = selectMatrixRoomMultispendStatus(s, roomId)

    if (!userId || !multispendStatus) return null

    return getMultispendRole(multispendStatus, userId)
}

export const selectMultispendInvite = (
    s: CommonState,
    roomId: string,
): GroupInvitation | null => {
    const multispendStatus = selectMatrixRoomMultispendStatus(s, roomId)
    if (!multispendStatus) return null
    return getMultispendInvite(multispendStatus)
}

export const selectMatrixRoomMultispendAccountInfo = (
    s: CommonState,
    roomId: string,
) => {
    return s.matrix.roomMultispendAccountInfo[roomId]
}

export const selectMatrixRoomMultispendEvents = (
    s: CommonState,
    roomId: string,
) => {
    return s.matrix.roomMultispendEvents[roomId] || []
}

export const selectRoomMultispendFinancialEvents = createSelector(
    selectMatrixRoomMultispendEvents,
    transactions => transactions.filter(isMultispendFinancialEvent),
)

export const selectLatestMultispendTxnInRoom = createSelector(
    selectRoomMultispendFinancialEvents,
    transactions => {
        // unintuitively, the latest txn is the one with the lowest counter
        const latestTxn = transactions.reduce((latest, current) => {
            return latest.counter < current.counter ? latest : current
        }, transactions[0])
        return latestTxn
    },
)

// Returns the multispend balance in cents without any rounding
// so other selectors can round sub-cent values up or down as needed
export const selectMultispendBalance = createSelector(
    selectMatrixRoomMultispendAccountInfo,
    accountInfo => {
        if (!accountInfo || 'Err' in accountInfo) return 0 as UsdCents

        const { lockedBalance, currCycleStartPrice } = accountInfo.Ok

        const balanceMsats = lockedBalance
        const balanceBtc = amountUtils.msatToBtc(balanceMsats)
        const balanceCentsPrecise = balanceBtc * currCycleStartPrice

        return balanceCentsPrecise
    },
)

export const selectMultispendBalanceCents = createSelector(
    selectMultispendBalance,
    balanceCentsPrecise => {
        if (!balanceCentsPrecise) return 0 as UsdCents

        return Number(balanceCentsPrecise.toFixed(0)) as UsdCents
    },
)

export const selectMultispendBalanceSats = createSelector(
    selectMultispendBalanceCents,
    (s: CommonState) => selectBtcUsdExchangeRate(s),
    (balanceCents, btcUsdExchangeRate) => {
        const balanceDollars = balanceCents / 100
        return amountUtils.fiatToSat(balanceDollars, btcUsdExchangeRate)
    },
)

export const selectMatrixRoomMultispendWithdrawalRequests = createSelector(
    selectRoomMultispendFinancialEvents,
    events => {
        return events.filter(isMultispendWithdrawalEvent)
    },
)

export const selectMatrixRoomMultispendEvent = (
    s: CommonState,
    roomId: string,
    eventId: string,
) => {
    if (!s.matrix.roomMultispendEvents[roomId]) return null
    return (
        s.matrix.roomMultispendEvents[roomId].find(
            e => e.eventId === eventId,
        ) ?? null
    )
}

export const selectMultispendInvitationEvents = createSelector(
    selectMatrixRoomMultispendEvents,
    events => events.filter(isMultispendInvitation),
)

export const selectMultispendInvitationEvent = createSelector(
    selectMultispendInvitationEvents,
    (_: CommonState, _roomId: string, eventId: string) => eventId,
    (events, eventId) => events.find(e => e.eventId === eventId) ?? undefined,
)

export const selectChatReplyingToMessage = (s: CommonState) =>
    s.matrix.replyingToMessage

// Returns the reply event *only* if it belongs to the given room.
export const selectReplyingToMessageEventForRoom = (
    s: CommonState,
    roomId: MatrixRoom['id'],
) =>
    s.matrix.replyingToMessage.roomId === roomId
        ? s.matrix.replyingToMessage.event
        : null
export const selectTempMediaUriMap = (s: CommonState) =>
    s.matrix.tempMediaUriMap
