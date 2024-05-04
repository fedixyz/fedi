import { Keypair } from '@fedi/common/types'

import { XMPP_DEFAULT_PAGE_LIMIT } from '../../constants/xmpp'
import { ArchiveQueryFilters, ArchiveQueryPagination } from '../../types'
import xmlUtils, {
    AddToRosterQuery,
    EncryptedDirectChatMessage,
    EnterMucRoomPresence,
    GetMessagesQuery,
    GetPublicKeyQuery,
    GetRoomConfigQuery,
    GetRosterQuery,
    GroupChatMessage,
    PublishPublicKeyQuery,
    SetPubsubNodeConfigQuery,
    SetRoomConfigQuery,
    UniqueRoomNameQuery,
} from '../../utils/XmlUtils'

jest.mock('../../constants/xmpp', () => ({
    XMPP_DEFAULT_PAGE_LIMIT: 10,
}))

describe('buildPresence: EnterMucRoom', () => {
    const memberNickname = 'fromjid'
    const from = `${memberNickname}@domain`
    const toGroup = 'group-id@muc.domain.com'

    it('response contains the correct values and attributes', () => {
        const result = xmlUtils.buildPresence(
            new EnterMucRoomPresence({ from, toGroup }),
        )
        const stringified = result.toString()

        const toValue = `${toGroup}/${memberNickname}`

        expect(stringified).toContain(from)
        expect(stringified).toContain(toValue)

        const presenceId = result.getAttr('id')
        const presenceTo = result.getAttr('to')
        const xElement = result.getChild('x')
        const xElementNamespace = xElement?.getAttr('xmlns')

        expect(presenceId).toContain(EnterMucRoomPresence.id)
        expect(presenceTo).toBe(toValue)
        expect(xElementNamespace).toBe('http://jabber.org/protocol/muc')
    })
})

describe('buildMessage: GroupChatMessage', () => {
    const toGroup = 'groupid@muc.domain.com'

    it('response contains all of the provided values', () => {
        const result = xmlUtils.buildMessage(
            new GroupChatMessage({
                from: 'fromjid@domain',
                to: toGroup,
                message: {
                    id: 'group-chat-message-uuid',
                    content: 'This is a test message',
                },
            }),
        )
        const fromAttr = result.getAttr('from')
        const toAttr = result.getAttr('to')
        const body = result.getChild('body')?.getText()

        expect(fromAttr).toEqual('fromjid@domain')
        expect(toAttr).toEqual(toGroup)
        expect(body).toEqual('This is a test message')
    })

    it('response contains the message ID', () => {
        const result = xmlUtils.buildMessage(
            new GroupChatMessage({
                from: 'fromjid@domain',
                to: toGroup,
                message: {
                    id: 'group-chat-message-uuid',
                    content: 'This is a test message',
                },
            }),
        )
        const messageId = result.getAttr('id')

        expect(messageId).toContain('group-chat-message-uuid')
    })
})

describe('buildQuery: EncryptedDirectChatMessage', () => {
    const testMessage = {
        id: 'test-id',
        content: 'Test message',
    }

    const testKeypair: Keypair = {
        publicKey: {
            hex: '0000000000000000000000000000000000000000000000000000000000000000',
        },
        privateKey: {
            hex: '1111111111111111111111111111111111111111111111111111111111111111',
        },
    }

    const testRecipientPublicKey = {
        hex: '2222222222222222222222222222222222222222222222222222222222222222',
    }

    describe.each([true, false])('updatePayment: %s', updatePayment => {
        const encryptedDirectChatMessage = new EncryptedDirectChatMessage({
            from: 'test_sender@domain.com',
            to: 'test_recipient@domain.com',
            message: testMessage,
            senderKeys: testKeypair,
            recipientPublicKey: testRecipientPublicKey,
            updatePayment,
        })
        const encryptedDmWithoutPushNotification =
            new EncryptedDirectChatMessage({
                from: 'test_sender@domain.com',
                to: 'test_recipient@domain.com',
                message: testMessage,
                senderKeys: testKeypair,
                recipientPublicKey: testRecipientPublicKey,
                updatePayment,
                sendPushNotification: false,
            })

        it('response contains correct id, type, from, and to attributes', () => {
            const result = xmlUtils.buildQuery(encryptedDirectChatMessage)
            const idAttr = result.getAttr('id')
            const typeAttr = result.getAttr('type')
            const fromAttr = result.getAttr('from')
            const toAttr = result.getAttr('to')

            expect(idAttr).toBe(testMessage.id)
            expect(typeAttr).toBe('chat')
            expect(fromAttr).toBe('test_sender@domain.com')
            expect(toAttr).toBe('test_recipient@domain.com')
        })

        it('response contains placeholder body element', () => {
            const result = xmlUtils.buildQuery(encryptedDirectChatMessage)
            const body = result.getChild('body')
            expect(body).toBeTruthy()
            expect(body?.getText()).toBe('true')

            const resultWithoutPush = xmlUtils.buildQuery(
                encryptedDmWithoutPushNotification,
            )
            const bodyWithoutPush = resultWithoutPush.getChild('body')
            expect(bodyWithoutPush).toBeTruthy()
            expect(bodyWithoutPush?.getText()).toBe('false')
        })

        it('response contains encrypted OMEMO element', () => {
            const result = xmlUtils.buildQuery(encryptedDirectChatMessage)
            const encrypted = result.getChild('encrypted')
            expect(encrypted).toBeTruthy()
            expect(encrypted?.getAttr('xmlns')).toBe('urn:xmpp:omemo:2')

            const header = encrypted?.getChild('header')
            const payload = encrypted?.getChild('payload')
            const backupPayload = encrypted?.getChild('backup-payload')

            expect(header).toBeTruthy()
            expect(payload).toBeTruthy()
            expect(backupPayload).toBeTruthy()
        })
    })
})

describe('buildQuery: AddToRosterQuery', () => {
    const testFrom = 'alice@xmpp.example.com'
    const testNewRosterItem = 'bob@xmpp.example.com'

    const addToRosterQuery = new AddToRosterQuery({
        from: testFrom,
        newRosterItem: testNewRosterItem,
    })

    const result = xmlUtils.buildQuery(addToRosterQuery)

    it('response contains provided from attribute and newRosterItem as jid attribute', () => {
        const fromAttr = result.getAttr('from')
        expect(fromAttr).toBe(testFrom)

        // Check for item element with jid attribute
        const queryChild = result.getChild('query')
        expect(queryChild).toBeTruthy()

        const itemChild = queryChild?.getChild('item')
        expect(itemChild).toBeTruthy()

        const jidAttr = itemChild?.getAttr('jid')
        expect(jidAttr).toBeTruthy()
        expect(jidAttr).toBe(testNewRosterItem)
    })

    it('response contains the correct query xmlns attribute', () => {
        const queryChild = result.getChild('query')
        expect(queryChild).toBeTruthy()

        const queryXmlns = queryChild?.getAttr('xmlns')
        expect(queryXmlns).toBe('jabber:iq:roster')
    })
})

describe('buildQuery: GetMessagesQuery', () => {
    it('response contains the correct ID and type attributes', () => {
        const args = { filters: null, pagination: null }
        const query = new GetMessagesQuery(args)
        const generatedXml = query.build()

        const id = generatedXml.getAttr('id')
        const type = generatedXml.getAttr('type')
        const queryElement = generatedXml.getChild('query')
        const setElement = queryElement?.getChild('set')

        expect(id).toContain(GetMessagesQuery.id)
        expect(type).toEqual('set')
        expect(setElement?.getAttr('xmlns')).toEqual(
            'http://jabber.org/protocol/rsm',
        )
        expect(setElement?.getChildText('max')).toEqual(
            XMPP_DEFAULT_PAGE_LIMIT.toString(),
        )
    })

    describe('response has correct XML for different combinations of filters and pagination', () => {
        it.each([null, '10'])('pagination.limit %s', paginationLimit => {
            const filters: ArchiveQueryFilters = {
                withJid: 'user@example.com',
            }
            const pagination: ArchiveQueryPagination = {
                limit: paginationLimit,
                after: 'abcd',
            }
            const query = new GetMessagesQuery({
                filters: filters,
                pagination: pagination,
            })
            const generatedXml = query.build()

            const id = generatedXml.getAttr('id')
            const type = generatedXml.getAttr('type')
            const queryElement = generatedXml.getChild('query')
            const xElement = queryElement?.getChild('x')
            const fieldFormElement = xElement?.getChildByAttr(
                'var',
                'FORM_TYPE',
            )
            const fieldWithElement = xElement?.getChildByAttr('var', 'with')
            const setElement = queryElement?.getChild('set')

            expect(id).toContain(GetMessagesQuery.id)
            expect(type).toEqual('set')
            expect(queryElement?.getAttr('xmlns')).toEqual('urn:xmpp:mam:2')
            expect(queryElement?.getAttr('queryid')).toEqual(
                GetMessagesQuery.id,
            )
            expect(xElement?.getAttr('xmlns')).toEqual('jabber:x:data')
            expect(xElement?.getAttr('type')).toEqual('submit')
            expect(fieldFormElement?.getAttr('type')).toEqual('hidden')
            expect(fieldFormElement?.getChildText('value')).toEqual(
                'urn:xmpp:mam:2',
            )
            expect(fieldWithElement?.getChildText('value')).toEqual(
                filters.withJid,
            )
            expect(setElement?.getAttr('xmlns')).toEqual(
                'http://jabber.org/protocol/rsm',
            )
            expect(setElement?.getChildText('after')).toEqual(pagination.after)

            if (paginationLimit) {
                expect(setElement?.getChildText('max')).toEqual(
                    pagination.limit,
                )
            } else {
                expect(setElement?.getChildText('max')).toEqual(
                    XMPP_DEFAULT_PAGE_LIMIT.toString(),
                )
            }
        })
    })
})

describe('buildQuery: GetRoomConfigQuery', () => {
    const testFrom = 'fromUser@xmpp.example.com'
    const testTo = 'toUser@xmpp.example.com'

    const getRoomConfigQuery = new GetRoomConfigQuery({
        from: testFrom,
        to: testTo,
    })

    const result = xmlUtils.buildQuery(getRoomConfigQuery)

    it('response contains provided values and correct attributes', () => {
        const idAttr = result.getAttr('id')
        const fromAttr = result.getAttr('from')
        const toAttr = result.getAttr('to')
        const typeAttr = result.getAttr('type')

        expect(idAttr).toContain(GetRoomConfigQuery.id)
        expect(fromAttr).toBe(testFrom)
        expect(toAttr).toBe(testTo)
        expect(typeAttr).toBe('get')
    })

    it('response contains the correct query xmlns attribute', () => {
        const queryChild = result.getChild('query')
        expect(queryChild).toBeTruthy()

        const queryXmlns = queryChild?.getAttr('xmlns')
        expect(queryXmlns).toBe('http://jabber.org/protocol/disco#info')
    })
})

describe('buildQuery: GetRosterQuery', () => {
    const testFrom = 'alice@xmpp.example.com'

    const getRosterQuery = new GetRosterQuery({
        from: testFrom,
    })

    const result = xmlUtils.buildQuery(getRosterQuery)

    it('response contains provided values and correct attributes', () => {
        const idAttr = result.getAttr('id')
        const fromAttr = result.getAttr('from')
        const typeAttr = result.getAttr('type')

        expect(idAttr).toBeTruthy()
        expect(fromAttr).toBeTruthy()
        expect(typeAttr).toBeTruthy()
        expect(idAttr).toContain(GetRosterQuery.id)
        expect(fromAttr).toBe(testFrom)
        expect(typeAttr).toBe('get')
    })

    it('response contains the correct query xmlns attribute', () => {
        const queryChild = result.getChild('query')
        expect(queryChild).toBeTruthy()

        const queryXmlns = queryChild?.getAttr('xmlns')
        expect(queryXmlns).toBe('jabber:iq:roster')
    })
})

describe('buildQuery: GetPublicKeyQuery', () => {
    const testFrom = 'alice@xmpp.example.com'
    const testTo = 'bob@xmpp.example.com'

    const getPublicKeyQuery = new GetPublicKeyQuery({
        from: testFrom,
        to: testTo,
    })

    const result = xmlUtils.buildQuery(getPublicKeyQuery)

    it('response contains provided from, id, and type attributes', () => {
        const fromAttr = result.getAttr('from')
        const idAttr = result.getAttr('id')
        const typeAttr = result.getAttr('type')

        expect(fromAttr).toBeTruthy()
        expect(fromAttr).toBe(testFrom)

        expect(idAttr).toBeTruthy()
        expect(idAttr.startsWith(GetPublicKeyQuery.id)).toBeTruthy()

        expect(typeAttr).toBeTruthy()
        expect(typeAttr).toBe('set')
    })

    it('response contains the correct pubsub xmlns attribute and contents', () => {
        const pubsubChild = result.getChild('pubsub')
        expect(pubsubChild).toBeTruthy()

        const pubsubXmlns = pubsubChild?.getAttr('xmlns')
        expect(pubsubXmlns).toBe('http://jabber.org/protocol/pubsub')

        const subscribeChild = pubsubChild?.getChild('subscribe')
        expect(subscribeChild).toBeTruthy()
        const subscribeNode = subscribeChild?.getAttr('node')
        const subscribeJid = subscribeChild?.getAttr('jid')
        expect(subscribeNode).toBe('bob:::pubkey')
        expect(subscribeJid).toBe(testFrom)
    })
})

describe('buildQuery: PublishPublicKeyQuery', () => {
    const testFrom = 'alice@xmpp.example.com'
    const testPubkey =
        '0000000000000000000000000000000000000000000000000000000000000000'

    const publishPublicKeyQuery = new PublishPublicKeyQuery({
        from: testFrom,
        pubkey: testPubkey,
    })

    const result = xmlUtils.buildQuery(publishPublicKeyQuery)
    const pubsubChild = result.getChild('pubsub')

    it('response contains provided from, id, and type attributes', () => {
        const fromAttr = result.getAttr('from')
        const idAttr = result.getAttr('id')
        const typeAttr = result.getAttr('type')

        expect(fromAttr).toBeTruthy()
        expect(fromAttr).toBe(testFrom)

        expect(idAttr).toBeTruthy()
        expect(idAttr.startsWith(PublishPublicKeyQuery.id)).toBeTruthy()

        expect(typeAttr).toBeTruthy()
        expect(typeAttr).toBe('set')
    })

    it('response contains the correct pubsub xmlns attribute', () => {
        expect(pubsubChild).toBeTruthy()

        const pubsubXmlns = pubsubChild?.getAttr('xmlns')
        expect(pubsubXmlns).toBe('http://jabber.org/protocol/pubsub')
    })

    it('response contains the provided pubkey value', () => {
        const publishChild = pubsubChild?.getChild('publish')
        expect(publishChild).toBeTruthy()
        const publishNode = publishChild?.getAttr('node')
        expect(publishNode).toBe('alice:::pubkey')

        const itemChild = publishChild?.getChild('item')
        const itemId = itemChild?.getAttr('id')
        expect(itemId).toBe('latest-pubkey')

        const entryChild = itemChild?.getChild('entry')
        const pubkeyValue = entryChild?.getText()
        expect(pubkeyValue).toBe(testPubkey)
    })
})

describe('buildQuery: SetPubsubNodeConfigQuery', () => {
    const testFrom = 'alice@xmpp.example.com'

    const setPubsubNodeConfigQuery = new SetPubsubNodeConfigQuery({
        from: testFrom,
    })

    const result = xmlUtils.buildQuery(setPubsubNodeConfigQuery)

    it('response contains provided from, id, and type attributes', () => {
        const fromAttr = result.getAttr('from')
        const idAttr = result.getAttr('id')
        const typeAttr = result.getAttr('type')

        expect(fromAttr).toBeTruthy()
        expect(fromAttr).toBe(testFrom)

        expect(idAttr).toBeTruthy()
        expect(idAttr.startsWith(SetPubsubNodeConfigQuery.id)).toBeTruthy()

        expect(typeAttr).toBeTruthy()
        expect(typeAttr).toBe('set')
    })

    it('response contains pubsub, configure, and x elements with correct attributes', () => {
        const pubsub = result.getChild('pubsub')
        const configure = pubsub?.getChild('configure')
        const x = configure?.getChild('x')

        expect(pubsub).toBeTruthy()
        expect(pubsub?.getAttr('xmlns')).toBe(
            'http://jabber.org/protocol/pubsub#owner',
        )

        expect(configure).toBeTruthy()
        expect(configure?.getAttr('node')).toBe('alice:::pubkey')

        expect(x).toBeTruthy()
        expect(x?.getAttr('xmlns')).toBe('jabber:x:data')
        expect(x?.getAttr('type')).toBe('submit')
    })

    it('response contains correct formTypeField and accessModelField with values', () => {
        const configure = result.getChild('pubsub')?.getChild('configure')
        const x = configure?.getChild('x')
        const formTypeField = x?.getChildByAttr('var', 'FORM_TYPE')
        const accessModelField = x?.getChildByAttr('var', 'pubsub#access_model')

        expect(formTypeField).toBeTruthy()
        expect(formTypeField?.getChildText('value')).toBe(
            'http://jabber.org/protocol/pubsub#node_config',
        )

        expect(accessModelField).toBeTruthy()
        expect(accessModelField?.getChildText('value')).toBe('open')
    })
})

describe('buildQuery: SetRoomConfig', () => {
    it('response contains all of the provided values', () => {
        const result = xmlUtils.buildQuery(
            new SetRoomConfigQuery({
                roomName: 'a new room name',
                from: 'fromjid@domain',
                to: 'tojid@domain',
            }),
        )
        const stringified = result.toString()

        expect(stringified).toContain('a new room name')
        expect(stringified).toContain('fromjid')
        expect(stringified).toContain('tojid')
    })
    it('response contains the correct query ID', () => {
        const result = xmlUtils.buildQuery(
            new SetRoomConfigQuery({
                roomName: 'a new room name',
                from: 'fromjid@domain',
                to: 'tojid@domain',
            }),
        )
        const queryId = result.getAttr('id')

        expect(queryId).toContain(SetRoomConfigQuery.id)
    })
})

describe('buildQuery: UniqueRoomNameQuery', () => {
    const mucDomain = 'muc.domain.com'
    const uniqueRoomNameQuery = new UniqueRoomNameQuery({ to: mucDomain })
    const result = xmlUtils.buildQuery(uniqueRoomNameQuery)

    it('response contains correct id, to, and type attributes', () => {
        const idAttr = result.getAttr('id')
        const toAttr = result.getAttr('to')
        const typeAttr = result.getAttr('type')

        expect(idAttr).toBeTruthy()
        expect(idAttr.startsWith(UniqueRoomNameQuery.id)).toBeTruthy()

        expect(toAttr).toBeTruthy()
        expect(toAttr).toBe(mucDomain)

        expect(typeAttr).toBeTruthy()
        expect(typeAttr).toBe('get')
    })

    it('response contains unique element with correct xmlns attribute', () => {
        const unique = result.getChild('unique')

        expect(unique).toBeTruthy()
        expect(unique?.getAttr('xmlns')).toBe(
            'http://jabber.org/protocol/muc#unique',
        )
    })
})
