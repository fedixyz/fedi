import {
    createSlice,
    PayloadAction,
    createSelector,
    createAsyncThunk,
    ThunkDispatch,
    AnyAction,
    isAnyOf,
} from '@reduxjs/toolkit'
import { xml } from '@xmpp/client'
import isEqual from 'lodash/isEqual'
import omit from 'lodash/omit'
import orderBy from 'lodash/orderBy'
import uniq from 'lodash/uniq'
import { v4 as uuidv4 } from 'uuid'

import {
    CommonState,
    selectActiveFederation,
    selectActiveFederationId,
    selectFederationMetadata,
    selectFederations,
} from '.'
import {
    Chat,
    ChatMessage,
    ChatMember,
    ChatGroup,
    ChatPayment,
    Keypair,
    ChatType,
    XmppCredentials,
    XmppClientStatus,
    ChatWithLatestMessage,
    ChatPaymentStatus,
    Federation,
    ChatRole,
    ChatAffiliation,
    ChatMessageStatus,
} from '../types'
import encryptionUtils from '../utils/EncryptionUtils'
import {
    getFederationChatServerDomain,
    getFederationGroupChats,
    makeChatServerOptions,
} from '../utils/FederationUtils'
import { XmppMemberRole } from '../utils/XmlUtils'
import { XmppChatClient, XmppChatClientManager } from '../utils/XmppChatClient'
import {
    getChatInfoFromMessage,
    getLatestMessage,
    getLatestPaymentUpdate,
    makePaymentUpdatedAt,
} from '../utils/chat'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import {
    checkXmppUser,
    decodeGroupInvitationLink,
    encodeGroupInvitationLink,
    registerXmppUser,
} from '../utils/xmpp'
import { loadFromStorage } from './storage'

type FederationPayloadAction<T = object> = PayloadAction<
    { federationId: string } & T
>

const log = makeLog('redux/chat')
const xmppChatClientManager = new XmppChatClientManager()
const MAX_MESSAGE_HISTORY = 1000

/*** Initial State ***/

const initialFederationChatState = {
    clientStatus: 'offline' as XmppClientStatus,
    clientLastOnlineAt: 0,
    clientError: null as string | null,
    authenticatedMember: null as ChatMember | null,
    credentials: null as XmppCredentials | null,
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
type FederationChatState = typeof initialFederationChatState

// All chat state is keyed by federation id to keep federation chats separate, so it starts as an empty object.
const initialState = {} as Record<
    Federation['id'],
    FederationChatState | undefined
>

export type ChatState = typeof initialState

/*** Slice definition ***/

const getFederationChatState = (state: ChatState, federationId: string) =>
    state[federationId] || {
        ...initialFederationChatState,
    }

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
        builder.addCase(refreshChatCredentials.fulfilled, (state, action) => {
            const { federationId } = action.meta.arg
            const federation = getFederationChatState(state, federationId)
            state[federationId] = {
                ...federation,
                ...action.payload,
            }
        })

        builder.addCase(authenticateChat.fulfilled, (state, action) => {
            const { federationId } = action.meta.arg
            const federation = getFederationChatState(state, federationId)
            state[federationId] = {
                ...federation,
                authenticatedMember: action.payload,
            }
        })

        builder.addCase(fetchChatHistory.fulfilled, (state, action) => {
            const { federationId } = action.meta.arg
            const federation = getFederationChatState(state, federationId)
            state[federationId] = {
                ...federation,
                lastFetchedMessageId: action.payload,
            }
        })

        builder.addCase(fetchChatMember.fulfilled, (state, action) => {
            return upsertEntityToChatState(
                state,
                action.meta.arg.federationId,
                'membersSeen',
                action.payload,
            )
        })

        builder.addCase(leaveChatGroup.fulfilled, (state, action) => {
            const { federationId, groupId } = action.meta.arg
            const chatState = getFederationChatState(state, federationId)
            const groups = chatState.groups.filter(g => g.id !== groupId)
            const messages = chatState.messages.filter(
                m => m.sentIn !== groupId,
            )
            const groupAffiliations = omit(chatState.groupAffiliations, groupId)
            const groupRoles = omit(chatState.groupRoles, groupId)
            const lastReadMessageTimestamps = omit(
                chatState.lastReadMessageTimestamps,
                groupId,
            )
            state[federationId] = {
                ...chatState,
                messages,
                groups,
                groupAffiliations,
                groupRoles,
                lastReadMessageTimestamps,
            }
        })

        builder.addCase(
            publishPushNotificationToken.fulfilled,
            (state, action) => {
                const { federationId } = action.meta.arg
                const federation = getFederationChatState(state, federationId)
                state[federationId] = {
                    ...federation,
                    pushNotificationToken: action.payload,
                }
            },
        )

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
            isAnyOf(
                sendDirectMessage.fulfilled,
                sendGroupMessage.fulfilled,
                updateChatPayment.fulfilled,
            ),
            (state, action) => {
                return upsertEntityToChatState(
                    state,
                    action.meta.arg.federationId,
                    'messages',
                    action.payload,
                )
            },
        )

        builder.addMatcher(
            isAnyOf(
                joinChatGroup.fulfilled,
                createChatGroup.fulfilled,
                configureChatGroup.fulfilled,
                refreshChatGroup.fulfilled,
            ),
            (state, action) => {
                return upsertEntityToChatState(
                    state,
                    action.meta.arg.federationId,
                    'groups',
                    action.payload,
                )
            },
        )
    },
})

/*** Basic actions ***/

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

export const refreshChatCredentials = createAsyncThunk<
    { credentials: XmppCredentials; encryptionKeys: Keypair },
    { fedimint: FedimintBridge; federationId: string }
>('chat/refreshChatCredentials', async ({ fedimint, federationId }) => {
    const credentials = await fedimint.getXmppCredentials(federationId)
    const encryptionKeys = encryptionUtils.generateDeterministicKeyPair(
        credentials.keypairSeed,
    )
    return { credentials, encryptionKeys }
})

export const authenticateChat = createAsyncThunk<
    ChatMember,
    {
        fedimint: FedimintBridge
        federationId: string
        username: string
        forceCredentialRefresh?: boolean
    },
    { state: CommonState }
>(
    'chat/authenticateChat',
    async (
        { fedimint, federationId, username, forceCredentialRefresh },
        { dispatch, getState },
    ) => {
        // Fetch xmpp credentials if we don't have them
        let credentials = getState().chat[federationId]?.credentials
        if (forceCredentialRefresh || !credentials) {
            credentials = (
                await dispatch(
                    refreshChatCredentials({ fedimint, federationId }),
                ).unwrap()
            ).credentials
        }

        const connectionOptions = selectChatConnectionOptions(getState())
        if (connectionOptions === null) {
            log.error('No chat connectionOptions for this federation')
            throw new Error('errors.chat-unavailable')
        }

        // Validate credentials, register if it's a new name
        const normalizedUsername = username.toLowerCase()
        const credentialsAreValid = await checkXmppUser(
            normalizedUsername,
            credentials.password,
            connectionOptions,
        )
        if (!credentialsAreValid) {
            await registerXmppUser(
                normalizedUsername,
                credentials.password,
                connectionOptions,
            )
        }

        // Backup the username to the fedimint bridge
        try {
            fedimint.backupXmppUsername(normalizedUsername, federationId)
            log.info('backupXmppUsername success')
            return {
                id: `${normalizedUsername}@${connectionOptions.domain}`,
                username: normalizedUsername,
            }
        } catch (error) {
            log.error('backupXmppUsername error', error)
            throw new Error('errors.bad-connection')
        }
    },
)

export const connectChat = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; federationId: string },
    { state: CommonState }
>(
    'chat/connectChat',
    async ({ fedimint, federationId }, { getState, dispatch }) => {
        log.info(`connecting chat for federation ${federationId}...`)
        // Assemble all necessary state for starting chat, throw if we are missing anything.
        const state = getState()
        const chatState = state.chat[federationId]
        const federation = selectFederations(state).find(
            f => f.id === federationId,
        )

        if (!federation) {
            log.error(
                `No federation found with id ${federationId}, cannot start chat`,
            )
            throw new Error('errors.chat-unavailable')
        }

        const chatDomain = getFederationChatServerDomain(federation.meta)
        if (!chatDomain) {
            log.info(`No chat domain configured for ${federationId}`)
            throw new Error('errors.chat-unavailable')
        }

        const authenticatedMember = chatState?.authenticatedMember
        if (!authenticatedMember) {
            log.warn(
                `No chat member informations was found for ${federationId}, cannot start chat`,
            )
            throw new Error('errors.chat-unavailable')
        }

        // Fetch xmpp credentials if we don't have them
        const { credentials, encryptionKeys } = await getOrFetchCredentials(
            fedimint,
            federationId,
            state,
            dispatch,
        )

        // Get client & bind listeners to dispatch actions
        const client = xmppChatClientManager.getClient(federationId)

        client.on('status', async status => {
            dispatch(setChatClientStatus({ federationId, status }))
        })

        client.on('error', error => {
            dispatch(setChatClientError({ federationId, error: error.message }))
        })

        client.on('message', message => {
            dispatch(addChatMessage({ federationId, message }))
            // Attempt to redeem payments shortly after receive. Give a small
            // delay to allow for a cancellation to come through first.
            // TODO: Should we notify the user in some way?
            if (
                message.payment &&
                message.payment.token &&
                message.payment.recipient === authenticatedMember.id &&
                message.payment.status === ChatPaymentStatus.accepted
            ) {
                log.info('Got a payment message, will attempt redeem in 250ms')
                setTimeout(() => {
                    const updatedPayment = getState().chat[
                        federationId
                    ]?.messages.find(m => m.id === message.id)?.payment
                    if (!updatedPayment) return
                    if (updatedPayment.status !== ChatPaymentStatus.accepted) {
                        log.info(
                            `Payment message status changed to ${updatedPayment.status}, cancelling redemption`,
                        )
                        return
                    }
                    log.info('Attempting to redeem message payment')
                    dispatch(
                        updateChatPayment({
                            fedimint,
                            federationId,
                            messageId: message.id,
                            action: 'receive',
                        }),
                    )
                        .unwrap()
                        .then(() =>
                            log.info('Redeemed and updated payment message'),
                        )
                        .catch(err =>
                            log.warn('Failed to redeem payment message', err),
                        )
                }, 250)
            }
        })

        client.on('memberSeen', member => {
            dispatch(addChatMemberSeen({ federationId, member }))
        })

        client.on('group', group => {
            dispatch(addChatGroup({ federationId, group }))
        })

        client.on('groupUpdate', groupId => {
            const group = chatState?.groups.find(g => g.id === groupId)
            if (!group) {
                log.warn(`No group found with ID: ${groupId}`)
                return
            }

            dispatch(refreshChatGroup({ federationId, group }))
        })

        client.on('groupRole', ({ groupId, role }) => {
            dispatch(setChatGroupRole({ federationId, groupId, role }))
        })

        client.on('groupAffiliation', ({ groupId, affiliation }) => {
            dispatch(
                setChatGroupAffiliation({ federationId, groupId, affiliation }),
            )
        })

        // On connection, update various states
        client.on('online', async () => {
            log.debug('xmpp client online')
            // Establish healthy websocket state
            dispatch(
                setWebsocketIsHealthy({
                    federationId,
                    healthy: true,
                }),
            )
            // Publish public key
            client
                .publishPublicKey(encryptionKeys.publicKey)
                .catch(() => log.error('Failed to publish public key'))

            // Publish a push notification token if set by the application
            if (chatState.pushNotificationToken) {
                client
                    .publishNotificationToken(chatState.pushNotificationToken)
                    .catch(() => log.error('Failed to publish public key'))
            }

            // Fetch chat history
            dispatch(fetchChatHistory({ federationId }))

            // "Enter" every group we have in state
            chatState.groups.forEach(group => {
                client.enterGroup(group.id)
                // check to see if the group name has changed
                dispatch(refreshChatGroup({ federationId, group }))
            })

            // Join every default chat group we don't have in state
            const defaultGroupIds = getFederationGroupChats(federation.meta)
            const unjoinedDefaultGroupIds = defaultGroupIds.filter(
                chatId => !chatState.groups.find(g => g.id === chatId),
            )
            unjoinedDefaultGroupIds.forEach(groupId => {
                dispatch(
                    joinChatGroup({
                        federationId,
                        link: encodeGroupInvitationLink(groupId),
                    }),
                )
            })

            // Send any previously queued messages
            dispatch(sendQueuedMessages({ fedimint, federationId }))

            // Fix authenticatedMember if it has the wrong id or public key
            const jid = client.xmpp?.jid?.toString().split('/')[0]
            if (jid && authenticatedMember.id !== jid) {
                dispatch(
                    setAuthenticatedMember({
                        federationId,
                        authenticatedMember: {
                            ...authenticatedMember,
                            id: jid,
                            publicKeyHex: encryptionKeys.publicKey.hex,
                        },
                    }),
                )
            }
        })

        // Start the client
        const connectionOptions = makeChatServerOptions(chatDomain)
        if (client?.xmpp && client?.xmpp?.status !== 'offline') {
            log.warn(
                `Chat connection attempt already in progress for ${federationId}...`,
                { status: client.xmpp.status },
            )
            return
        } else {
            client.start(
                {
                    domain: connectionOptions.domain,
                    service: connectionOptions.service,
                    resource: connectionOptions.resource,
                    username: authenticatedMember.username,
                    password: credentials.password,
                },
                encryptionKeys,
            )
        }
    },
)

export const disconnectChat = createAsyncThunk<
    void,
    { federationId: string },
    { state: CommonState }
>('chat/disconnectChat', async ({ federationId }, { dispatch }) => {
    dispatch(
        setWebsocketIsHealthy({
            federationId,
            healthy: false,
        }),
    )
    await xmppChatClientManager.destroyClient(federationId)
})

export const ensureHealthyXmppStream = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; federationId: string },
    { state: CommonState }
>(
    'chat/ensureHealthyXmppStream',
    ({ fedimint, federationId }, { dispatch }) => {
        dispatch(
            setWebsocketIsHealthy({
                federationId,
                healthy: false,
            }),
        )
        // Sometimes we send a presence message and do not
        // get a response which may mean the stream cannot
        // be resumed so we need to reconnect the chat client
        const client = xmppChatClientManager.getClient(federationId)
        const reconnectTimer = setTimeout(async () => {
            log.info(
                'no response from XMPP server after 3s, rebuilding XMPP client',
            )
            await dispatch(
                disconnectChat({
                    federationId,
                }),
            ).unwrap()
            dispatch(
                connectChat({
                    fedimint,
                    federationId,
                }),
            )
        }, 3000)
        // This expects a response to the presence message which means
        // the stream has been resumed successfully so we can clear
        // the reconnectTimer and cleanup the listener
        const onStanzaReceived = async (_: Element) => {
            dispatch(
                setWebsocketIsHealthy({
                    federationId,
                    healthy: true,
                }),
            )
            client?.xmpp.removeListener('stanza', onStanzaReceived)
            log.info('XMPP server responded, do not rebuild XMPP client')
            clearTimeout(reconnectTimer)
        }
        client?.xmpp.on('stanza', onStanzaReceived)
        log.info('sending presence to XMPP server to test for stable stream')
        client?.xmpp.send(xml('presence'))
    },
)

export const fetchChatHistory = createAsyncThunk<
    string | null,
    { federationId: string },
    { state: CommonState }
>('chat/fetchChatHistory', async ({ federationId }, { getState }) => {
    const client = xmppChatClientManager.getClient(federationId)
    let lastFetchedMessageId =
        getState().chat[federationId]?.lastFetchedMessageId || null

    // Keep requesting until we're totally caught up
    let caughtUp = false
    let hasErrored = false
    while (!caughtUp) {
        try {
            const nextLastFetchedMessageId = await client.fetchMessageHistory(
                null,
                {
                    limit: '10',
                    after: lastFetchedMessageId || undefined,
                },
            )
            if (
                !nextLastFetchedMessageId ||
                nextLastFetchedMessageId === lastFetchedMessageId
            ) {
                caughtUp = true
                break
            }
            lastFetchedMessageId = nextLastFetchedMessageId
        } catch (err) {
            // If it failed, assume there's something wrong with our lastFetchedMessageId
            // and try again. Only try again once per message history fetch to avoid
            // infinite retries.
            if (!hasErrored && lastFetchedMessageId) {
                log.info(
                    `fetchChatHistory failed with lastFetchedMessageId, retrying`,
                    { lastFetchedMessageId, err },
                )
                hasErrored = true
                lastFetchedMessageId = null
            } else {
                log.warn(
                    'fetchChatHistory failed after retrying, giving up',
                    err,
                )
                throw err
            }
        }
    }

    return lastFetchedMessageId
})

export const fetchChatMembers = createAsyncThunk<
    ChatMember[],
    { federationId: string }
>('chat/fetchChatMembers', ({ federationId }) => {
    const client = xmppChatClientManager.getClient(federationId)
    return client.fetchMembers()
})

export const fetchChatMember = createAsyncThunk<
    ChatMember,
    { federationId: string; memberId: string },
    { state: CommonState }
>('chat/fetchChatMember', async ({ federationId, memberId }) => {
    const client = xmppChatClientManager.getClient(federationId)
    const pubkey = await client.fetchMemberPublicKey(memberId)
    if (pubkey) {
        return {
            id: memberId,
            username: memberId.split('@')[0],
            publicKeyHex: pubkey,
        }
    } else {
        throw new Error('feature.chat.invalid-member')
    }
})

export const refreshChatGroup = createAsyncThunk<
    ChatGroup,
    { federationId: string; group: ChatGroup }
>('chat/refreshChatGroup', async ({ federationId, group }) => {
    const client = xmppChatClientManager.getClient(federationId)
    const config = await client.fetchGroupConfig(group.id)
    if (config.name) {
        return {
            ...group,
            ...config,
        }
    } else {
        throw new Error('errors.unknown-error')
    }
})

export const joinChatGroup = createAsyncThunk<
    ChatGroup,
    { federationId: string; link: string }
>('chat/joinChatGroup', async ({ federationId, link }) => {
    const groupId = decodeGroupInvitationLink(link)
    const client = xmppChatClientManager.getClient(federationId)
    const group = await client.joinGroup(groupId)
    return group
})

export const createChatGroup = createAsyncThunk<
    ChatGroup,
    { federationId: string; id: string; name: string; broadcastOnly?: boolean }
>('chat/createChatGroup', async ({ federationId, id, name, broadcastOnly }) => {
    const client = xmppChatClientManager.getClient(federationId)
    const group = await client.createGroup(id, name, broadcastOnly)
    return group
})

export const leaveChatGroup = createAsyncThunk<
    void,
    { federationId: string; groupId: string },
    { state: CommonState }
>('chat/leaveChatGroup', async ({ federationId, groupId }) => {
    const client = xmppChatClientManager.getClient(federationId)
    await client.leaveGroup(groupId)
})

export const configureChatGroup = createAsyncThunk<
    ChatGroup,
    { federationId: string; groupId: string; groupName: string },
    { state: CommonState }
>(
    'chat/configureChatGroup',
    async ({ federationId, groupId, groupName }, { getState }) => {
        const group = getState().chat[federationId]?.groups.find(
            g => g.id === groupId,
        )
        if (!group) throw new Error('No group found with that ID')

        const client = xmppChatClientManager.getClient(federationId)
        await client.configureGroup(groupId, groupName)

        return {
            ...group,
            name: groupName,
        }
    },
)

export const addAdminToChatGroup = createAsyncThunk<
    void,
    { federationId: string; groupId: string; memberId: string },
    { state: CommonState }
>(
    'chat/addAdminToGroup',
    async ({ federationId, groupId, memberId }, { getState }) => {
        const chatState = getState().chat[federationId]
        const group = chatState?.groups.find(g => g.id === groupId)
        if (!group) throw new Error('No group found with that ID')

        const member = chatState?.membersSeen.find(m => m.id === memberId)
        if (!member) throw new Error('No member found with that ID')

        const client = xmppChatClientManager.getClient(federationId)
        await client.addAdminToGroup(groupId, member)
    },
)

export const fetchChatGroupMembersList = createAsyncThunk<
    ChatMember[],
    { federationId: string; groupId: string; role: XmppMemberRole },
    { state: CommonState }
>(
    'chat/fetchChatGroupMembersList',
    async ({ federationId, groupId, role }, { getState }) => {
        const chatState = getState().chat[federationId]
        const group = chatState?.groups.find(g => g.id === groupId)
        if (!group) throw new Error('No group found with that ID')

        const client = xmppChatClientManager.getClient(federationId)
        return client.fetchGroupMembersList(groupId, role)
    },
)

export const removeAdminFromChatGroup = createAsyncThunk<
    void,
    { federationId: string; groupId: string; memberId: string },
    { state: CommonState }
>(
    'chat/removeAdminFromChatGroup',
    async ({ federationId, groupId, memberId }, { getState }) => {
        const chatState = getState().chat[federationId]
        const group = chatState?.groups.find(g => g.id === groupId)
        if (!group) throw new Error('No group found with that ID')

        const member = chatState?.membersSeen.find(m => m.id === memberId)
        if (!member) throw new Error('No member found with that ID')

        const client = xmppChatClientManager.getClient(federationId)
        await client.removeAdminFromGroup(groupId, member)
    },
)

export const sendDirectMessage = createAsyncThunk<
    ChatMessage,
    | {
          fedimint: FedimintBridge
          federationId: string
          recipientId: string
      } & ({ content: string } | { payment: ChatPayment }),
    { state: CommonState }
>('chat/sendDirectMessage', async (args, { dispatch, getState }) => {
    const { fedimint, federationId, recipientId } = args
    const content = 'payment' in args ? 'fedi:payment-request:' : args.content
    let payment = 'payment' in args ? args.payment : undefined

    const state = getState()
    const client = xmppChatClientManager.getClient(federationId)

    // Get the recipient's pubkey, fetch it if we don't have it
    const chatState = state.chat[federationId]
    const recipientMember = chatState?.membersSeen.find(
        m => m.id === recipientId,
    )
    let recipientPubkey: string
    if (recipientMember?.publicKeyHex) {
        recipientPubkey = recipientMember?.publicKeyHex
    } else {
        recipientPubkey = await client.fetchMemberPublicKey(recipientId)
    }

    // Get or fetch credentials
    const { encryptionKeys } = await getOrFetchCredentials(
        fedimint,
        federationId,
        state,
        dispatch,
    )

    // Get our username
    const authenticatedMember = chatState?.authenticatedMember
    if (!authenticatedMember) {
        throw new Error('errors.chat-unavailable')
    }

    // Construct the message object
    const sentAt = Date.now() / 1000
    if (payment) {
        payment = { ...payment, updatedAt: sentAt }
    }
    const message: ChatMessage = {
        content,
        payment,
        sentAt,
        id: uuidv4(),
        sentBy: authenticatedMember.id,
        sentTo: recipientId,
    }
    let status: ChatMessageStatus

    // Attempt to send, update status of message
    try {
        await client.sendDirectMessage(
            recipientId,
            recipientPubkey,
            message,
            encryptionKeys,
            false,
        )
        status = ChatMessageStatus.sent
    } catch (err) {
        // TODO: Determine recoverable error that should mark the message as queued
        // versus an unrecoverable message that should be ChatMessageStatus.failed
        status = ChatMessageStatus.queued
        log.warn('Failed to send message, queueing it to retry later')
    }
    return { ...message, status }
})

export const sendGroupMessage = createAsyncThunk<
    ChatMessage,
    { federationId: string; groupId: string; content: string },
    { state: CommonState }
>(
    'chat/sendGroupMessage',
    async ({ federationId, groupId, content }, { getState }) => {
        const chatState = getState().chat[federationId]
        const client = xmppChatClientManager.getClient(federationId)

        // Get our username
        const authenticatedMember = chatState?.authenticatedMember
        if (!authenticatedMember) {
            throw new Error('errors.chat-unavailable')
        }

        // Get the group
        const group = chatState?.groups.find(g => g.id === groupId) || {
            id: groupId,
        }

        // Construct the message object for sending
        const message: ChatMessage = {
            content,
            id: uuidv4(),
            sentAt: Date.now() / 1000,
            sentBy: authenticatedMember.id,
            sentIn: groupId,
        }
        let status: ChatMessageStatus

        // Attempt to send, update status of message
        try {
            await client.sendGroupMessage(group, message)
            status = ChatMessageStatus.sent
        } catch (err) {
            // TODO: Determine recoverable error that should mark the message as queued
            // versus an unrecoverable message that should be ChatMessageStatus.failed
            status = ChatMessageStatus.queued
            log.warn('Failed to send message, queueing it to retry later')
        }
        return { ...message, status }
    },
)

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
    async (
        { fedimint, federationId, messageId, action },
        { getState, dispatch },
    ) => {
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

        const client = xmppChatClientManager.getClient(federationId)

        // Get the recipient's pubkey, fetch it if we don't have it
        const recipientPubkey = await getOrFetchMemberPubkey(
            chatState,
            client,
            recipientId,
        )

        // Get or fetch credentials
        const { encryptionKeys } = await getOrFetchCredentials(
            fedimint,
            federationId,
            state,
            dispatch,
        )

        // Update payment depending on action
        const paymentUpdates: Partial<ChatPayment> = {
            updatedAt: makePaymentUpdatedAt(payment),
        }
        // Always send a push notification except for a few
        // specific payment update cases
        let sendPushNotification = true
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
                // don't send a push notification for redeemed ecash
                sendPushNotification = false
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
                // don't send a push notification for canceled payments
                sendPushNotification = false
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
        await client.sendDirectMessage(
            recipientId,
            recipientPubkey,
            updatedMessage,
            encryptionKeys,
            true,
            sendPushNotification,
        )

        return updatedMessage
    },
)

export const sendQueuedMessages = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        federationId: string
    },
    { state: CommonState }
>(
    'chat/sendQueuedMessages',
    async ({ fedimint, federationId }, { dispatch, getState }) => {
        // Gather up any queued messages, return if we have none
        const queuedMessages = getState().chat[federationId]?.messages.filter(
            m => m.status === ChatMessageStatus.queued,
        )
        if (!queuedMessages?.length) return
        log.info(`Attempting to send ${queuedMessages.length} queued messages`)

        // Get or fetch credentials for encryption
        const { encryptionKeys } = await getOrFetchCredentials(
            fedimint,
            federationId,
            getState(),
            dispatch,
        )

        // Process queued messages linearly, not all at once, to ensure they're
        // received in the intended order. Make sure to re-run any state dependent
        // functions inside the for loop rather than outside, as state can change
        // while messages are re-sending.
        for (const msg of queuedMessages) {
            // Grab the client and make sure we're still online, otherwise just
            // break out since it won't send anyway
            const client = xmppChatClientManager.getClient(federationId)
            if (client.xmpp.status !== 'online') break

            // Attempt resending the message
            const { sentIn, sentTo } = msg
            const updatedMsg = {
                ...msg,
                sentAt: Date.now() / 1000,
            }
            try {
                if (sentIn) {
                    // Resend to groups
                    const group = getState().chat[federationId]?.groups.find(
                        g => g.id === sentIn,
                    ) || {
                        id: sentIn,
                    }
                    await client.sendGroupMessage(group, updatedMsg)
                } else if (sentTo) {
                    // Resend to user
                    const recipientPubkey = await getOrFetchMemberPubkey(
                        getState().chat[federationId],
                        client,
                        sentTo,
                    )
                    await client.sendDirectMessage(
                        sentTo,
                        recipientPubkey,
                        updatedMsg,
                        encryptionKeys,
                        false,
                    )
                } else {
                    // Should never happen
                    throw new Error('No sentIn or sentTo')
                }
                dispatch(
                    addChatMessage({
                        federationId,
                        message: {
                            ...msg,
                            status: ChatMessageStatus.sent,
                        },
                    }),
                )
            } catch (err) {
                // TODO: Determine recoverable error that should leave the message as queued
                // for a future attempt, versus an unrecoverable message that should
                // update the message to ChatMessageStatus.failed
                log.warn('Failed to send queued message', err)
            }
        }
    },
)

export const publishPushNotificationToken = createAsyncThunk<
    string,
    { federationId: string; getToken: () => Promise<string> },
    { state: CommonState }
>('chat/publishPushNotificationToken', async ({ federationId, getToken }) => {
    const client = xmppChatClientManager.getClient(federationId)
    if (client.xmpp.status !== 'online') {
        throw new Error(
            'Cannot publish notification token while xmpp client is offline',
        )
    }
    const token = await getToken()
    await client.publishNotificationToken(token)
    return token
})

// Async thunk utility functions

async function getOrFetchCredentials(
    fedimint: FedimintBridge,
    federationId: string,
    state: CommonState,
    dispatch: ThunkDispatch<CommonState, unknown, AnyAction>,
) {
    const chatState = state.chat[federationId]
    let credentials: XmppCredentials
    let encryptionKeys: Keypair
    if (chatState?.credentials && chatState?.encryptionKeys) {
        credentials = chatState.credentials
        encryptionKeys = chatState.encryptionKeys
    } else {
        const res = await dispatch(
            refreshChatCredentials({ fedimint, federationId }),
        ).unwrap()
        credentials = res.credentials
        encryptionKeys = res.encryptionKeys
    }
    return { credentials, encryptionKeys }
}

async function getOrFetchMemberPubkey(
    chatState: FederationChatState | undefined,
    client: XmppChatClient,
    memberId: string,
) {
    const member = chatState?.membersSeen.find(m => m.id === memberId)
    if (member?.publicKeyHex) {
        return member.publicKeyHex
    } else {
        return await client.fetchMemberPublicKey(memberId)
    }
}

/*** Selectors ***/

const selectFederationChatState = (
    s: CommonState,
    federationId?: Federation['id'] | undefined,
) =>
    getFederationChatState(
        s.chat,
        federationId || selectActiveFederation(s)?.id || '',
    )

export const selectChatCredentials = (s: CommonState) =>
    selectFederationChatState(s).credentials

export const selectChatEncryptionKeys = (s: CommonState) =>
    selectFederationChatState(s).encryptionKeys

export const selectAuthenticatedMember = (s: CommonState) =>
    selectFederationChatState(s).authenticatedMember

export const selectAllChatMessages = (
    s: CommonState,
    federationId?: Federation['id'],
) => selectFederationChatState(s, federationId).messages

export const selectAllChatMembers = (s: CommonState) =>
    selectFederationChatState(s).membersSeen

export const selectAllChatGroups = (s: CommonState) =>
    selectFederationChatState(s).groups

export const selectAllChatGroupRoles = (s: CommonState) =>
    selectFederationChatState(s).groupRoles

export const selectAllChatGroupAffiliations = (s: CommonState) =>
    selectFederationChatState(s).groupAffiliations

export const selectChatClientStatus = (s: CommonState) =>
    selectFederationChatState(s).clientStatus

export const selectChatClientLastOnlineAt = (s: CommonState) =>
    selectFederationChatState(s).clientLastOnlineAt

export const selectChatLastReadMessageTimestamps = (
    s: CommonState,
    federationId?: Federation['id'],
) => selectFederationChatState(s, federationId).lastReadMessageTimestamps

export const selectChatLastSeenMessageTimestamp = (
    s: CommonState,
    federationId?: Federation['id'],
) => selectFederationChatState(s, federationId).lastSeenMessageTimestamp

export const selectPushNotificationToken = (s: CommonState) =>
    selectFederationChatState(s).pushNotificationToken

export const selectWebsocketIsHealthy = (s: CommonState) =>
    selectFederationChatState(s).websocketIsHealthy

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

export const selectLatestChatMessage = createSelector(
    selectAllChatMessages,
    messages => getLatestMessage(messages),
)

export const selectLatestPaymentUpdate = createSelector(
    selectAllChatMessages,
    messages => getLatestPaymentUpdate(messages),
)

export const selectLatestChatMessageTimestamp = createSelector(
    selectLatestChatMessage,
    latestMessage => latestMessage?.sentAt,
)

export const selectLatestPaymentUpdateTimestamp = createSelector(
    selectLatestPaymentUpdate,
    latestPaymentUpdate => latestPaymentUpdate?.payment?.updatedAt,
)

export const selectOrderedChatMessages = createSelector(
    selectAllChatMessages,
    messages => orderBy(messages, 'sentAt', 'desc'),
)

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

export const selectIsChatEmpty = (s: CommonState) =>
    selectOrderedChatList(s).length === 0

/** Returns whether or not the user needs to register a username on the chat server */
export const selectNeedsChatRegistration = (s: CommonState) =>
    !!selectChatConnectionOptions(s) && !selectAuthenticatedMember(s)

/**
 * Returns members who have sent us messages recently. Optionally
 * takes in an argument of the number to return, defaults to 4.
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

export const selectChat = createSelector(
    (s: CommonState) => selectOrderedChatList(s),
    (_: CommonState, chatId: Chat['id']) => chatId,
    (chats, chatId) => {
        return chats.find(c => c.id === chatId)
    },
)

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

export const selectChatMember = createSelector(
    selectAllChatMembers,
    (_: CommonState, memberId: string) => memberId,
    (chatMembers, memberId) => {
        return chatMembers.find(member => member.id === memberId)
    },
)

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

export const selectChatGroup = createSelector(
    selectAllChatGroups,
    (_: CommonState, groupId: string) => groupId,
    (chatGroups, groupId) => {
        return chatGroups.find(g => g.id === groupId)
    },
)

export const selectHasUnseenMessages = createSelector(
    selectLatestChatMessageTimestamp,
    selectChatLastSeenMessageTimestamp,
    (latestMessageTimestamp, lastSeenMessageTimestamp) =>
        !!latestMessageTimestamp &&
        (lastSeenMessageTimestamp || 0) < latestMessageTimestamp,
)

export const selectHasUnseenPaymentUpdates = createSelector(
    selectLatestPaymentUpdateTimestamp,
    selectChatLastSeenMessageTimestamp,
    (latestPaymentUpdateTimestamp, lastSeenMessageTimestamp) =>
        !!latestPaymentUpdateTimestamp &&
        (lastSeenMessageTimestamp || 0) < (latestPaymentUpdateTimestamp || 0),
)

export const selectHasNewChatActivityInOtherFeds = createSelector(
    (s: CommonState) => s,
    (s: CommonState) => selectFederations(s),
    (s: CommonState) => selectActiveFederationId(s),
    (s: CommonState, federations, activeFederationId) => {
        const otherFederations = federations.filter(
            f => f.id !== activeFederationId,
        )
        return otherFederations.some(of => {
            return (
                selectHasUnseenMessages(s, of.id) ||
                selectHasUnseenPaymentUpdates(s, of.id)
            )
        })
    },
)

export const selectChatGroupRole = createSelector(
    selectAllChatGroupRoles,
    (_: CommonState, chatId: Chat['id']) => chatId,
    (roles, chatId) => {
        const role = roles[chatId] || ChatRole.visitor
        if (Object.keys(ChatRole).includes(role)) {
            return role as ChatRole
        }
        return ChatRole.visitor
    },
)

export const selectChatGroupAffiliation = createSelector(
    selectAllChatGroupAffiliations,
    (_: CommonState, chatId: Chat['id']) => chatId,
    (affiliations, chatId) => {
        const affiliation = affiliations[chatId] || ChatAffiliation.none
        if (Object.keys(ChatAffiliation).includes(affiliation)) {
            return affiliation as ChatAffiliation
        }
        return ChatAffiliation.none
    },
)

export const selectChatDefaultGroupIds = createSelector(
    (s: CommonState) => selectActiveFederation(s),
    activeFederation =>
        activeFederation ? getFederationGroupChats(activeFederation.meta) : [],
)

/**
 * Selects the XmppChatClient for the currently active federation.
 * Only returns the client if it is online and ready to send and receive
 * XMPP messages, otherwise return null.
 */
export const selectChatXmppClient = (s: CommonState) => {
    const activeFederationId = selectActiveFederation(s)?.id
    const status = selectChatClientStatus(s)
    if (!activeFederationId || status !== 'online') return null
    return xmppChatClientManager.getClient(activeFederationId)
}
