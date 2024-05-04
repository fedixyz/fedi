// The number of messages to return
export const XMPP_DEFAULT_PAGE_LIMIT = '20'

// The resource on the server designated for all chat operations...
// use cases for changing this are not clear so it is fixed for now
// https://xmpp.org/rfcs/rfc6120.html#bind
export const XMPP_RESOURCE = 'chat'

// Different types of <message> stanzas expected from the XMPP server
// ex: <message type="chat">...</message>
export const XMPP_MESSAGE_TYPES = {
    GROUPCHAT: 'groupchat',
    CHAT: 'chat',
    HEADLINE: 'headline',
} as const

// Used to configure push notifications on XMPP server with mod_cloud_notify
// this comes from the Firebase Cloud Messaging console
// https://console.firebase.google.com/project/fedi-xmpp-chat-notifications/settings/cloudmessaging
export const FIREBASE_SENDER_ID = `472796529807`
// this should be the production URL listed here:
// https://firebase.google.com/docs/cloud-messaging/xmpp-server-ref
export const XMPP_PUSH_SERVICE_MODULE = `fediAlpha`
