import {
    PayloadAction,
    createAsyncThunk,
    createSelector,
    createSlice,
    isAnyOf,
} from '@reduxjs/toolkit'
import isEqual from 'lodash/isEqual'
import orderBy from 'lodash/orderBy'
import uniq from 'lodash/uniq'

import {
    CommonState,
    selectActiveFederation,
    selectFederationMetadata,
} from '.'
import {
    Chat,
    ChatGroup,
    ChatMember,
    ChatMessage,
    ChatPayment,
    ChatPaymentStatus,
    ChatType,
    ChatWithLatestMessage,
    Federation,
    Keypair,
    XmppClientStatus,
} from '../types'
import {
    getFederationChatServerDomain,
    getFederationGroupChats,
    makeChatServerOptions,
} from '../utils/FederationUtils'
import {
    getChatInfoFromMessage,
    getLatestMessage,
    makePaymentUpdatedAt,
} from '../utils/chat'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import { loadFromStorage } from './storage'

type FederationPayloadAction<T = object> = PayloadAction<
    { federationId: string } & T
>

const log = makeLog('redux/chat')

/** @deprecated XMPP legacy code */
const MAX_MESSAGE_HISTORY = 1000

/*** Initial State ***/

/** @deprecated XMPP legacy code */
const initialFederationChatState = {
    clientStatus: 'offline' as XmppClientStatus,
    clientLastOnlineAt: 0,
    clientError: null as string | null,
    authenticatedMember: null as ChatMember | null,
    messages: [] as ChatMessage[],
    groups: [] as ChatGroup[],
    groupRoles: {} as Record<Chat['id'], string | undefined>,
    groupAffiliations: {} as Record<Chat['id'], string | undefined>,
    membersSeen: [] as ChatMember[],
    lastFetchedMessageId: null as string | null,
    lastReadMessageTimestamps: {} as Record<Chat['id'], number | undefined>,
    lastSeenMessageTimestamp: null as number | null,
    encryptionKeys: null as Keypair | null,
    pushNotificationToken: null as string | null,
    websocketIsHealthy: false as boolean,
}
/** @deprecated XMPP legacy code */
type FederationChatState = typeof initialFederationChatState

// All chat state is keyed by federation id to keep federation chats separate, so it starts as an empty object.
const initialState = {} as Record<
    Federation['id'],
    FederationChatState | undefined
>

/** @deprecated XMPP legacy code */
export type ChatState = typeof initialState

/*** Slice definition ***/

/** @deprecated XMPP legacy code */
const getFederationChatState = (state: ChatState, federationId: string) =>
    state[federationId] || {
        ...initialFederationChatState,
    }

/** @deprecated XMPP legacy code */
const upsertEntityToChatState = <
    K extends 'messages' | 'groups' | 'membersSeen',
    T extends FederationChatState[K][0],
>(
    state: ChatState,
    federationId: string,
    key: K,
    newEntity: T,
    /** Max number of entities to keep in state */
    limit?: number,
    /**
     * A sorting function to call when a new item is added or existing item is
     * modified. Must be in ascending order so that the newest item is at the
     * end of the array, otherwise when combined with `limit`, new items will
     * be removed immediately.
     */
    sort?: (entities: T[]) => T[],
): ChatState => {
    let addToEnd = true
    let wasEqual = false
    const chatState = getFederationChatState(state, federationId)

    // Make a new list of entities with the new one updating the old one. Make
    // note of if we find it (don't need to append) and if it was identical
    // (don't need to update state at all.)
    let entities = chatState[key].map(oldEntity => {
        if (oldEntity.id !== newEntity.id) return oldEntity
        if (oldEntity.id === newEntity.id) {
            addToEnd = false
            const updatedEntity = { ...oldEntity, ...newEntity }
            wasEqual = isEqual(oldEntity, updatedEntity)
            return updatedEntity
        }
    })

    // If we went to update the old entity but found that it was equal to the new entity, we can return state
    // exactly as it was and prevent unnecessary updates.
    if (!addToEnd && wasEqual) {
        return state
    }

    // If we didn't find the old one in the list, add the new one to the end of the list
    if (addToEnd) {
        entities.push(newEntity)
    }

    // If we're given a sort method, sort the list
    if (sort) {
        entities = sort(entities as T[])
    }

    // If there's a limit to the list length, slice off from the front since
    // we just pushed the newest item to the end.
    if (limit && entities.length > limit) {
        entities = entities.slice(-limit)
    }

    // Return updated state
    return {
        ...state,
        [federationId]: {
            ...chatState,
            [key]: entities,
        },
    }
}

/** @deprecated XMPP legacy code */
export const chatSlice = createSlice({
    name: 'chat',
    initialState,
    reducers: {
        setChatClientStatus(
            state,
            action: FederationPayloadAction<{ status: XmppClientStatus }>,
        ) {
            const { federationId, status } = action.payload
            const chatState = getFederationChatState(state, federationId)
            const oldStatus = chatState.clientStatus
            state[federationId] = {
                ...chatState,
                clientStatus: status,
                // Reset error on successful connection
                clientError: status === 'online' ? null : chatState.clientError,
                // Update the last online time if we're transitioning out of online
                clientLastOnlineAt:
                    status !== 'online' && oldStatus === 'online'
                        ? Date.now()
                        : chatState.clientLastOnlineAt,
            }
        },
        setChatClientError(
            state,
            action: FederationPayloadAction<{ error: string }>,
        ) {
            const { federationId, error } = action.payload
            state[federationId] = {
                ...getFederationChatState(state, federationId),
                clientError: error,
            }
        },
        setChatMembersSeen(
            state,
            action: FederationPayloadAction<{ membersSeen: ChatMember[] }>,
        ) {
            const { federationId, membersSeen } = action.payload
            state[federationId] = {
                ...getFederationChatState(state, federationId),
                membersSeen: [...membersSeen],
            }
        },
        addChatMemberSeen(
            state,
            action: FederationPayloadAction<{ member: ChatMember }>,
        ) {
            const { federationId, member } = action.payload
            return upsertEntityToChatState(
                state,
                federationId,
                'membersSeen',
                member,
            )
        },
        setChatMessages(
            state,
            action: FederationPayloadAction<{ messages: ChatMessage[] }>,
        ) {
            const { federationId, messages } = action.payload
            const federation = getFederationChatState(state, federationId)
            state[federationId] = {
                ...federation,
                messages,
            }
        },
        addChatMessage(
            state,
            action: FederationPayloadAction<{ message: ChatMessage }>,
        ) {
            const { federationId, message } = action.payload
            return upsertEntityToChatState(
                state,
                federationId,
                'messages',
                message,
                MAX_MESSAGE_HISTORY,
                messages => orderBy(messages, 'sentAt', 'asc'),
            )
        },
        setChatGroups(
            state,
            action: FederationPayloadAction<{ groups: ChatGroup[] }>,
        ) {
            const { federationId, groups } = action.payload
            const federation = getFederationChatState(state, federationId)
            state[federationId] = {
                ...federation,
                groups,
            }
        },
        setChatGroupRole(
            state,
            action: FederationPayloadAction<{ groupId: string; role: string }>,
        ) {
            const { federationId, groupId, role } = action.payload
            const federation = getFederationChatState(state, federationId)
            state[federationId] = {
                ...federation,
                groupRoles: {
                    ...federation.groupRoles,
                    [groupId]: role,
                },
            }
        },
        setChatGroupAffiliation(
            state,
            action: FederationPayloadAction<{
                groupId: string
                affiliation: string
            }>,
        ) {
            const { federationId, groupId, affiliation } = action.payload
            const federation = getFederationChatState(state, federationId)
            state[federationId] = {
                ...federation,
                groupAffiliations: {
                    ...federation.groupAffiliations,
                    [groupId]: affiliation,
                },
            }
        },
        addChatGroup(
            state,
            action: FederationPayloadAction<{ group: ChatGroup }>,
        ) {
            const { federationId, group } = action.payload
            return upsertEntityToChatState(state, federationId, 'groups', group)
        },
        setAuthenticatedMember(
            state,
            action: FederationPayloadAction<{
                authenticatedMember: ChatMember
            }>,
        ) {
            const { federationId, authenticatedMember } = action.payload
            const federation = getFederationChatState(state, federationId)
            state[federationId] = {
                ...federation,
                authenticatedMember,
            }
        },
        setChatEncryptionKeys(
            state,
            action: FederationPayloadAction<{ encryptionKeys: Keypair }>,
        ) {
            const { federationId, encryptionKeys } = action.payload
            const federation = getFederationChatState(state, federationId)
            state[federationId] = {
                ...federation,
                encryptionKeys,
            }
        },
        setLastFetchedMessageId(
            state,
            action: FederationPayloadAction<{
                lastFetchedMessageId: FederationChatState['lastFetchedMessageId']
            }>,
        ) {
            const { federationId, lastFetchedMessageId } = action.payload
            const federation = getFederationChatState(state, federationId)
            state[federationId] = {
                ...federation,
                lastFetchedMessageId,
            }
        },
        setLastReadMessageTimestamp(
            state,
            action: FederationPayloadAction<{
                chatId: string
                timestamp: number
            }>,
        ) {
            const { federationId, chatId, timestamp } = action.payload
            const federation = getFederationChatState(state, federationId)
            let lastSeenMessageTimestamp = federation.lastSeenMessageTimestamp
            if (
                lastSeenMessageTimestamp &&
                timestamp > lastSeenMessageTimestamp
            ) {
                lastSeenMessageTimestamp = timestamp
            }
            state[federationId] = {
                ...federation,
                lastSeenMessageTimestamp,
                lastReadMessageTimestamps: {
                    ...federation.lastReadMessageTimestamps,
                    [chatId]: timestamp,
                },
            }
        },
        setLastSeenMessageTimestamp(
            state,
            action: FederationPayloadAction<{ timestamp: number }>,
        ) {
            const { federationId, timestamp } = action.payload
            const federation = getFederationChatState(state, federationId)
            state[federationId] = {
                ...federation,
                lastSeenMessageTimestamp: timestamp,
            }
        },
        setWebsocketIsHealthy(
            state,
            action: FederationPayloadAction<{ healthy: boolean }>,
        ) {
            const { federationId, healthy } = action.payload
            const chatState = getFederationChatState(state, federationId)
            state[federationId] = {
                ...chatState,
                websocketIsHealthy: healthy,
            }
        },
        resetAuthenticatedMember(state, action: FederationPayloadAction) {
            const { federationId } = action.payload
            const federation = getFederationChatState(state, federationId)
            state[federationId] = {
                ...federation,
                authenticatedMember:
                    initialFederationChatState.authenticatedMember,
                encryptionKeys: initialFederationChatState.encryptionKeys,
            }
        },
        resetFederationChatState(state, action: FederationPayloadAction) {
            state[action.payload.federationId] = {
                ...initialFederationChatState,
            }
        },
        resetChatState() {
            return { ...initialState }
        },
    },
    extraReducers: builder => {
        builder.addCase(loadFromStorage.fulfilled, (state, action) => {
            if (!action.payload) return
            Object.entries(action.payload.chat).forEach(
                ([federationId, chatState]) => {
                    if (!chatState) return
                    const prevChatState = getFederationChatState(
                        state,
                        federationId,
                    )
                    state[federationId] = {
                        ...prevChatState,
                        authenticatedMember: chatState.authenticatedMember,
                        messages: chatState.messages,
                        groups: chatState.groups,
                        groupRoles:
                            chatState.groupRoles || prevChatState.groupRoles,
                        groupAffiliations:
                            chatState.groupAffiliations ||
                            prevChatState.groupAffiliations,
                        membersSeen: chatState.members,
                        lastFetchedMessageId: chatState.lastFetchedMessageId,
                        lastReadMessageTimestamps:
                            chatState.lastReadMessageTimestamps,
                        lastSeenMessageTimestamp:
                            chatState.lastSeenMessageTimestamp,
                    }
                },
            )
        })

        builder.addMatcher(
            isAnyOf(updateChatPayment.fulfilled),
            (state, action) => {
                return upsertEntityToChatState(
                    state,
                    action.meta.arg.federationId,
                    'messages',
                    action.payload,
                )
            },
        )
    },
})

/*** Basic actions ***/

/** @deprecated XMPP legacy code */
export const {
    setChatClientStatus,
    setChatClientError,
    setChatMembersSeen,
    addChatMemberSeen,
    setChatMessages,
    addChatMessage,
    setChatGroups,
    addChatGroup,
    setChatGroupRole,
    setChatGroupAffiliation,
    setAuthenticatedMember,
    setChatEncryptionKeys,
    setLastFetchedMessageId,
    setLastReadMessageTimestamp,
    setLastSeenMessageTimestamp,
    setWebsocketIsHealthy,
    resetAuthenticatedMember,
    resetFederationChatState,
    resetChatState,
} = chatSlice.actions

/*** Async thunk actions ***/

/** @deprecated XMPP legacy code */
export const updateChatPayment = createAsyncThunk<
    ChatMessage,
    {
        fedimint: FedimintBridge
        federationId: string
        messageId: string
        action: 'receive' | 'pay' | 'reject' | 'cancel'
    },
    { state: CommonState }
>(
    'chat/updateChatPayment',
    async ({ fedimint, federationId, messageId, action }, { getState }) => {
        const state = getState()
        const chatState = state.chat[federationId]
        const message = state.chat[federationId]?.messages.find(
            m => m.id === messageId,
        )
        const payment = message?.payment
        if (!message || !payment) throw new Error('errors.chat-payment-failed')

        // Get our identity
        const authenticatedMember = chatState?.authenticatedMember
        if (!authenticatedMember) {
            throw new Error('errors.chat-unavailable')
        }

        // Always send the update to whoever is _not_ us
        let recipientId = message.sentTo
        if (recipientId === authenticatedMember.id) {
            recipientId = message.sentBy
        }
        if (!recipientId) {
            throw new Error('errors.chat-payment-failed')
        }

        // Update payment depending on action
        const paymentUpdates: Partial<ChatPayment> = {
            updatedAt: makePaymentUpdatedAt(payment),
        }
        switch (action) {
            case 'receive': {
                const { token } = payment
                if (!token) throw new Error('errors.chat-payment-failed')

                try {
                    await fedimint.receiveEcash(token, federationId)
                } catch (err) {
                    if (
                        err &&
                        (err as Error).message &&
                        (err as Error).message.includes(
                            'already reissued these notes',
                        )
                    ) {
                        // No-op if we already claimed, just mark it as paid
                    } else {
                        throw err
                    }
                }
                paymentUpdates.token = null
                paymentUpdates.status = ChatPaymentStatus.paid
                break
            }
            case 'reject': {
                paymentUpdates.status = ChatPaymentStatus.rejected
                break
            }
            case 'pay': {
                const { ecash } = await fedimint.generateEcash(
                    payment.amount,
                    federationId,
                )
                // Mark as accepted, not paid, they need to then redeem it
                paymentUpdates.status = ChatPaymentStatus.accepted
                paymentUpdates.token = ecash
                break
            }
            case 'cancel': {
                // Redeem the token back for ourselves to avoid it being otherwise claimed
                const { token } = payment
                if (token) {
                    await fedimint.cancelEcash(token, federationId)
                }
                paymentUpdates.token = null
                paymentUpdates.status = ChatPaymentStatus.canceled
                break
            }
            default:
                throw new Error('errors.unknown-error')
        }

        // Send message as an update
        const updatedMessage = {
            ...message,
            payment: {
                ...payment,
                ...paymentUpdates,
            },
        }
        log.info(
            'User updated legacy chat payment (local update only)',
            updatedMessage,
        )

        return updatedMessage
    },
)

/*** Selectors ***/

/** @deprecated XMPP legacy code */
const selectFederationChatState = (
    s: CommonState,
    federationId?: Federation['id'] | undefined,
) =>
    getFederationChatState(
        s.chat,
        federationId || selectActiveFederation(s)?.id || '',
    )

/** @deprecated XMPP legacy code */
export const selectChatEncryptionKeys = (s: CommonState) =>
    selectFederationChatState(s).encryptionKeys

/** @deprecated XMPP legacy code */
export const selectAuthenticatedMember = (s: CommonState) =>
    selectFederationChatState(s).authenticatedMember

/** @deprecated XMPP legacy code */
export const selectAllChatMessages = (
    s: CommonState,
    federationId?: Federation['id'],
) => selectFederationChatState(s, federationId).messages

/** @deprecated XMPP legacy code */
export const selectAllChatMembers = (s: CommonState) =>
    selectFederationChatState(s).membersSeen

/** @deprecated XMPP legacy code */
export const selectAllChatGroups = (s: CommonState) =>
    selectFederationChatState(s).groups

/** @deprecated XMPP legacy code */
export const selectAllChatGroupRoles = (s: CommonState) =>
    selectFederationChatState(s).groupRoles

/** @deprecated XMPP legacy code */
export const selectAllChatGroupAffiliations = (s: CommonState) =>
    selectFederationChatState(s).groupAffiliations

/** @deprecated XMPP legacy code */
export const selectChatClientStatus = (s: CommonState) =>
    selectFederationChatState(s).clientStatus

/** @deprecated XMPP legacy code */
export const selectChatClientLastOnlineAt = (s: CommonState) =>
    selectFederationChatState(s).clientLastOnlineAt

/** @deprecated XMPP legacy code */
export const selectChatLastReadMessageTimestamps = (
    s: CommonState,
    federationId?: Federation['id'],
) => selectFederationChatState(s, federationId).lastReadMessageTimestamps

/** @deprecated XMPP legacy code */
export const selectChatLastSeenMessageTimestamp = (
    s: CommonState,
    federationId?: Federation['id'],
) => selectFederationChatState(s, federationId).lastSeenMessageTimestamp

/** @deprecated XMPP legacy code */
export const selectPushNotificationToken = (s: CommonState) =>
    selectFederationChatState(s).pushNotificationToken

/** @deprecated XMPP legacy code */
export const selectChatConnectionOptions = createSelector(
    (s: CommonState) => {
        const activeFederationMetadata = selectFederationMetadata(s)
        return activeFederationMetadata
    },
    metadata => {
        const chatServerDomain = getFederationChatServerDomain(metadata)
        return chatServerDomain
            ? makeChatServerOptions(chatServerDomain as string)
            : null
    },
)

/** @deprecated XMPP legacy code */
export const selectChatMemberMap = createSelector(
    selectAllChatMembers,
    members => {
        return members.reduce<Record<string, ChatMember | undefined>>(
            (prev, member) => {
                prev[member.id] = member
                return prev
            },
            {},
        )
    },
)

/** @deprecated XMPP legacy code */
export const selectChatGroupMap = createSelector(
    selectAllChatGroups,
    groups => {
        return groups.reduce<Record<string, ChatGroup | undefined>>(
            (prev, group) => {
                prev[group.id] = group
                return prev
            },
            {},
        )
    },
)

/** @deprecated XMPP legacy code */
export const selectLatestChatMessage = createSelector(
    selectAllChatMessages,
    messages => getLatestMessage(messages),
)

/** @deprecated XMPP legacy code */
export const selectLatestChatMessageTimestamp = createSelector(
    selectLatestChatMessage,
    latestMessage => latestMessage?.sentAt,
)

/** @deprecated XMPP legacy code */
export const selectOrderedChatMessages = createSelector(
    selectAllChatMessages,
    messages => orderBy(messages, 'sentAt', 'desc'),
)

/** @deprecated XMPP legacy code */
export const selectOrderedChatList = createSelector(
    selectOrderedChatMessages,
    selectChatMemberMap,
    selectChatGroupMap,
    selectAuthenticatedMember,
    selectChatLastReadMessageTimestamps,
    (messages, memberMap, groupMap, me, lastReadMessageTimestamps) => {
        const chatMap: Record<string, ChatWithLatestMessage> = {}

        // First assemble chats from messages
        messages.forEach(m => {
            const { id, type } = getChatInfoFromMessage(m, me?.id || '')
            let name: string
            let members: string[]
            let broadcastOnly = false

            // Exclude ourselves from this list
            if (id === me?.id) return

            if (type === ChatType.direct) {
                // Filter out members we haven't seen, since we won't have enough
                // information to construct a chat.
                const member = memberMap[id]
                if (!member) return
                members = [id]
                name = member.username
            } else {
                name = groupMap[id]?.name || 'Chat'
                broadcastOnly = !!groupMap[id]?.broadcastOnly
                members = []
            }

            // Initialize chat object if it doesn't exist, otherwise just update
            // the latestPaymentUpdate
            const lastReadTimestamp = lastReadMessageTimestamps[id] || 0
            if (!chatMap[id]) {
                chatMap[id] = {
                    id,
                    name,
                    members,
                    type,
                    latestMessage: m,
                    hasNewMessages: lastReadTimestamp < m.sentAt,
                    broadcastOnly,
                }
                if (m.payment && m.payment.updatedAt) {
                    chatMap[id] = {
                        ...chatMap[id],
                        latestPaymentUpdate: m,
                        hasNewMessages: chatMap[id].hasNewMessages
                            ? true
                            : lastReadTimestamp < m.payment.updatedAt,
                    }
                }
            } else {
                chatMap[id] = {
                    ...chatMap[id],
                    members: uniq([...chatMap[id].members, ...members]),
                }
                if (m.payment) {
                    const { latestPaymentUpdate } = chatMap[id]
                    const latest =
                        (m.payment?.updatedAt || 0) >
                        (latestPaymentUpdate?.payment?.updatedAt || 0)
                            ? m
                            : latestPaymentUpdate

                    if (latest && latest.payment?.updatedAt) {
                        chatMap[id] = {
                            ...chatMap[id],
                            latestPaymentUpdate: latest,
                            hasNewMessages: chatMap[id].hasNewMessages
                                ? true
                                : lastReadTimestamp < latest.payment.updatedAt,
                        }
                    }
                }
            }
        })

        // Then add any groups we have that don't have messages yet
        Object.keys(groupMap).forEach(groupId => {
            if (chatMap[groupId]) return
            const group = groupMap[groupId]
            if (!group) return
            chatMap[groupId] = {
                ...group,
                type: ChatType.group,
                members: [],
                hasNewMessages: false,
                broadcastOnly: !!group.broadcastOnly,
            }
        })

        // Return them ordered by most recent message, fall back to a group's
        // joinedAt if it has no messages.
        return orderBy(
            Object.values(chatMap),
            c => {
                if (c.latestMessage) {
                    return c.latestMessage.sentAt
                }
                if ('joinedAt' in c) {
                    return c.joinedAt
                }
                return 0
            },
            'desc',
        )
    },
)

/** @deprecated XMPP legacy code */
export const selectIsChatEmpty = (s: CommonState) =>
    selectOrderedChatList(s).length === 0

/**
 * Returns members who have sent us messages recently. Optionally
 * takes in an argument of the number to return, defaults to 4.
 * @deprecated XMPP legacy code
 */
export const selectRecentChatMembers = createSelector(
    (s: CommonState) => selectOrderedChatMessages(s),
    selectChatMemberMap,
    selectAuthenticatedMember,
    (_: CommonState, limit?: number) => limit || 4,
    (messages, memberMap, authenticatedMember, limit) => {
        const recentMembers: ChatMember[] = []
        for (const message of messages) {
            // Grab the member of the sender (to us) or sendee (from us)
            const member =
                memberMap[
                    message.sentTo && message.sentTo !== authenticatedMember?.id
                        ? message.sentTo
                        : message.sentBy
                ]
            // Ignore group chats
            if (message.sentIn) continue
            // Ignore unidentified members
            if (!member) continue
            // Ignore members we've already added
            if (recentMembers.find(m => m.id === member.id)) continue
            // Ignore ourselves
            if (member.id === authenticatedMember?.id) continue
            // Add the member, and once we've reached the limit, break out
            recentMembers.push(member)
            if (recentMembers.length >= limit) break
        }
        return recentMembers
    },
)

/** @deprecated XMPP legacy code */
export const selectChat = createSelector(
    (s: CommonState) => selectOrderedChatList(s),
    (_: CommonState, chatId: Chat['id']) => chatId,
    (chats, chatId) => {
        return chats.find(c => c.id === chatId)
    },
)

/** @deprecated XMPP legacy code */
export const selectChatMessages = createSelector(
    selectAuthenticatedMember,
    (s: CommonState) => selectAllChatMessages(s),
    (_: CommonState, chatId: Chat['id']) => chatId,
    (me, messages, chatId) =>
        messages.filter(
            m =>
                m.sentIn === chatId ||
                (m.sentBy === chatId && !m.sentIn) ||
                (m.sentBy === me?.id && m.sentTo === chatId),
        ),
)

/** @deprecated XMPP legacy code */
export const selectChatMember = createSelector(
    selectAllChatMembers,
    (_: CommonState, memberId: string) => memberId,
    (chatMembers, memberId) => {
        return chatMembers.find(member => member.id === memberId)
    },
)

/** @deprecated XMPP legacy code */
export const selectChatMembersWithHistory = createSelector(
    selectAllChatMembers,
    selectAllChatMessages,
    (members, messages) => {
        const memberIdMap: Record<ChatMember['id'], boolean> = {}
        messages.forEach(m => {
            // Exclude group chats
            if (m.sentIn) return
            // Lazily include both sender & receiver, which will include ourselves,
            // but is faster than determining which of the two isn't us
            memberIdMap[m.sentBy] = true
            if (m.sentTo) {
                memberIdMap[m.sentTo] = true
            }
        })
        return members.filter(m => !!memberIdMap[m.id])
    },
)

/** @deprecated XMPP legacy code */
export const selectChatGroup = createSelector(
    selectAllChatGroups,
    (_: CommonState, groupId: string) => groupId,
    (chatGroups, groupId) => {
        return chatGroups.find(g => g.id === groupId)
    },
)

/** @deprecated XMPP legacy code */
export const selectHasUnseenMessages = createSelector(
    selectLatestChatMessageTimestamp,
    selectChatLastSeenMessageTimestamp,
    (latestMessageTimestamp, lastSeenMessageTimestamp) =>
        !!latestMessageTimestamp &&
        (lastSeenMessageTimestamp || 0) < latestMessageTimestamp,
)

/** @deprecated XMPP legacy code */
export const selectChatDefaultGroupIds = createSelector(
    (s: CommonState) => selectActiveFederation(s),
    activeFederation =>
        activeFederation ? getFederationGroupChats(activeFederation.meta) : [],
)
