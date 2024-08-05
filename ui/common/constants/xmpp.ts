// The number of messages to return
/** @deprecated XMPP legacy code  */
export const XMPP_DEFAULT_PAGE_LIMIT = '20'

// The resource on the server designated for all chat operations...
// use cases for changing this are not clear so it is fixed for now
// https://xmpp.org/rfcs/rfc6120.html#bind
/** @deprecated XMPP legacy code  */
export const XMPP_RESOURCE = 'chat'

// Different types of <message> stanzas expected from the XMPP server
// ex: <message type="chat">...</message>
/** @deprecated XMPP legacy code  */
export const XMPP_MESSAGE_TYPES = {
    GROUPCHAT: 'groupchat',
    CHAT: 'chat',
    HEADLINE: 'headline',
} as const
