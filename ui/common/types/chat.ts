import type { Status } from '@xmpp/connection'

import { RpcResponse } from './bindings'
import type { Invoice } from './fedimint'
import type { MSats } from './units'

export enum ChatType {
    direct = 'direct',
    group = 'group',
}

export enum ChatAffiliation {
    // This is the default affiliation granted to a member entering a MUC room
    // which determines their ability to send messages in a broadcast-only room
    none = 'none',
    member = 'member',
    owner = 'owner',
}
export enum ChatRole {
    // This is the default role granted to a member entering a MUC room
    // which determines their ability to send messages in a broadcast-only room
    visitor = 'visitor',
    participant = 'participant',
    moderator = 'moderator',
}

export interface Chat {
    /** Unique ID for the chat, random value for groups and user id for DMs */
    id: string
    name: string
    members: string[]
    type: ChatType
    broadcastOnly: boolean
}

export interface ChatWithLatestMessage extends Chat {
    latestMessage?: ChatMessage
    hasNewMessages: boolean
    latestPaymentUpdate?: ChatMessage
}

export enum ChatMessageStatus {
    sent, // 0
    failed, // 1
    queued, // 2
}

export interface ChatMessage {
    id: string
    content: string
    sentAt: number
    sentBy: ChatMember['id']
    /** Only present on group messages */
    sentIn?: ChatGroup['id']
    /** Only present on direct messages */
    sentTo?: ChatMember['id']
    /** Only present on chat payment messages */
    payment?: ChatPayment
    /** Only present locally on messages sent from us */
    status?: ChatMessageStatus
}

export interface ChatPayment {
    amount: MSats
    status: ChatPaymentStatus
    // TODO: Improve types here. Status should dictate
    // which properties are undefined and which are present.
    recipient?: string
    updatedAt?: number
    memo?: string
    token?: string | null
    invoice?: Invoice
}

export enum ChatPaymentStatus {
    accepted,
    requested,
    canceled,
    rejected,
    paid,
}

export interface Key {
    hex: string
}

export interface Keypair {
    publicKey: Key
    privateKey: Key
}

export interface ChatMember {
    /** Unique ID for the member (same as username for xmpp) */
    id: string
    username: string
    publicKeyHex?: string
}

export interface ChatGroup {
    id: string
    name: string
    joinedAt: number
    broadcastOnly?: boolean
}

export interface XmppChatMember extends ChatMember {
    jid: string
}

export interface ChatGroupSettings {
    members: ChatMember[]
    // What can admins do that members can't (if anything)?
    // Enable payments? Show message history?
    // Consider instead a "creator: Member" field here
    admins: ChatMember[]
    paymentsEnabled: boolean
    // Consider instead a shareMessageHistory boolean
    // because each Member would request and store any Messages
    // from other Members upon joining a Group
    showMessageHistory: boolean
}

export type XmppClientStatus = Status

export type XmppCredentials = RpcResponse<'xmppCredentials'>

export interface XmppConnectionOptions {
    // The domain where the Prosody chat server is hosted
    domain?: string
    // This is the XMPP Multi-User-Chat (MUC) domain defined
    // in prosody.config.lua on the XMPP server
    // https://prosody.im/doc/modules/mod_muc
    mucDomain?: string
    // Should always just be 'chat' for now...
    resource?: string
    // Websocket URL to connect to the Prosody chat server
    service?: string
}

export type ArchiveQueryFilters = {
    withJid?: string | null
}

export type ArchiveQueryPagination = {
    limit?: string | null
    after?: string | null
}

export type MessageArchiveQuery = {
    filters?: ArchiveQueryFilters | null
    pagination?: ArchiveQueryPagination | null
}
