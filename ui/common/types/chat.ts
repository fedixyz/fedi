import type { Invoice } from './fedimint'
import { MatrixEvent, MatrixRoom } from './matrix'
import type { MSats } from './units'

export enum ChatType {
    direct = 'direct',
    group = 'group',
}

export interface Chat {
    /** Unique ID for the chat, random value for groups and user id for DMs */
    id: string
    name: string
    members: string[]
    type: ChatType
    broadcastOnly: boolean
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

export type ChatReplyState = {
    roomId?: MatrixRoom['id'] // the room the reply belongs to
    event: MatrixEvent | null // the full replied event
}
