import {
    BalanceEvent,
    CommunityMetadataUpdatedEvent,
    DeviceRegistrationEvent,
    LogEvent,
    NonceReuseCheckFailedEvent,
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
    RpcTransactionListEntry,
    TransactionEvent as RpcTransactionEvent,
} from './bindings'
import { MSats, Usd, UsdCents } from './units'

export type {
    SocialRecoveryApproval as GuardianApproval,
    RpcInvoice as Invoice,
    RpcLightningGateway as LightningGateway,
    SocialRecoveryEvent,
}
export type SocialRecoveryQrCode = RpcResponse<'recoveryQr'>

export enum TransactionDirection {
    send = 'send',
    receive = 'receive',
}

// These types are almost identical (only difference is the `createdAt` field),
// but we need to keep both for now. The `listTransactions` rpc includes the
// `createdAt` field, while `getTransaction` & transaction updates do not.
// TODO: Find a way to include the `createdAt` field in all types on the bridge.
export type Transaction = RpcTransaction
export type TransactionListEntry = RpcTransactionListEntry

type TestEquals<T, K> = T extends K ? (K extends T ? true : never) : never

// Sanity check!
// This should only compile if the Transaction RPC types and the
// TransactionListEntry types are identical (except for the `createdAt` field).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _TEST = true satisfies TestEquals<
    RpcTransaction & { createdAt: number },
    RpcTransactionListEntry
>

/*
 * Mocked-out social backup and recovery events
 */

export type FederationEvent = RpcFederationMaybeLoading

export type TransactionEvent = RpcTransactionEvent

/**
 * Utility type to narrow a transaction union type to a specific kind.
 *
 * @param K - The specific transaction kind to narrow to
 * @param T - The union type to narrow from (defaults to RpcTransactionListEntry)
 * @returns The narrowed type with only the specified kind
 */
type TransactionKind<
    K extends RpcTransactionListEntry['kind'],
    T = RpcTransactionListEntry,
> = Extract<T, { kind: K }>

export type LnPayTxn = TransactionKind<'lnPay'>
export type LnReceiveTxn = TransactionKind<'lnReceive'>
export type OnchainWithdrawTxn = TransactionKind<'onchainWithdraw'>
export type OnchainDepositTxn = TransactionKind<'onchainDeposit'>
export type OobSendTxn = TransactionKind<'oobSend'>
export type OobReceiveTxn = TransactionKind<'oobReceive'>
export type SpDepositTxn = TransactionKind<'spDeposit'>
export type SpWithdrawTxn = TransactionKind<'spWithdraw'>

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
    federation_expiry_timestamp = 'federation_expiry_timestamp',
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

export type FederationMetadata = RpcFederation['meta']

/**
 * Connection Status of a federation's guardians
 *
 * - online: all guardians are online
 * - unstable: At least one guardian is offline, but
 *   consensus is still met
 * - offline: Consensus is not met
 */
export type FederationStatus = 'online' | 'unstable' | 'offline'

export type LoadingFederation = RpcFederationMaybeLoading & {
    meta?: never
    readonly init_state: 'loading'
    readonly hasWallet: true
}
export type FederationInitFailure = RpcFederationMaybeLoading & {
    meta?: never
    readonly init_state: 'failed'
    readonly hasWallet: true
}

export type LoadedFederation = RpcFederation & {
    status: FederationStatus
    readonly init_state: 'ready'
    readonly hasWallet: true
}

export type Federation =
    | LoadingFederation
    | FederationInitFailure
    | LoadedFederation

export type Community = RpcCommunity & {
    id: Federation['id']
    status: 'online'
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

export type FederationPreview = RpcFederationPreview & {
    hasWallet: true
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
    nonceReuseCheckFailed: NonceReuseCheckFailedEvent
}

export type StabilityPoolTxn = {
    id: string
    timestamp: number | null
    amountCents: UsdCents
    amountUsd: Usd
    direction: 'deposit' | 'withdraw'
    status: 'pending' | 'complete'
}

export type ReceiveSuccessStatus = 'success' | 'pending'

export type ReceiveSuccessData = {
    amount: TransactionListEntry['amount']
    onchain_address?: string
}

export type ReceiveEcashResult =
    | {
          amount: MSats
          status: ReceiveSuccessStatus
      }
    | {
          amount: MSats
          status: 'failed'
          error: string
      }

export type TransactionStatusBadge =
    | 'incoming'
    | 'outgoing'
    | 'pending'
    | 'expired'
    | 'failed'

export type TransactionAmountState = 'settled' | 'pending' | 'failed'
