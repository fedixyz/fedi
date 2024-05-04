import {
    BalanceEvent,
    LogEvent,
    RpcFederation,
    RpcInvoice,
    RpcLightningGateway,
    RpcResponse,
    SocialRecoveryEvent,
    RpcTransaction,
    SocialRecoveryApproval,
    PanicEvent,
    StabilityPoolWithdrawalEvent,
    StabilityPoolDepositEvent,
    RpcFederationPreview,
    RecoveryCompleteEvent,
    RecoveryProgressEvent,
    ObservableUpdate,
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
    CDF = 'CDF',
    CFA = 'CFA',
    CLP = 'CLP',
    COP = 'COP',
    CUP = 'CUP',
    CZK = 'CZK',
    DJF = 'DJF',
    ERN = 'ERN',
    ETB = 'ETB',
    EUR = 'EUR',
    GHS = 'GHS',
    GTQ = 'GTQ',
    HKD = 'HKD',
    HNL = 'HNL',
    IDR = 'IDR',
    INR = 'INR',
    KES = 'KES',
    LBP = 'LBP',
    MMK = 'MMK',
    MWK = 'MWK',
    MXN = 'MXN',
    MYR = 'MYR',
    NAD = 'NAD',
    NGN = 'NGN',
    PEN = 'PEN',
    PHP = 'PHP',
    RWF = 'RWF',
    SDG = 'SDG',
    SOS = 'SOS',
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
    federation_icon_url = 'federation_icon_url',
    federation_name = 'federation_name',
}

export type ClientConfigMetadata = Record<string, string | undefined>

export enum Network {
    bitcoin = 'bitcoin',
    testnet = 'testnet',
    signet = 'signet',
    regtest = 'regtest',
}

export type Federation = Omit<RpcFederation, 'network'> & {
    meta: ClientConfigMetadata
    network: Network
}
export type PublicFederation = Pick<Federation, 'id' | 'name' | 'meta'>

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

export type FederationPreview = RpcFederationPreview

/*
 * Mocked-out social backup and recovery events
 */

export type FederationEvent = Federation

export interface TransactionEvent {
    federationId: string
    transaction: Transaction
}

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
}

export type StabilityPoolTxn = {
    id: string
    timestamp: number | null
    amountCents: UsdCents
    amountUsd: Usd
    direction: 'deposit' | 'withdraw'
    status: 'pending' | 'complete'
}
