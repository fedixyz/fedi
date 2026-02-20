// Maintain all versions of stored state below. Stored state versions should
// be fairly immutable, but if you simply want to add a new key, just make
// it optional?: value.
import { ProtectedFeatures } from '../redux'
import { ModVisibility } from '../redux/mod'
import { Chat, ChatGroup, ChatMember, ChatMessage } from './chat'
import { RememberedPermissionsMap } from './fediInternal'
import {
    Federation,
    FediMod,
    Guardian,
    Community,
    SelectableCurrency,
    SupportedCurrency,
} from './fedimint'
import { HomeNavigationTab } from './linking'

export interface StoredStateV0 {
    version: 0 // Not a real version, just implemented for demonstrative purposes
}

export interface StoredStateV1 extends Omit<StoredStateV0, 'version'> {
    version: 1
    language: string | null
    currency: SelectableCurrency | null
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

export interface StoredStateV17 extends Omit<StoredStateV16, 'version'> {
    version: 17
    protectedFeatures: Pick<ProtectedFeatures, 'app' | 'changePin'>
}

export interface StoredStateV18 extends Omit<StoredStateV17, 'version'> {
    version: 18
    customGlobalMods: Record<FediMod['id'], FediMod>
    customGlobalModVisibility: Record<FediMod['id'], ModVisibility>
    suggestedGlobalModVisibility: Record<FediMod['id'], ModVisibility>
}

export interface StoredStateV19
    extends Omit<
        StoredStateV18,
        'version' | 'customGlobalModVisibility' | 'suggestedGlobalModVisibility'
    > {
    version: 19
    modVisibility: Record<FediMod['id'], ModVisibility>
}

export interface StoredStateV20 extends Omit<StoredStateV19, 'version'> {
    version: 20
    protectedFeatures: Pick<
        ProtectedFeatures,
        'app' | 'changePin' | 'nostrSettings'
    >
}

export interface StoredStateV21
    extends Omit<StoredStateV20, 'version' | 'chat'> {
    version: 21
}

export interface StoredStateV22 extends Omit<StoredStateV21, 'version'> {
    version: 22
    support: {
        supportPermissionGranted: boolean
        zendeskPushNotificationToken: string | null
    }
}

export interface StoredStateV23 extends Omit<StoredStateV22, 'version'> {
    version: 23
    customFederationCurrencies: Record<string, SelectableCurrency>
}
export interface StoredStateV24 extends Omit<StoredStateV23, 'version'> {
    version: 24
}
export interface StoredStateV25 extends Omit<StoredStateV24, 'version'> {
    version: 25
    chatDrafts: Record<string, string>
}
export interface StoredStateV26 extends Omit<StoredStateV25, 'version'> {
    version: 26
    seenFederationRatings: Array<Federation['id']>
}
export interface StoredStateV27 extends Omit<StoredStateV26, 'version'> {
    version: 27
    lastShownSurveyTimestamp: number | null
}
export interface StoredStateV28
    extends Omit<StoredStateV27, 'version' | 'activeFederationId'> {
    version: 28
    lastUsedFederationId: Federation['id'] | null
    lastSelectedCommunityId: Community['id'] | null
}

export interface StoredStateV29
    extends Omit<StoredStateV28, 'version' | 'externalMeta'> {
    version: 29
}
export interface StoredStateV30 extends Omit<StoredStateV29, 'version'> {
    version: 30
    previouslyAutojoinedCommunities: Record<string, number>
}
export interface StoredStateV31 extends Omit<StoredStateV30, 'version'> {
    version: 31
    autojoinNoticesToDisplay: Array<Community['id']>
}

export interface StoredStateV32
    extends Omit<StoredStateV31, 'version' | 'lastUsedFederationId'> {
    version: 32
    recentlyUsedFederationIds: Array<string>
}

export interface StoredStateV33 extends Omit<StoredStateV32, 'version'> {
    version: 33
    analyticsId: string | null
    hasConsentedToAnalytics: boolean | null
    sessionCount: number
}

/**
 * Flattened interface checkpoint to avoid deep type recursion.
 * Breaking the extends chain prevents TypeScript "excessively deep" errors.
 * Numbered as Checkpoint 1 since we will probably see this problem again in the future
 */
export interface StoredStateCheckpoint1 {
    version: 33
    onchainDepositsEnabled: boolean
    developerMode: boolean
    stableBalanceEnabled: boolean
    language: string | null
    amountInputType?: 'sats' | 'fiat'
    showFiatTxnAmounts?: boolean
    deviceId: string | undefined
    currency: SelectableCurrency | null
    btcUsdRate: number
    fiatUsdRates: Record<string, number | undefined>
    customFederationCurrencies: Record<string, SelectableCurrency>
    authenticatedGuardian: Guardian | null
    customFediMods?: Record<Federation['id'], FediMod[] | undefined>
    nuxSteps: Record<string, boolean | undefined>
    matrixAuth: null | {
        userId: string
        deviceId: string
    }
    protectedFeatures: Pick<
        ProtectedFeatures,
        'app' | 'changePin' | 'nostrSettings'
    >
    customGlobalMods: Record<FediMod['id'], FediMod>
    modVisibility: Record<FediMod['id'], ModVisibility>
    chatDrafts: Record<string, string>
    support: {
        supportPermissionGranted: boolean
        zendeskPushNotificationToken: string | null
    }
    seenFederationRatings: Array<Federation['id']>
    lastShownSurveyTimestamp: number | null
    lastSelectedCommunityId: Community['id'] | null
    recentlyUsedFederationIds: Array<string>
    previouslyAutojoinedCommunities: Record<string, number>
    autojoinNoticesToDisplay: Array<Community['id']>
    analyticsId: string | null
    hasConsentedToAnalytics: boolean | null
    sessionCount: number
}

export interface StoredStateV34
    extends Omit<StoredStateCheckpoint1, 'version'> {
    version: 34
    hasSeenAnalyticsConsentModal: boolean
}

export interface StoredStateV35 extends Omit<StoredStateV34, 'version'> {
    version: 35
    showFiatTotalBalance: boolean
}

export interface StoredStateV36 extends Omit<StoredStateV35, 'version'> {
    version: 36
    surveyCompletions: Record<
        string,
        { isCompleted: boolean; timesDismissed: number } | undefined
    >
    lastShownSurveyTimestamp: number
}

export interface StoredStateV37
    extends Omit<StoredStateV36, 'version' | 'showFiatTxnAmounts'> {
    version: 37
    transactionDisplayType: 'sats' | 'fiat'
}

export interface StoredStateV38 extends Omit<StoredStateV37, 'version'> {
    version: 38
    newMods: FediMod['id'][]
}

export interface StoredStateV39 extends Omit<StoredStateV38, 'version'> {
    version: 39
    miniAppPermissions: { [miniAppUrlOrigin: string]: RememberedPermissionsMap }
}

export interface StoredStateV40 extends Omit<StoredStateV39, 'version'> {
    version: 40
    miniAppOrder: FediMod['id'][]
}

export interface StoredStateV41
    extends Omit<StoredStateV40, 'version' | 'showFiatTotalBalance'> {
    version: 41
    balanceDisplay: 'sats' | 'fiat' | 'hidden'
}

export interface StoredStateV42 extends Omit<StoredStateV41, 'version'> {
    version: 42
    lastUsedTab: HomeNavigationTab
}

/**
 * Consolidated type for older storage versions (0-24).
 * These are grouped together to reduce union type computation that slows down TSC performance.
 * Individual version types above are maintained for documentation and migration logic.
 */
type OldStoredState =
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
    | StoredStateV17
    | StoredStateV18
    | StoredStateV19
    | StoredStateV20
    | StoredStateV21
    | StoredStateV22
    | StoredStateV23
    | StoredStateV24

/***
 * Union of all past shapes of stored state.
 * Uses checkpoint consolidation: older versions (0-24) are grouped together,
 * while recent versions (25+) remain individual to reduce union complexity.
 ***/
export type AnyStoredState =
    | OldStoredState
    | StoredStateV25
    | StoredStateV26
    | StoredStateV27
    | StoredStateV28
    | StoredStateV29
    | StoredStateV30
    | StoredStateV31
    | StoredStateV32
    | StoredStateV33
    | StoredStateCheckpoint1
    | StoredStateV34
    | StoredStateV35
    | StoredStateV36
    | StoredStateV37
    | StoredStateV38
    | StoredStateV39
    | StoredStateV40
    | StoredStateV41
    | StoredStateV42

/*** Alias for the latest version of stored state ***/
export type LatestStoredState = StoredStateV42

export interface StorageApi {
    getItem(key: string): Promise<string | null>
    setItem(key: string, item: string): Promise<void>
    removeItem(key: string): Promise<void>
}
