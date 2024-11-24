import {
    BalanceEvent,
    CommunityMetadataUpdatedEvent,
    DeviceRegistrationEvent,
    LogEvent,
    ObservableUpdate,
    PanicEvent,
    RecoveryCompleteEvent,
    RecoveryProgressEvent,
    RpcCommunity,
    RpcFederation,
    RpcFederationMaybeLoading,
    RpcFederationPreview,
    RpcInvoice,
    RpcLightningGateway,
    RpcResponse,
    RpcTransaction,
    SocialRecoveryApproval,
    SocialRecoveryEvent,
    StabilityPoolDepositEvent,
    StabilityPoolWithdrawalEvent,
} from './bindings'
import { Usd, UsdCents } from './units'

export type {
    SocialRecoveryEvent,
    SocialRecoveryApproval as GuardianApproval,
    RpcInvoice as Invoice,
    RpcLightningGateway as LightningGateway,
}
export type SocialRecoveryQrCode = RpcResponse<'recoveryQr'>

export enum TransactionDirection {
    send = 'send',
    receive = 'receive',
}

export type Transaction = RpcTransaction

export interface Node {
    name: string
    url: string
}

export interface NodeMap {
    [index: string]: Node
}

export interface Guardian extends Node {
    peerId: number
    password: string
}

export interface FederationCredentials {
    username: string
    password: string
    keypairSeed: string
}

export enum SupportedCurrency {
    USD = 'USD',
    ARS = 'ARS',
    AUD = 'AUD',
    BDT = 'BDT',
    BIF = 'BIF',
    BRL = 'BRL',
    BWP = 'BWP',
    CAD = 'CAD',
    CDF = 'CDF',
    CFA = 'CFA',
    CLP = 'CLP',
    COP = 'COP',
    CRC = 'CRC',
    CUP = 'CUP',
    CZK = 'CZK',
    DJF = 'DJF',
    ERN = 'ERN',
    ETB = 'ETB',
    EUR = 'EUR',
    GBP = 'GBP',
    GHS = 'GHS',
    GTQ = 'GTQ',
    HKD = 'HKD',
    HNL = 'HNL',
    IDR = 'IDR',
    INR = 'INR',
    KES = 'KES',
    KRW = 'KRW',
    LBP = 'LBP',
    MMK = 'MMK',
    MWK = 'MWK',
    MXN = 'MXN',
    MYR = 'MYR',
    NAD = 'NAD',
    NGN = 'NGN',
    NIO = 'NIO',
    PEN = 'PEN',
    PHP = 'PHP',
    PKR = 'PKR',
    RWF = 'RWF',
    SDG = 'SDG',
    SOS = 'SOS',
    SRD = 'SRD',
    SSP = 'SSP',
    THB = 'THB',
    UGX = 'UGX',
    UYU = 'UYU',
    VES = 'VES',
    VND = 'VND',
    XAF = 'XAF',
    ZAR = 'ZAR',
    ZMW = 'ZMW',
}

export enum SupportedMetaFields {
    default_currency = 'default_currency',
    fixed_exchange_rate = 'fixed_exchange_rate',
    chat_server_domain = 'chat_server_domain',
    invite_codes_disabled = 'invite_codes_disabled',
    new_members_disabled = 'new_members_disabled',
    social_recovery_disabled = 'social_recovery_disabled',
    offline_wallet_disabled = 'offline_wallet_disabled',
    onchain_deposits_disabled = 'onchain_deposits_disabled',
    fedi_internal_injection_disabled = 'fedi_internal_injection_disabled',
    stability_pool_disabled = 'stability_pool_disabled',
    max_stable_balance_msats = 'max_stable_balance_msats',
    max_balance_msats = 'max_balance_msats',
    max_invoice_msats = 'max_invoice_msats',
    nostr_enabled = 'nostr_enabled',
    popup_end_timestamp = 'popup_end_timestamp',
    popup_countdown_message = 'popup_countdown_message',
    popup_ended_message = 'popup_ended_message',
    tos_url = 'tos_url',
    welcome_message = 'welcome_message',
    pinned_message = 'pinned_message',
    federation_icon_url = 'federation_icon_url',
    federation_name = 'federation_name',
    default_matrix_rooms = 'default_matrix_rooms',
    default_group_chats = 'default_group_chats',
}

export type ClientConfigMetadata = Record<string, string | undefined>

export enum Network {
    bitcoin = 'bitcoin',
    testnet = 'testnet',
    signet = 'signet',
    regtest = 'regtest',
}

/**
 * Connection Status of a federation's guardians
 *
 * - online: all guardians are online
 * - unstable: At least one guardian is offline, but
 *   consensus is still met
 * - offline: Consensus is not met
 */
export type FederationStatus = 'online' | 'unstable' | 'offline'

export interface LoadingFederation {
    id: string
    meta?: never
    readonly init_state: 'loading'
    readonly hasWallet: true
}
export interface FederationInitFailure {
    id: string
    error: string
    meta?: never
    readonly init_state: 'failed'
    readonly hasWallet: true
}

export type LoadedFederation = Omit<RpcFederation, 'network' | 'meta'> & {
    meta: ClientConfigMetadata
    network: Network | undefined
    status: FederationStatus
    readonly init_state: 'ready'
    readonly hasWallet: true
}

export type Federation =
    | LoadingFederation
    | FederationInitFailure
    | LoadedFederation

export type Community = Omit<RpcCommunity, 'meta'> & {
    id: Federation['id']
    meta: ClientConfigMetadata
    status: FederationStatus
    // Added for compatibility with Mods
    readonly network: undefined
    readonly hasWallet: false
    readonly init_state: 'ready'
}

export type RpcCommunityPreview = RpcCommunity

export type CommunityPreview = Community

export type JoinPreview = FederationPreview | CommunityPreview

// Check if hasWallet is true to determine if it's a wallet type or community
export type FederationListItem = Federation | Community

export type LoadedFederationListItem = LoadedFederation | Community

export type PublicFederation = Pick<LoadedFederation, 'id' | 'name' | 'meta'>

export type SeedWords = RpcResponse<'getMnemonic'>

export interface FediMod {
    id: string
    title: string
    url: string
    imageUrl?: string | null
    description?: string
    color?: string
}

export interface FederationApiVersion {
    major: number
    minor: number
}

export type FederationPreview = Omit<RpcFederationPreview, 'meta'> & {
    readonly hasWallet: true
    meta: ClientConfigMetadata
}

/*
 * Mocked-out social backup and recovery events
 */

export type FederationEvent = RpcFederationMaybeLoading

export interface TransactionEvent {
    federationId: string
    transaction: Transaction
}

// TODO: Create a type that derives the map from the `Event` type in bindings.ts
// so we don't have to manually update it every time we add a new event type
//
// ref: https://github.com/sindresorhus/type-fest/blob/main/source/union-to-intersection.d.ts
//
// Map of event type name -> event data
export type FedimintBridgeEventMap = {
    log: LogEvent
    federation: FederationEvent
    transaction: TransactionEvent
    socialRecovery: SocialRecoveryEvent
    balance: BalanceEvent
    panic: PanicEvent
    stabilityPoolDeposit: StabilityPoolDepositEvent
    stabilityPoolWithdrawal: StabilityPoolWithdrawalEvent
    recoveryComplete: RecoveryCompleteEvent
    recoveryProgress: RecoveryProgressEvent
    observableUpdate: ObservableUpdate<unknown>
    deviceRegistration: DeviceRegistrationEvent
    communityMetadataUpdated: CommunityMetadataUpdatedEvent
}

export type StabilityPoolTxn = {
    id: string
    timestamp: number | null
    amountCents: UsdCents
    amountUsd: Usd
    direction: 'deposit' | 'withdraw'
    status: 'pending' | 'complete'
}
