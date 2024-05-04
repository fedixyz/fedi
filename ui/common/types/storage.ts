// Maintain all versions of stored state below. Stored state versions should
// be fairly immutable, but if you simply want to add a new key, just make
// it optional?: value.
import { Chat, ChatGroup, ChatMember, ChatMessage } from './chat'
import { Federation, Guardian, FediMod, SupportedCurrency } from './fedimint'

export interface StoredStateV0 {
    version: 0 // Not a real version, just implemented for demonstrative purposes
}

export interface StoredStateV1 extends Omit<StoredStateV0, 'version'> {
    version: 1
    language: string | null
    currency: SupportedCurrency | null
    activeFederationId: string | null
    authenticatedGuardian: Guardian | null
    chatIdentities: Record<string, ChatMember | undefined>
}

export interface StoredStateV2
    extends Omit<StoredStateV1, 'version' | 'chatIdentities'> {
    version: 2
    chat: Record<
        Federation['id'],
        | {
              authenticatedMember: ChatMember | null
              messages: ChatMessage[]
              groups: ChatGroup[]
              members: ChatMember[]
              lastFetchedMessageId: string | null
          }
        | undefined
    >
}

export interface StoredStateV3 extends Omit<StoredStateV2, 'version' | 'chat'> {
    version: 3
    chat: Record<
        Federation['id'],
        | {
              authenticatedMember: ChatMember | null
              messages: ChatMessage[]
              groups: ChatGroup[]
              groupRoles?: Record<ChatGroup['id'], string | undefined>
              members: ChatMember[]
              lastFetchedMessageId: string | null
              lastReadMessageIds: Record<Chat['id'], string | undefined>
              lastSeenMessageId: string | null
          }
        | undefined
    >
    customFediMods?: Record<Federation['id'], FediMod[] | undefined>
}

export interface StoredStateV4 extends Omit<StoredStateV3, 'version' | 'chat'> {
    version: 4
    chat: Record<
        Federation['id'],
        | {
              authenticatedMember: ChatMember | null
              messages: ChatMessage[]
              groups: ChatGroup[]
              groupRoles?: Record<ChatGroup['id'], string | undefined>
              groupAffiliations: Record<ChatGroup['id'], string | undefined>
              members: ChatMember[]
              lastFetchedMessageId: string | null
              lastReadMessageIds: Record<Chat['id'], string | undefined>
              lastSeenMessageId: string | null
          }
        | undefined
    >
}

export interface StoredStateV5 extends Omit<StoredStateV4, 'version'> {
    version: 5
    externalMeta: Record<string, Federation['meta'] | undefined>
}

export interface StoredStateV6 extends Omit<StoredStateV5, 'version'> {
    version: 6
    btcExchangeRates: Partial<Record<SupportedCurrency, number>>
    amountInputType?: 'sats' | 'fiat'
}

export interface StoredStateV7 extends Omit<StoredStateV6, 'version'> {
    version: 7
    onchainDepositsEnabled: boolean
    developerMode: boolean
}

export interface StoredStateV8
    extends Omit<StoredStateV7, 'version' | 'btcExchangeRates'> {
    version: 8
    btcUsdRate: number
    fiatUsdRates: Record<string, number | undefined>
}

export interface StoredStateV9 extends Omit<StoredStateV8, 'version'> {
    version: 9
    stableBalanceEnabled: boolean
}

export interface StoredStateV10 extends Omit<StoredStateV9, 'version'> {
    version: 10
    chat: Record<
        Federation['id'],
        | {
              authenticatedMember: ChatMember | null
              messages: ChatMessage[]
              groups: ChatGroup[]
              groupRoles?: Record<ChatGroup['id'], string | undefined>
              groupAffiliations: Record<ChatGroup['id'], string | undefined>
              members: ChatMember[]
              lastFetchedMessageId: string | null
              lastReadMessageIds: Record<Chat['id'], string | undefined>
              lastReadPaymentUpdateIds: Record<Chat['id'], string | undefined>
              lastSeenMessageId: string | null
              lastSeenPaymentUpdateId: string | null
          }
        | undefined
    >
}

export interface StoredStateV11 extends Omit<StoredStateV10, 'version'> {
    version: 11
    nuxSteps: Record<string, boolean | undefined>
}

export interface StoredStateV12 extends Omit<StoredStateV11, 'version'> {
    version: 12 // This version was only added to run a migration on chat data.
}

export interface StoredStateV13 extends Omit<StoredStateV12, 'version'> {
    version: 13
    showFiatTxnAmounts?: boolean
}

export interface StoredStateV14
    extends Omit<StoredStateV13, 'version' | 'chat'> {
    version: 14
    chat: Record<
        Federation['id'],
        | {
              authenticatedMember: ChatMember | null
              messages: ChatMessage[]
              groups: ChatGroup[]
              groupRoles?: Record<ChatGroup['id'], string | undefined>
              groupAffiliations: Record<ChatGroup['id'], string | undefined>
              members: ChatMember[]
              lastFetchedMessageId: string | null
              lastReadMessageTimestamps: Record<Chat['id'], number | undefined>
              lastSeenMessageTimestamp: number | null
          }
        | undefined
    >
}

export interface StoredStateV15 extends Omit<StoredStateV14, 'version'> {
    version: 15
    matrixAuth: null | {
        userId: string
        deviceId: string
    }
}

export interface StoredStateV16 extends Omit<StoredStateV15, 'version'> {
    version: 16
    deviceId: string | undefined
}

/*** Union of all past shapes of stored state ***/
export type AnyStoredState =
    | StoredStateV0
    | StoredStateV1
    | StoredStateV2
    | StoredStateV3
    | StoredStateV4
    | StoredStateV5
    | StoredStateV6
    | StoredStateV7
    | StoredStateV8
    | StoredStateV9
    | StoredStateV10
    | StoredStateV11
    | StoredStateV12
    | StoredStateV13
    | StoredStateV14
    | StoredStateV15
    | StoredStateV16

/*** Alias for the latest version of stored state ***/
export type LatestStoredState = StoredStateV16

export interface StorageApi {
    getItem(key: string): Promise<string | null>
    setItem(key: string, item: string): Promise<void>
    removeItem(key: string): Promise<void>
}
