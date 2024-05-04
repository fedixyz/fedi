import {
    xml,
    client as xmppClient,
    Client as XmppClient,
    Options as XmppOptions,
    jid as makeJid,
} from '@xmpp/client'
import type { Status as XmppStatus } from '@xmpp/connection'
import debug from '@xmpp/debug'
import { JID } from '@xmpp/jid'
import StanzaError from '@xmpp/middleware/lib/StanzaError'
import parse from '@xmpp/xml/lib/parse'
import EventEmitter from 'events'
import type { Element } from 'ltx'

import { XMPP_MESSAGE_TYPES, XMPP_RESOURCE } from '../constants/xmpp'
import {
    ArchiveQueryFilters,
    ArchiveQueryPagination,
    ChatAffiliation,
    ChatGroup,
    ChatMember,
    ChatMessage,
    ChatRole,
    Key,
    Keypair,
} from '../types'
import encryptionUtils from './EncryptionUtils'
import xmlUtils, {
    EncryptedDirectChatMessage,
    EnterMucRoomPresence,
    GetMembersListQuery,
    GetMessagesQuery,
    GetPublicKeyQuery,
    GetRoomConfigQuery,
    GetRosterQuery,
    GroupChatMessage,
    LeaveMucRoomPresence,
    PublishNotificationTokenQuery,
    PublishPublicKeyQuery,
    SetMemberAffiliationQuery,
    SetPubsubNodeConfigQuery,
    SetRoomConfigQuery,
    UniqueRoomNameQuery,
    XmppMemberAffiliation,
    XmppMemberRole,
} from './XmlUtils'
import { jidToId } from './chat'
import { makeLog } from './log'

const log = makeLog('common/utils/XmppChatClient')

interface XmppChatClientEventMap {
    status: XmppStatus
    online: JID
    message: ChatMessage
    memberSeen: ChatMember
    group: ChatGroup
    groupUpdate: ChatGroup['id']
    groupRole: { groupId: string; role: ChatRole }
    groupAffiliation: { groupId: string; affiliation: ChatAffiliation }
    error: Error
}

/**
 * XmppChatClient is a class that manages the xmpp connection and provides
 * convenient events and methods that are tailored to the Fedi chat use-case.
 */
export class XmppChatClient {
    emitter = new EventEmitter()
    clients: Record<string, XmppClient | undefined> = {}

    // We have to defer initiailizing these until `.start()` instead of in the
    // constructor, so ignore uninitiailzed. Note that most any method will
    // throw until `.start()` has been called.
    xmpp!: ReturnType<typeof xmppClient>
    encryptionKeys!: Keypair

    /*** Public methods ***/

    start(options: XmppOptions, encryptionKeys: Keypair) {
        this.xmpp = xmppClient(options)
        this.encryptionKeys = encryptionKeys
        debug(this.xmpp)

        this.xmpp.on('status', this.handleStatus)
        this.xmpp.on('online', this.handleOnline)
        this.xmpp.on('element', this.handleElement)
        this.xmpp.on('stanza', this.handleStanza)
        this.xmpp.on('error', this.handleError)
        return this.xmpp.start().catch(this.handleError)
    }

    async stop() {
        try {
            await this.xmpp.stop()
        } catch (err) {
            log.warn(`Encountered error when stopping xmpp client`, err)
        }
    }

    async fetchGroupMembersList(
        groupId: string,
        role: XmppMemberRole,
    ): Promise<ChatMember[]> {
        try {
            const { iqCaller, jid } = this.getQueryProperties()
            const membersListQueryXml = xmlUtils.buildQuery(
                new GetMembersListQuery({
                    from: jid.toString(),
                    to: `${groupId}@muc.${jid.getDomain()}`,
                    role,
                }),
            )
            const result = await iqCaller.request(membersListQueryXml)
            log.debug('fetchGroupMembersList', result)
            let members: ChatMember[] = []
            if (result.getChild('query')) {
                const memberItems = result
                    .getChild('query')
                    ?.getChildren('item')

                if (memberItems) {
                    members = memberItems.map(i => {
                        const username: string = i.getAttr('nick')
                        const memberJid: string = i.getAttr('jid')
                        const id: string = memberJid.split(
                            `/${XMPP_RESOURCE}`,
                        )[0]

                        this.emit(
                            'memberSeen',
                            this.memberFromJid(memberJid.toString()),
                        )

                        return {
                            id,
                            username,
                        } as ChatMember
                    })
                }
            }
            log.debug('members', members)
            return members
        } catch (error) {
            throw new Error('errors.unknown-error')
        }
    }

    /**
     * This sends a request that causes a bunch of `message` events to trigger,
     * doesn't actually return message history.
     */
    async fetchMessageHistory(
        filters: ArchiveQueryFilters | null,
        pagination: ArchiveQueryPagination | null,
    ): Promise<string | null> {
        try {
            const { iqCaller } = this.getQueryProperties()
            const getMessagesQueryXml = xmlUtils.buildQuery(
                new GetMessagesQuery({
                    filters,
                    pagination,
                }),
            )
            // This result gives us the total message count and
            // handles pagination for queries to the message archive
            const result = await iqCaller.request(getMessagesQueryXml)
            log.debug('fetchMessagesFromArchive', result.toString())
            const results = result.getChild('fin')?.getChild('set')
            if (!results) return null

            const lastMessageId = results.getChild('last')?.getText()
            if (lastMessageId) return lastMessageId
        } catch (err) {
            log.error('fetchMessageHistory', err)
            throw new Error('errors.unknown-error')
        }
        return null
    }

    /**
     * This sends a request that causes a bunch of `memberSeen` events to
     * trigger, doesn't actually return all members.
     */
    async fetchMembers(): Promise<ChatMember[]> {
        try {
            const { iqCaller, jid } = this.getQueryProperties()
            const roomConfigQueryXml = xmlUtils.buildQuery(
                new GetRosterQuery({
                    from: jid.toString(),
                }),
            )
            const result = await iqCaller.request(roomConfigQueryXml)
            log.debug('fetchMembers', result)
            let membersSeen: ChatMember[] = []
            if (result.getChild('query')) {
                log.debug('query', result.getChild('query'))
                const rosterMembers = result
                    .getChild('query')
                    ?.getChildren('item')
                log.debug('rosterMembers', rosterMembers)

                if (rosterMembers) {
                    membersSeen = rosterMembers.map(memberEl => {
                        return this.memberFromJid(memberEl.getAttr('jid'))
                    })
                }
            }
            log.debug('membersSeen', membersSeen)
            return membersSeen
        } catch (error) {
            throw new Error('errors.unknown-error')
        }
    }

    async fetchMemberPublicKey(memberId: string) {
        return new Promise<string>((resolve, reject) => {
            try {
                const { iqCaller, jid } = this.getQueryProperties()

                const onStanzaReceived = (stanza: Element) => {
                    if (!stanza.is('message')) return
                    if (stanza.getAttr('from') !== memberId) return
                    if (stanza.getAttr('type') !== 'headline') return

                    const pubkey = stanza
                        .getChild('event')
                        ?.getChild('items')
                        ?.getChild('item')
                        ?.getChildText('entry')

                    if (pubkey) {
                        resolve(pubkey.toString())
                    } else {
                        reject(
                            new Error(
                                `Failed to retrieve pubkey for ${memberId}`,
                            ),
                        )
                    }
                }
                this.xmpp.on('stanza', onStanzaReceived)

                const getPubkeyQueryXml = xmlUtils.buildQuery(
                    new GetPublicKeyQuery({
                        from: jid.toString(),
                        to: memberId,
                    }),
                )
                iqCaller.request(getPubkeyQueryXml).catch(reject)
            } catch (error) {
                log.error('fetchMemberPublicKey', error)
                reject(new Error('errors.unknown-error'))
            }
        })
    }

    async publishPublicKey(pubkey: Key) {
        try {
            const { iqCaller, jid } = this.getQueryProperties()
            const publishPubkeyQueryXml = xmlUtils.buildQuery(
                new PublishPublicKeyQuery({
                    pubkey: pubkey.hex,
                    from: jid.toString(),
                }),
            )
            const result = await iqCaller.request(publishPubkeyQueryXml)
            log.info('publishPublicKey', result)
            const setPubsubNodeConfigQueryXml = xmlUtils.buildQuery(
                new SetPubsubNodeConfigQuery({
                    from: jid.toString(),
                }),
            )
            await iqCaller.request(setPubsubNodeConfigQueryXml)
        } catch (error) {
            log.error('publishPublicKey', error)
            throw new Error('errors.unknown-error')
        }
    }

    async publishNotificationToken(token: string) {
        try {
            const { iqCaller, jid } = this.getQueryProperties()
            const publishNotificationTokenQueryXml = xmlUtils.buildQuery(
                new PublishNotificationTokenQuery({
                    token,
                    from: jid.toString(),
                }),
            )
            const result = await iqCaller.request(
                publishNotificationTokenQueryXml,
            )
            log.info('publishNotificationToken result', result)
        } catch (error) {
            log.error('publishNotificationToken', error)
            throw new Error('errors.unknown-error')
        }
    }

    async addAdminToGroup(
        groupId: string,
        member: ChatMember,
    ): Promise<ChatMember> {
        try {
            const { iqCaller, jid } = this.getQueryProperties()
            const grantVoiceQueryXml = xmlUtils.buildQuery(
                new SetMemberAffiliationQuery({
                    from: jid.toString(),
                    to: `${groupId}@muc.${jid.getDomain()}`,
                    memberJid: member.id,
                    affiliation: XmppMemberAffiliation.member,
                }),
            )
            await iqCaller.request(grantVoiceQueryXml)
            return member
        } catch (error) {
            log.error('addAdminToGroup', error)
            throw new Error('errors.unknown-error')
        }
    }

    async generateUniqueGroupId() {
        try {
            const { iqCaller, jid } = this.getQueryProperties()
            const uniqeRoomNameXml = xmlUtils.buildQuery(
                new UniqueRoomNameQuery({
                    to: `muc.${jid.getDomain()}`,
                }),
            )
            const response = await iqCaller.request(uniqeRoomNameXml)
            const groupId = response.getChildText('unique') as string
            if (!groupId) throw new Error('Missing group ID from response')
            return groupId
        } catch (err) {
            log.error('generateUniqueGroupId', err)
            throw new Error('errors.unknown-error')
        }
    }

    async enterGroup(groupId: string): Promise<Element[]> {
        return new Promise((resolve, reject) => {
            try {
                const { jid } = this.getQueryProperties()
                const fromUser = jid.toString()
                const toGroup = `${groupId}@muc.${jid.getDomain()}`

                const enterMucRoomPresence = xmlUtils.buildPresence(
                    new EnterMucRoomPresence({
                        from: fromUser,
                        toGroup,
                    }),
                )

                const onStanzaReceived = async (stanza: Element) => {
                    if (
                        !stanza.is('presence') ||
                        stanza.getAttr('id') !==
                            enterMucRoomPresence.getAttr('id')
                    )
                        return

                    // Receive a registration response from the server
                    const result = stanza.getChild('x')
                    const statusResults = result?.getChildren('status')
                    if (!statusResults || !statusResults.length) {
                        reject(
                            new Error('No status results from presence stanza'),
                        )
                    } else {
                        resolve(statusResults)
                    }
                    this.xmpp.removeListener('stanza', onStanzaReceived)
                }
                this.xmpp.on('stanza', onStanzaReceived)

                this.xmpp.send(enterMucRoomPresence).catch(reject)
            } catch (err) {
                log.error('enterGroup', err)
                reject(new Error('errors.unknown-error'))
            }
        })
    }

    async configureGroup(
        groupId: string,
        updatedName: string,
        broadcastOnly?: boolean,
    ): Promise<void> {
        try {
            const { iqCaller, jid } = this.getQueryProperties()
            const roomConfigQueryXml = xmlUtils.buildQuery(
                new SetRoomConfigQuery({
                    roomName: updatedName,
                    from: jid.toString(),
                    to: `${groupId}@muc.${jid.getDomain()}`,
                    moderatedRoom: broadcastOnly || false,
                }),
            )
            await iqCaller.request(roomConfigQueryXml)
        } catch (error) {
            log.error('changeMucRoomName', error)
            if (
                (error as StanzaError) &&
                (error as StanzaError).name === 'StanzaError' &&
                (error as StanzaError).type === 'auth' &&
                (error as StanzaError).condition === 'forbidden'
            ) {
                throw new Error('errors.only-group-owners-can-change-name')
            }
            throw new Error('errors.unknown-error')
        }
    }

    async joinGroup(groupId: string): Promise<ChatGroup> {
        try {
            const res = await this.enterGroup(groupId)
            if (res.find(status => status.getAttr('code') === '110')) {
                const config = await this.fetchGroupConfig(groupId)
                if (!config.name) {
                    throw new Error('Group does not exist')
                }
                return { id: groupId, joinedAt: Date.now(), ...config }
            } else {
                throw new Error('Failed to join group')
            }
        } catch (err) {
            log.error('joinGroup', err)
            throw new Error('errors.invalid-group-code')
        }
    }

    async createGroup(
        groupId: string,
        groupName: string,
        broadcastOnly?: boolean,
    ): Promise<ChatGroup> {
        try {
            const res = await this.enterGroup(groupId)
            if (res.find(status => status.getAttr('code') === '201')) {
                await this.configureGroup(groupId, groupName, broadcastOnly)
                return {
                    id: groupId,
                    name: groupName,
                    joinedAt: Date.now(),
                    broadcastOnly: !!broadcastOnly,
                }
            } else {
                throw new Error('Group already exists')
            }
        } catch (err) {
            log.error('joinGroup', err)
            throw new Error('errors.unknown-error')
        }
    }

    async leaveGroup(groupId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const { jid } = this.getQueryProperties()
                const leaveRoomPresence = xmlUtils.buildQuery(
                    new LeaveMucRoomPresence({
                        from: jid.toString(),
                        toGroup: `${groupId}@muc.${jid.getDomain()}`,
                    }),
                )

                const onStanzaReceived = async (stanza: Element) => {
                    if (
                        !stanza.is('presence') ||
                        stanza.getAttr('id') !== leaveRoomPresence.getAttr('id')
                    )
                        return

                    // Receive a registration response from the server
                    const result = stanza.getChild('x')
                    const statusResults = result?.getChildren('status')
                    const didLeave = statusResults?.find(
                        s => s.getAttr('code') === '110',
                    )
                    if (!didLeave) {
                        reject(new Error('No status 110 from presence stanza'))
                    } else {
                        resolve()
                    }
                    this.xmpp.removeListener('stanza', onStanzaReceived)
                }
                this.xmpp.on('stanza', onStanzaReceived)

                this.xmpp.send(leaveRoomPresence).catch(reject)
            } catch (err) {
                log.error('leaveGroup', err)
                throw new Error('errors.unknown-error')
            }
        })
    }

    async fetchGroupConfig(
        groupId: string,
    ): Promise<Pick<ChatGroup, 'name' | 'broadcastOnly'>> {
        try {
            const { iqCaller, jid } = this.getQueryProperties()
            const roomConfigQueryXml = xmlUtils.buildQuery(
                new GetRoomConfigQuery({
                    from: jid.toString(),
                    to: `${groupId}@muc.${jid.getDomain()}`,
                }),
            )
            const result = await iqCaller.request(roomConfigQueryXml)
            log.info('fetchMucRoomConfig', result)

            const fields = result.getChild('query')?.getChild('x')
            const features = result.getChild('query')?.getChildren('feature')
            const name =
                fields
                    ?.getChildByAttr('var', 'muc#roomconfig_roomname')
                    ?.getChildText('value') || ''
            const moderated = features?.find(
                f => f.getAttr('var') === 'muc_moderated',
            )
            return { name, broadcastOnly: !!moderated }
        } catch (error) {
            log.error('fetchMucRoomConfig', error)
            throw new Error('errors.unknown-error')
        }
    }

    async removeAdminFromGroup(
        groupId: string,
        member: ChatMember,
    ): Promise<ChatMember> {
        try {
            const { iqCaller, jid } = this.getQueryProperties()
            const revokeVoiceQueryXml = xmlUtils.buildQuery(
                new SetMemberAffiliationQuery({
                    from: jid.toString(),
                    to: `${groupId}@muc.${jid.getDomain()}`,
                    memberJid: member.id,
                    affiliation: XmppMemberAffiliation.none,
                }),
            )
            await iqCaller.request(revokeVoiceQueryXml)
            return member
        } catch (error) {
            log.error('removeAdminFromGroup', error)
            throw new Error('errors.unknown-error')
        }
    }

    async sendDirectMessage(
        recipientId: string,
        recipientPubkey: string,
        message: ChatMessage,
        senderKeys: Keypair,
        updatePayment: boolean,
        sendPushNotification?: boolean,
    ) {
        try {
            const { jid } = this.getQueryProperties()
            const fromJid = `${jid.getLocal()}@${jid.getDomain()}`

            const encrypedDirectChatMessageXml = xmlUtils.buildMessage(
                new EncryptedDirectChatMessage({
                    from: fromJid,
                    to: recipientId,
                    message: this.formatOutgoingMessage(message),
                    senderKeys,
                    recipientPublicKey: { hex: recipientPubkey },
                    updatePayment,
                    sendPushNotification,
                }),
            )

            await this.xmpp.send(encrypedDirectChatMessageXml)
        } catch (error) {
            log.error('sendDirectMessage', error)
            throw new Error('errors.unknown-error')
        }
    }

    async sendGroupMessage(group: Partial<ChatGroup>, message: ChatMessage) {
        return new Promise<void>((resolve, reject) => {
            try {
                const { jid } = this.getQueryProperties()
                const fromJid = jid.toString()
                const toGroup = `${group.id}@muc.${jid.getDomain()}`

                const groupChatMessageXml = xmlUtils.buildMessage(
                    new GroupChatMessage({
                        from: fromJid,
                        to: toGroup,
                        message: this.formatOutgoingGroupMessage(
                            message,
                            group,
                        ),
                    }),
                )

                const onStanzaReceived = async (stanza: Element) => {
                    if (
                        !stanza.is('message') ||
                        stanza.getAttr('id') !==
                            groupChatMessageXml.getAttr('id')
                    )
                        return

                    // Check for if the message has an error attached
                    const error = stanza.getChild('error')
                    if (error) {
                        const errorText = error.getChildText('text')
                        reject(new Error(errorText || 'errors.unknown-error'))
                    } else {
                        resolve()
                    }
                    this.xmpp.removeListener('stanza', onStanzaReceived)
                }
                this.xmpp.on('stanza', onStanzaReceived)

                this.xmpp.send(groupChatMessageXml).catch(reject)
            } catch (error) {
                log.error('sendGroupMessage', error)
                reject(new Error('errors.unknown-error'))
            }
        })
    }

    emit<TEventName extends keyof XmppChatClientEventMap>(
        eventName: TEventName,
        argument: XmppChatClientEventMap[TEventName],
    ) {
        this.emitter.emit(eventName, argument)
    }

    on<TEventName extends keyof XmppChatClientEventMap>(
        eventName: TEventName,
        handler: (argument: XmppChatClientEventMap[TEventName]) => void,
    ) {
        this.emitter.on(eventName, handler)
    }

    off<TEventName extends keyof XmppChatClientEventMap>(
        eventName: TEventName,
        handler: (argument: XmppChatClientEventMap[TEventName]) => void,
    ) {
        this.emitter.off(eventName, handler)
    }

    removeAllListeners(event?: keyof XmppChatClientEventMap) {
        this.emitter.removeAllListeners(event)
    }

    /*** Private methods ***/

    private handleStatus = (status: XmppStatus) => {
        this.emit('status', status)
    }

    private handleOnline = (address: JID) => {
        this.xmpp.send(xml('presence'))
        this.emit('online', address)
    }

    private handleElement = (element: Element) => {
        try {
            // this package does not fire the online event when a session is resumed
            // https://github.com/xmppjs/xmpp.js/tree/main/packages/stream-management
            // we need to wait a split second because this library does
            // not restore the JID until just after the resumed stanza is received
            if (element.is('resumed')) {
                const interval = setInterval(() => {
                    if (this.xmpp.jid) {
                        clearInterval(interval)
                        this.handleStatus('online')
                        this.handleOnline(this.xmpp.jid)
                    }
                }, 10)
            }
        } catch (err) {
            log.error('Error parsing XMPP element', element, err)
        }
    }

    private handleStanza = (stanza: Element) => {
        try {
            // Messages
            if (stanza.is('message')) {
                switch (stanza.getAttr('type')) {
                    // Handle incoming messages from GroupChat
                    case XMPP_MESSAGE_TYPES.GROUPCHAT: {
                        return this.handleIncomingGroupMessage(stanza)
                    }
                    // Handle incoming messages from DirectChat while online
                    case XMPP_MESSAGE_TYPES.CHAT: {
                        return this.handleIncomingDirectMessage(stanza)
                    }
                    // Handle incoming messages after subscribing to user
                    // public key for e2e encryption
                    case XMPP_MESSAGE_TYPES.HEADLINE: {
                        return this.handleSubscriptionEvent(stanza)
                    }
                }
                // Handle archive messages received while offline, typically
                // triggered by the fetchMessagesFromArchive hook
                if (
                    stanza
                        .getChild('result')
                        ?.getAttr('queryid')
                        .includes(GetMessagesQuery.id)
                ) {
                    return this.handleIncomingMessageHistory(stanza)
                }
            }

            // Presence
            if (stanza.is('presence')) {
                return this.handleIncomingPresence(stanza)
            }

            // Queries
            if (stanza.is('iq')) {
                if (stanza.getChild('query')?.getNS() === 'jabber:iq:roster') {
                    return this.handleIncomingRoster(stanza)
                }
            }
        } catch (err) {
            log.error('Error parsing XMPP stanza', stanza, err)
        }
    }

    private handleIncomingGroupMessage(stanza: Element) {
        // this message means the config of a group we have joined has been updated
        // https://xmpp.org/extensions/xep-0045.html#roomconfig-notify
        if (
            stanza.getChild('x')?.getChild('status')?.getAttr('code') === '104'
        ) {
            const from = stanza.getAttr('from')
            const [groupId] = from.split('@')
            return this.emit('groupUpdate', groupId)
        }

        const bodyText = stanza.getChildText('body')
        if (!bodyText) return

        const groupMessageJson = stanza.getChildText('gm')
        const parsedMessage = JSON.parse(groupMessageJson as string)
        if (!parsedMessage || !parsedMessage.content) return

        // Emit a 'message'
        this.emit('message', this.formatIncomingMessage(parsedMessage))

        // Emit a 'memberSeen' for the person who sent it in case we hadn't seen them before
        // MUC `from` is formatted differently than direct chat jids: [roomId]@[domain]/[memberName]
        const from = stanza.getAttr('from')
        if (from) {
            const fromJid = makeJid(from)
            const memberJid = makeJid(
                fromJid.getResource(),
                fromJid.getDomain().replace('muc.', ''),
                XMPP_RESOURCE,
            )
            this.emit('memberSeen', this.memberFromJid(memberJid.toString()))
        }
    }

    private handleIncomingDirectMessage(stanza: Element) {
        const { parsedMessage } = this.decryptAndParseIncomingMessage(stanza)
        if (!parsedMessage || !parsedMessage.content) return

        // Emit a 'message'
        this.emit('message', this.formatIncomingMessage(parsedMessage))

        // Emit a 'memberSeen' for the person who sent it in case we hadn't seen them before
        const jid = stanza.getAttr('from')
        if (jid) {
            this.emit('memberSeen', this.memberFromJid(jid))
        }
    }

    private handleSubscriptionEvent(stanza: Element) {
        const event = stanza.getChild('event')

        const items = event?.getChild('items')
        const nodeId = items?.getAttr('node') as string

        const publishedItem = items?.getChild('item')
        const publisherJid: string | undefined =
            publishedItem?.getAttr('publisher')
        if (!publisherJid) {
            log.warn('subscription event did not have jid', stanza)
            return
        }

        // if the node ID does not match the publisher username... this pubkey
        // was not published by Fedi source code...
        // do not overwrite the locally stored pubkey for this member
        // TODO: implement signature validation for authentication?
        const member = this.memberFromJid(publisherJid)
        if (!nodeId.includes(member.username)) {
            log.warn('node ID does not match the publisher username', stanza)
            return
        }

        const publicKeyHex = publishedItem?.getChildText('entry')
        if (!publicKeyHex) {
            log.warn('subscription event did not have pubkey', stanza)
            return
        }

        this.emit('memberSeen', {
            ...member,
            publicKeyHex,
        })
    }

    private handleIncomingMessageHistory(stanza: Element) {
        const result = stanza.getChild('result')
        const forwarded = result?.getChild('forwarded')
        const message = forwarded?.getChild('message')
        if (!message || message.getAttr('type') === 'error') return

        const { parsedMessage } = this.decryptAndParseIncomingMessage(message)
        if (!parsedMessage || !parsedMessage.content) return

        // Emit a 'message'
        this.emit('message', this.formatIncomingMessage(parsedMessage))

        // Emit a 'memberSeen' for the person who sent it in case we hadn't seen them before
        const jid = message.getAttr('from')
        if (jid) {
            this.emit('memberSeen', this.memberFromJid(jid))
        }
    }

    private handleIncomingRoster(stanza: Element) {
        const rosterItem = stanza.getChild('query')?.getChild('item')
        if (!rosterItem) return

        const jid = rosterItem?.getAttr('jid')
        if (jid) {
            this.emit('memberSeen', this.memberFromJid(jid))
        }
    }

    private handleIncomingPresence(stanza: Element) {
        log.debug('handleIncomingPresence', stanza.toString())
        const groupId = stanza.getAttr('from')?.split('@')[0]
        if (!groupId) return

        // Emit role updates for presence updates about ourselves
        const item = stanza.getChild('x')?.getChild('item')
        if (!item) return

        const myJid = this.xmpp.jid?.toString()
        const itemJid = item.getAttr('jid')
        if (!myJid || !itemJid || jidToId(myJid) !== jidToId(itemJid)) return

        const role = stanza.getChild('x')?.getChild('item')?.getAttr('role')
        if (role) {
            this.emit('groupRole', { groupId, role })
        }
        const affiliation = stanza
            .getChild('x')
            ?.getChild('item')
            ?.getAttr('affiliation')
        if (affiliation) {
            this.emit('groupAffiliation', { groupId, affiliation })
        }
    }

    private handleError = (error: Error) => {
        log.error('xmpp error', error)
        this.emit('error', error)
    }

    private getQueryProperties() {
        const { iqCaller, jid } = this.xmpp
        if (!jid) throw new Error('No JID')
        return { iqCaller, jid }
    }

    private decryptAndParseIncomingMessage(message: Element) {
        let directMessageJson: string | null
        let action: Element | undefined
        const encrypted = message.getChild('encrypted')
        if (encrypted) {
            // First decrypt the payload
            const header = encrypted.getChild('header')
            const keys = header?.getChild('keys')
            const senderPublicKey = keys?.getChildText('key')
            if (!senderPublicKey) {
                throw new Error('Missing sender public key')
            }

            let encryptedPayloadContents = encrypted.getChildText('payload')

            const { privateKey, publicKey } = this.encryptionKeys

            // If we sent this message, decrypt the backup-payload
            // instead since we encrypted it to our own pubkey
            if (senderPublicKey === publicKey.hex) {
                encryptedPayloadContents =
                    encrypted.getChildText('backup-payload')
            }
            const decryptedPayload = encryptionUtils.decryptMessage(
                encryptedPayloadContents as string,
                { hex: senderPublicKey },
                privateKey,
            )

            const decryptedEnvelope = parse(decryptedPayload)
            const content = decryptedEnvelope.getChild('content')
            if (!content) {
                throw new Error('Missing content in decrypted envelope')
            }
            directMessageJson = content.getChildText('dm')
            action = content.getChild('action')
        } else {
            // TODO: remove this... only left it in case it helps with
            // backwards compatibility
            directMessageJson = message.getChildText('dm')
            action = message.getChild('action')
        }

        if (!directMessageJson) {
            throw new Error('Missing message JSON in message content')
        }

        // TODO: Validate the message matches the shape?
        const parsedMessage = JSON.parse(directMessageJson)
        return { parsedMessage, action }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private formatIncomingMessage(rawMessage: any): ChatMessage {
        const formatIncomingEntity = (
            sentEntity:
                | string
                | { id: string }
                | { jid: { _local: string; _domain: string } }
                | undefined,
        ) => {
            if (!sentEntity) return undefined
            if (typeof sentEntity === 'string') return sentEntity
            if ('id' in sentEntity) return sentEntity.id
            if ('jid' in sentEntity)
                return `${sentEntity.jid._local}@${sentEntity.jid._domain}`
        }

        const sentBy = formatIncomingEntity(rawMessage.sentBy)
        if (!sentBy) {
            throw new Error('Incoming message missing sentBy')
        }

        const payment = rawMessage.payment
            ? { ...rawMessage.payment }
            : undefined
        if (payment?.recipient) {
            payment.recipient = formatIncomingEntity(payment.recipient)
        }

        return {
            id: rawMessage.id,
            content: rawMessage.content,
            sentAt: rawMessage.sentAt,
            sentBy,
            sentTo: formatIncomingEntity(rawMessage.sentTo),
            sentIn: formatIncomingEntity(rawMessage.sentIn),
            payment,
        }
    }

    private formatOutgoingMessage(message: ChatMessage) {
        const idToJidMember = (id: string) => {
            const [_local, rest] = id.split('@')
            const [_domain] = (rest || '').split('/')
            return {
                jid: { _local, _domain },
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const outgoing: any = {
            ...message,
            sentBy: idToJidMember(message.sentBy),
        }
        if (message.sentTo) {
            outgoing.sentTo = idToJidMember(message.sentTo)
        }
        if (message.payment) {
            if (message.payment.recipient) {
                outgoing.payment = {
                    ...outgoing.payment,
                    recipient: idToJidMember(message.payment.recipient),
                }
            }
        }

        return outgoing
    }

    private formatOutgoingGroupMessage(
        message: ChatMessage,
        group: Partial<ChatGroup>,
    ) {
        return {
            ...this.formatOutgoingMessage(message),
            sentIn: {
                id: group.id,
                name: group.name,
            },
        }
    }

    private memberFromJid(jidString: string): ChatMember {
        const id = jidString.split('/')[0]
        return {
            id,
            username: id.split('@')[0],
        }
    }
}

/**
 * A simple manager of chat clients to allow for multi-federation chat handling.
 */
export class XmppChatClientManager {
    clients: Record<string, XmppChatClient | undefined> = {}

    getClient(federationId: string) {
        let client = this.clients[federationId]
        if (!client) {
            client = new XmppChatClient()
            this.clients[federationId] = client
        }
        return client
    }

    async destroyClient(federationId: string) {
        const client = this.clients[federationId]
        if (client) {
            delete this.clients[federationId]
            client.removeAllListeners()
            await client.stop()
        }
    }
}
