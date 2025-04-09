import { RpcEcashInfo } from './bindings'
import { Invoice } from './fedimint'
import { Btc, MSats } from './units'

export enum ParserDataType {
    Bolt11 = 'lightning:bolt11',
    Bolt12 = 'lightning:bolt12',
    LnurlPay = 'lnurl:pay',
    LnurlWithdraw = 'lnurl:withdraw',
    LnurlAuth = 'lnurl:auth',
    BitcoinAddress = 'bitcoin:address',
    Bip21 = 'bitcoin:bip21',
    CashuEcash = 'cashu:ecash',
    FedimintEcash = 'fedimint:ecash',
    FedimintInvite = 'fedimint:invite',
    LegacyFediChatMember = 'fedi:member', // TODO: remove after matrixification
    LegacyFediChatGroup = 'fedi:group', // TODO: remove after matrixification
    CommunityInvite = 'fedi:community',
    FediChatUser = 'fedi:user',
    FediChatRoom = 'fedi:room',
    Website = 'website',
    Unknown = 'unknown',
    OfflineError = 'offlineError',
}

interface ParsedData<T extends string, D = null> {
    type: T
    data: D
}

export type ParsedBolt11 = ParsedData<
    ParserDataType.Bolt11,
    Invoice & { fallbackAddress?: string }
>

// No data since we don't yet support bolt 12, so no point in fully parsing.
export type ParsedBolt12 = ParsedData<ParserDataType.Bolt12>

export type ParsedLnurlPay = ParsedData<
    ParserDataType.LnurlPay,
    {
        domain: string
        callback: string
        /** Array of raw metadata arrays, [0] is mimeType and [1] is content */
        metadata: string[][]
        /** Short description parsed from metadata, should fit one line */
        description?: string
        /** Long description parsed from metadata, may contain line breaks */
        longDescription?: string
        /** Base64 PNG or JPEG thumbnail */
        thumbnail?: string
        maxSendable?: MSats
        minSendable?: MSats
    }
>

export type ParsedLnurlWithdraw = ParsedData<
    ParserDataType.LnurlWithdraw,
    {
        domain: string
        callback: string
        k1: string
        defaultDescription?: string
        minWithdrawable?: MSats
        maxWithdrawable?: MSats
    }
>

export type ParsedLnurlAuth = ParsedData<
    ParserDataType.LnurlAuth,
    {
        domain: string
        callback: string
        k1: string
        action?: 'register' | 'login' | 'link' | 'auth'
    }
>

export type ParsedBitcoinAddress = ParsedData<
    ParserDataType.BitcoinAddress,
    {
        address: string
    }
>

export type ParsedBip21 = ParsedData<
    ParserDataType.Bip21,
    {
        address: string
        amount?: Btc
        label?: string
        message?: string
    }
>

export type ParsedFedimintEcash = ParsedData<
    ParserDataType.FedimintEcash,
    {
        token: string
        parsed: RpcEcashInfo
    }
>

export type ParsedCommunityInvite = ParsedData<
    ParserDataType.CommunityInvite,
    {
        invite: string
    }
>

export type ParsedCashuEcash = ParsedData<
    ParserDataType.CashuEcash,
    {
        token: string
    }
>

export type ParsedFederationInvite = ParsedData<
    ParserDataType.FedimintInvite,
    {
        invite: string
    }
>

/** @deprecated XMPP legacy code  */
export type ParsedLegacyFediChatMember = ParsedData<
    ParserDataType.LegacyFediChatMember,
    { id: string }
>

/** @deprecated XMPP legacy code  */
export type ParsedLegacyFediChatGroup = ParsedData<
    ParserDataType.LegacyFediChatGroup,
    { id: string }
>

export type ParsedFediChatUser = ParsedData<
    ParserDataType.FediChatUser,
    { id: string; displayName: string }
>

export type ParsedFediChatRoom = ParsedData<
    ParserDataType.FediChatRoom,
    { id: string }
>

export type ParsedWebsite = ParsedData<ParserDataType.Website, { url: string }>

export type ParsedUnknownData = ParsedData<
    ParserDataType.Unknown,
    { message?: string }
>

export type ParsedOfflineError = ParsedData<
    ParserDataType.OfflineError,
    { title: string; message: string; goBackText?: string }
>

export type AnyParsedData =
    | ParsedBolt11
    | ParsedBolt12
    | ParsedLnurlPay
    | ParsedLnurlWithdraw
    | ParsedLnurlAuth
    | ParsedBitcoinAddress
    | ParsedBip21
    | ParsedCashuEcash
    | ParsedFedimintEcash
    | ParsedFederationInvite
    | ParsedCommunityInvite
    | ParsedLegacyFediChatMember
    | ParsedLegacyFediChatGroup
    | ParsedFediChatUser
    | ParsedFediChatRoom
    | ParsedWebsite
    | ParsedUnknownData
    | ParsedOfflineError
