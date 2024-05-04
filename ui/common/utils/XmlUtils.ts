import { jid, xml } from '@xmpp/client'
import { JID } from '@xmpp/jid'
import { Element } from 'ltx'
import { randomBytes } from 'tweetnacl'
import { v4 as uuidv4 } from 'uuid'

import { Key, Keypair } from '@fedi/common/types'

import { XMPP_DEFAULT_PAGE_LIMIT } from '../constants/xmpp'
import { ArchiveQueryFilters, ArchiveQueryPagination } from '../types'
import encryptionUtils from './EncryptionUtils'

interface CommonXmppAttributes {
    from?: string
    to?: string
}

/** @deprecated XMPP legacy code */
export enum XmppMemberAffiliation {
    none = 'none',
    member = 'member',
    owner = 'owner',
}

/** @deprecated XMPP legacy code */
export enum XmppMemberRole {
    visitor = 'visitor',
    participant = 'participant',
    moderator = 'moderator',
}
type XmppArgs =
    | AddToRosterArgs
    | GetMessagesArgs
    | GetRoomConfigArgs
    | SetRoomConfigArgs
    | GetRosterArgs
    | EnterMucRoomArgs
    | GroupChatArgs
    | GetPublicKeyArgs
    | SetPubsubNodeConfigArgs
    | PublishPublicKeyArgs

class XmppStanza {
    tag!: string
    name!: string
    args?: XmppArgs
    build!: () => Element
}
class XmppMessage extends XmppStanza {
    tag = 'message'
}
class XmppPresence extends XmppStanza {
    tag = 'presence'
}

/** @deprecated XMPP legacy code */
export class XmppQuery extends XmppStanza {
    tag = 'iq'
}

/*
    XMPP Message stanzas
    XML with a top-level <message> tag
*/
interface Message {
    id?: string
    content: string
}
interface EncryptedDirectChatArgs extends CommonXmppAttributes {
    message: Message
    senderKeys: Keypair
    recipientPublicKey: Key
    updatePayment?: boolean
    sendPushNotification?: boolean
}
interface GroupChatArgs extends CommonXmppAttributes {
    message: Message
}
export class EncryptedDirectChatMessage extends XmppMessage {
    static id = 'sendEncryptedDirectChat'
    args: EncryptedDirectChatArgs
    constructor(args: EncryptedDirectChatArgs) {
        super()
        this.args = args
    }
    build = (): Element => {
        const {
            from,
            to,
            message,
            senderKeys,
            recipientPublicKey,
            updatePayment,
            sendPushNotification = true,
        } = this.args

        const attributes = {
            id: message.id,
            type: 'chat',
            from,
            to,
        }

        const bodyXml = xml(
            'body',
            { xmlns: 'jabber:client' },
            message.content as string,
        )

        const dmXml = xml(
            'dm',
            { xmlns: 'fedi:direct-message' },
            JSON.stringify(message),
        )

        const contentXml = xml('content', {}, bodyXml, dmXml)

        // This sends an updated message with payment to signal to the recipient
        // to take special action and update the existing payment
        if (updatePayment) {
            const actionXml = xml('action', { xmlns: 'fedi:update-payment' })
            contentXml.append(actionXml)
        }

        const randomPadding = randomBytes(
            Math.random() * (10 - 5) + 5,
        ).toString()
        const rpadXml = xml('rpad', {}, randomPadding)

        const fromXml = xml('from', { jid: from })

        const envelopeXml = xml(
            'envelope',
            { xmlns: 'urn:xmpp:sce:1' },
            contentXml,
            rpadXml,
            fromXml,
        )

        // Encrypt the payload with asymmetric keypair
        const encryptedEnvelope = encryptionUtils.encryptMessage(
            envelopeXml.toString(),
            recipientPublicKey,
            senderKeys.privateKey,
        )
        const payloadXml = xml('payload', {}, encryptedEnvelope)

        // Encrypt the same payload with sender keys so the sender can
        // decrypt message archives after recovering from seed
        const senderEncryptedEnvelope = encryptionUtils.encryptMessage(
            envelopeXml.toString(),
            senderKeys.publicKey,
            senderKeys.privateKey,
        )
        const backupPayloadXml = xml(
            'backup-payload',
            {},
            senderEncryptedEnvelope,
        )

        // Add the sender's pubkey to the message (unencrypted)
        // for convenience
        const keysXml = xml(
            'keys',
            { jid: from },
            xml('key', {}, senderKeys.publicKey.hex),
        )
        const headerXml = xml('header', { sid: 'empty' }, keysXml)

        // Wrap header and payload into <encrypted> OMEMO element
        const encryptedXml = xml(
            'encrypted',
            { xmlns: 'urn:xmpp:omemo:2' },
            headerXml,
            payloadXml,
            backupPayloadXml,
        )

        // Add placeholder body so server recognizes it for mam archives
        // and so it can used to specify whether a push notification should
        // be sent or not so it can be filtered out by the fpush service
        const placeholderBodyXml = xml(
            'body',
            {
                xmlns: 'jabber:client',
                // this field is not XMPP-specific, just our own descriptor
                purpose: 'sendPushNotification',
            },
            sendPushNotification ? 'true' : 'false',
        )

        return xml(this.tag, attributes, placeholderBodyXml, encryptedXml)
    }
}
/** @deprecated XMPP legacy code */
export class GroupChatMessage extends XmppMessage {
    static id = 'sendGroupChat'
    args: GroupChatArgs
    constructor(args: GroupChatArgs) {
        super()
        this.args = args
    }
    build = (): Element => {
        const { from, to, message } = this.args

        const attributes = {
            id: message.id,
            type: 'groupchat',
            from,
            to,
        }

        const bodyXml = xml(
            'body',
            { xmlns: 'jabber:client' },
            message.content as string,
        )

        const gmXml = xml(
            'gm',
            { xmlns: 'fedi:group-message' },
            JSON.stringify(message),
        )

        return xml(this.tag, attributes, bodyXml, gmXml)
    }
}

/*
    XMPP Presence stanzas
    XML with a top-level <presence> tag
*/
export interface EnterMucRoomArgs extends CommonXmppAttributes {
    toGroup: string
}
export class EnterMucRoomPresence extends XmppPresence {
    static id = 'enterMucRoom'
    args: EnterMucRoomArgs
    constructor(args: EnterMucRoomArgs) {
        super()
        this.args = args
    }
    build = (): Element => {
        const { from, toGroup } = this.args
        const fromJid: JID = jid(from as string)
        const memberNickname = fromJid.local
        const attributes = {
            from,
            to: `${toGroup}/${memberNickname}`,
            id: `${EnterMucRoomPresence.id}-${uuidv4()}`,
        }

        return xml(
            this.tag,
            attributes,
            xml('x', {
                xmlns: 'http://jabber.org/protocol/muc',
            }),
        )
    }
}

export interface LeaveMucRoomArgs extends CommonXmppAttributes {
    toGroup: string
}

/** @deprecated XMPP legacy code */
export class LeaveMucRoomPresence extends XmppPresence {
    static id = 'leaveMucRoom'
    args: LeaveMucRoomArgs
    constructor(args: LeaveMucRoomArgs) {
        super()
        this.args = args
    }
    build = (): Element => {
        const { from, toGroup } = this.args
        const fromJid: JID = jid(from as string)
        const memberNickname = fromJid.local
        const attributes = {
            from,
            to: `${toGroup}/${memberNickname}`,
            id: `${LeaveMucRoomPresence.id}-${uuidv4()}`,
            type: 'unavailable',
        }

        return xml(this.tag, attributes)
    }
}

/*
    XMPP Query stanzas
    XML with a top-level <iq> tag
*/
interface AddToRosterArgs extends CommonXmppAttributes {
    newRosterItem: string
}
interface GetMembersListArgs extends CommonXmppAttributes {
    // can be either 'moderator' or 'visitor'
    // moderators can send messages in broadcast-only groups
    // but visitors cannot
    role: XmppMemberRole
}
type GetMessagesArgs = {
    filters?: ArchiveQueryFilters | null
    pagination?: ArchiveQueryPagination | null
}
type GetRoomConfigArgs = CommonXmppAttributes
type GetRosterArgs = CommonXmppAttributes
type GetPublicKeyArgs = CommonXmppAttributes
interface PublishPublicKeyArgs extends CommonXmppAttributes {
    pubkey: string
}
interface SetMemberAffiliationArgs extends CommonXmppAttributes {
    memberJid: string
    affiliation: string
}
type SetPubsubNodeConfigArgs = CommonXmppAttributes
interface SetRoomConfigArgs extends CommonXmppAttributes {
    roomName: string
    moderatedRoom?: boolean
}
type UniqueRoomNameArgs = CommonXmppAttributes

/** @deprecated XMPP legacy code */
export class AddToRosterQuery extends XmppQuery {
    static id = 'addToRoster'
    args: AddToRosterArgs
    constructor(args: AddToRosterArgs) {
        super()
        this.args = args
    }
    build = (): Element => {
        const { from, newRosterItem } = this.args

        const attributes = {
            id: `${AddToRosterQuery.id}-${uuidv4()}`,
            from,
            type: 'set',
        }

        const queryBodyXml = xml(
            'query',
            {
                xmlns: 'jabber:iq:roster',
            },
            xml('item', {
                jid: newRosterItem,
            }),
        )

        return xml(this.tag, attributes, queryBodyXml)
    }
}

/** @deprecated XMPP legacy code */
export class GetMembersListQuery extends XmppQuery {
    static id = 'getMembersList'
    args: GetMembersListArgs
    constructor(args: GetMembersListArgs) {
        super()
        this.args = args
    }
    build = (): Element => {
        // fetch visitors by default
        const { from, to, role = 'visitor' } = this.args

        const attributes = {
            id: `${GetMembersListQuery.id}-${uuidv4()}`,
            from,
            to,
            type: 'get',
        }

        return xml(
            this.tag,
            attributes,
            xml(
                'query',
                {
                    xmlns: 'http://jabber.org/protocol/muc#admin',
                },
                xml('item', { role }),
            ),
        )
    }
}

/** @deprecated XMPP legacy code */
export class GetMessagesQuery extends XmppQuery {
    static id = 'getMessages'
    args: GetMessagesArgs
    constructor(args: GetMessagesArgs) {
        super()
        this.args = args
    }
    build = (): Element => {
        const { filters, pagination } = this.args

        const attributes = {
            id: `${GetMessagesQuery.id}-${uuidv4()}`,
            type: 'set',
        }

        const filterQuery = filters?.withJid
            ? xml(
                  'x',
                  {
                      xmlns: 'jabber:x:data',
                      type: 'submit',
                  },
                  xml(
                      'field',
                      { var: 'FORM_TYPE', type: 'hidden' },
                      xml('value', {}, 'urn:xmpp:mam:2'),
                  ),
                  xml(
                      'field',
                      { var: 'with' },
                      xml('value', {}, filters.withJid),
                  ),
              )
            : xml('x')

        const paginationQuery = pagination?.after
            ? xml(
                  'set',
                  { xmlns: 'http://jabber.org/protocol/rsm' },
                  xml('max', {}, pagination?.limit || XMPP_DEFAULT_PAGE_LIMIT),
                  xml('after', {}, pagination?.after),
              )
            : xml(
                  'set',
                  { xmlns: 'http://jabber.org/protocol/rsm' },
                  xml('max', {}, pagination?.limit || XMPP_DEFAULT_PAGE_LIMIT),
              )

        return xml(
            this.tag,
            attributes,
            xml(
                'query',
                {
                    xmlns: 'urn:xmpp:mam:2',
                    queryid: GetMessagesQuery.id,
                },
                filterQuery,
                paginationQuery,
            ),
        )
    }
}

/** @deprecated XMPP legacy code */
export class GetRoomConfigQuery extends XmppQuery {
    static id = 'getRoomConfig'
    args: GetRoomConfigArgs
    constructor(args: GetRoomConfigArgs) {
        super()
        this.args = args
    }
    build = (): Element => {
        const { from, to } = this.args

        const attributes = {
            id: `${GetRoomConfigQuery.id}-${uuidv4()}`,
            from,
            to,
            type: 'get',
        }

        const queryBodyXml = xml('query', {
            xmlns: 'http://jabber.org/protocol/disco#info',
        })

        return xml(this.tag, attributes, queryBodyXml)
    }
}

/** @deprecated XMPP legacy code */
export class GetRosterQuery extends XmppQuery {
    static id = 'getRoster'
    args: GetRosterArgs
    constructor(args: GetRosterArgs) {
        super()
        this.args = args
    }
    build = (): Element => {
        const { from } = this.args

        const attributes = {
            id: `${GetRosterQuery.id}-${uuidv4()}`,
            from,
            type: 'get',
        }

        const queryBodyXml = xml('query', {
            xmlns: 'jabber:iq:roster',
        })
        return xml(this.tag, attributes, queryBodyXml)
    }
}

/** @deprecated XMPP legacy code */
export class GetPublicKeyQuery extends XmppQuery {
    // This subscribes to a given member's pubsub service that stores
    // their latest public key used for end-to-end encryption
    static id = 'getPublicKey'
    args: GetPublicKeyArgs
    constructor(args: GetPublicKeyArgs) {
        super()
        this.args = args
    }
    build = (): Element => {
        const { from, to } = this.args
        const toJid: JID = jid(to as string)
        const nodeService = toJid.bare().toString()
        const nodeId = `${toJid.local}:::pubkey`

        const attributes = {
            id: `${GetPublicKeyQuery.id}-${uuidv4()}`,
            from,
            to: nodeService,
            type: 'set',
        }

        const subscribeXml = xml('subscribe', {
            node: nodeId,
            jid: from,
        })

        const pubsubXml = xml(
            'pubsub',
            {
                xmlns: 'http://jabber.org/protocol/pubsub',
            },
            subscribeXml,
        )

        return xml(this.tag, attributes, pubsubXml)
    }
}
export class PublishPublicKeyQuery extends XmppQuery {
    // This publishes the user's pubkey to a pubsub node service auto-created by the
    // Prosody server pep module as per XEP-163. Defaults to a presence access model
    // so we must then reconfigure it later to use an open access model
    static id = 'publishPublicKey'
    args: PublishPublicKeyArgs
    constructor(args: PublishPublicKeyArgs) {
        super()
        this.args = args
    }
    build = (): Element => {
        const { pubkey, from } = this.args
        const fromJid: JID = jid(from as string)
        const nodeId = `${fromJid.local}:::pubkey`

        const attributes = {
            id: `${PublishPublicKeyQuery.id}-${uuidv4()}`,
            from,
            type: 'set',
        }

        const entryXml = xml('entry', {}, pubkey)
        const itemXml = xml('item', { id: 'latest-pubkey' }, entryXml)

        const publishXml = xml(
            'publish',
            {
                node: nodeId,
            },
            itemXml,
        )

        const pubsubXml = xml(
            'pubsub',
            {
                xmlns: 'http://jabber.org/protocol/pubsub',
            },
            publishXml,
        )

        return xml(this.tag, attributes, pubsubXml)
    }
}
export class SetMemberAffiliationQuery extends XmppQuery {
    static id = 'setMemberAffiliation'
    args: SetMemberAffiliationArgs
    constructor(args: SetMemberAffiliationArgs) {
        super()
        this.args = args
    }
    build = (): Element => {
        const { from, to, memberJid, affiliation } = this.args

        const attributes = {
            id: `${SetMemberAffiliationQuery.id}-${uuidv4()}`,
            from,
            to,
            type: 'set',
        }

        return xml(
            this.tag,
            attributes,
            xml(
                'query',
                {
                    xmlns: 'http://jabber.org/protocol/muc#admin',
                },
                xml('item', { affiliation, jid: memberJid }),
            ),
        )
    }
}
export class SetPubsubNodeConfigQuery extends XmppQuery {
    static id = 'setPubsubNodeConfig'
    // This configures the pubsub node that stores this user's pubkey to allow
    // access to anyone who requests / subscribes to it
    args: SetPubsubNodeConfigArgs
    constructor(args: SetPubsubNodeConfigArgs) {
        super()
        this.args = args
    }
    build = (): Element => {
        const { from } = this.args
        const fromJid: JID = jid(from as string)
        const nodeService = fromJid.bare().toString()
        const nodeId = `${fromJid.local}:::pubkey`

        const attributes = {
            id: `${SetPubsubNodeConfigQuery.id}-${uuidv4()}`,
            from,
            to: nodeService,
            type: 'set',
        }

        const formTypeFieldXml = xml(
            'field',
            { var: 'FORM_TYPE', type: 'hidden' },
            xml('value', {}, 'http://jabber.org/protocol/pubsub#node_config'),
        )

        const accessModelFieldXml = xml(
            'field',
            {
                var: 'pubsub#access_model',
            },
            xml('value', {}, 'open'),
        )

        const fieldsXml = xml(
            'x',
            {
                xmlns: 'jabber:x:data',
                type: 'submit',
            },
            formTypeFieldXml,
            accessModelFieldXml,
        )

        const configureXml = xml(
            'configure',
            {
                node: nodeId,
            },
            fieldsXml,
        )

        const pubsubXml = xml(
            'pubsub',
            {
                xmlns: 'http://jabber.org/protocol/pubsub#owner',
            },
            configureXml,
        )

        return xml(this.tag, attributes, pubsubXml)
    }
}
export class SetRoomConfigQuery extends XmppQuery {
    static id = 'setRoomConfig'
    args: SetRoomConfigArgs
    constructor(args: SetRoomConfigArgs) {
        super()
        this.args = args
    }
    build = (): Element => {
        const { moderatedRoom, roomName = '', from, to } = this.args

        const attributes = {
            id: `${SetRoomConfigQuery.id}-${uuidv4()}`,
            from,
            to,
            type: 'set',
        }

        // make sure the room remains persistent
        const persistenceFieldXml = xml(
            'field',
            {
                var: 'muc#roomconfig_persistentroom',
            },
            xml('value', {}, '1'),
        )

        let roomNameFieldXml, moderationFieldXml, preventPresenceXml
        if (roomName) {
            roomNameFieldXml = xml(
                'field',
                {
                    var: 'muc#roomconfig_roomname',
                },
                xml('value', {}, roomName),
            )
        }
        if (moderatedRoom) {
            // moderated rooms are "broadcast-only" so users can receive but not
            // send messages unless they are granted "voice"
            moderationFieldXml = xml(
                'field',
                {
                    var: 'muc#roomconfig_moderatedroom',
                },
                xml('value', {}, '1'),
            )
            // broadcast-only rooms should only send presence for users who can
            // send messages
            preventPresenceXml = xml(
                'field',
                {
                    var: 'muc#roomconfig_presencebroadcast',
                },
                xml('value', {}, 'moderator'),
                xml('value', {}, 'participant'),
            )
        }

        const queryBodyXml = xml(
            'query',
            {
                xmlns: 'http://jabber.org/protocol/muc#owner',
            },
            xml(
                'x',
                {
                    xmlns: 'jabber:x:data',
                    type: 'submit',
                },
                xml(
                    'field',
                    { var: 'FORM_TYPE' },
                    xml(
                        'value',
                        {},
                        'http://jabber.org/protocol/muc#roomconfig',
                    ),
                ),
                persistenceFieldXml,
                // Don't love this conditional logic, but this xml library is
                // not very Typescipt-friendly and not sure how to do variable
                // length function parameters with custom typings?
                ...(roomNameFieldXml ? [roomNameFieldXml] : []),
                ...(moderationFieldXml ? [moderationFieldXml] : []),
                ...(preventPresenceXml ? [preventPresenceXml] : []),
            ),
        )

        return xml(this.tag, attributes, queryBodyXml)
    }
}
export class UniqueRoomNameQuery extends XmppQuery {
    static id = 'uniqueRoomName'
    args: UniqueRoomNameArgs
    constructor(args: UniqueRoomNameArgs) {
        super()
        this.args = args
    }
    build = (): Element => {
        const { to } = this.args
        const attributes = {
            type: 'get',
            to,
            id: `${UniqueRoomNameQuery.id}-${uuidv4()}`,
        }

        return xml(
            this.tag,
            attributes,
            xml('unique', {
                xmlns: 'http://jabber.org/protocol/muc#unique',
            }),
        )
    }
}

class XmlUtils {
    buildPresence(presence: XmppPresence): Element {
        return presence.build()
    }
    buildQuery(query: XmppQuery): Element {
        return query.build()
    }
    buildMessage(message: XmppMessage): Element {
        return message.build()
    }
}

const xmlUtils = new XmlUtils()
export default xmlUtils
