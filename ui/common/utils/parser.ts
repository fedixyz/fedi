import { validate as validateBitcoinAddress } from 'bitcoin-address-validation'
import { TFunction } from 'i18next'
import { getParams as getLnurlParams } from 'js-lnurl'
import qs from 'query-string'

import { Btc, MSats } from '../types'
import {
    AnyParsedData,
    ParsedBip21,
    ParsedBitcoinAddress,
    ParsedBolt11,
    ParsedBolt12,
    ParsedCashuEcash,
    ParsedCommunityInvite,
    ParsedDeepLink,
    ParsedFederationInvite,
    ParsedFediChatRoom,
    ParsedFediChatUser,
    ParsedFedimintEcash,
    ParsedLegacyFediChatGroup,
    ParsedLegacyFediChatMember,
    ParsedLnurlAuth,
    ParsedLnurlPay,
    ParsedLnurlWithdraw,
    ParsedStabilityAddress,
    ParsedUnknownData,
    ParsedWebsite,
    ParserDataType,
} from '../types/parser'
import { validateCashuTokens } from './cashu'
import { FedimintBridge } from './fedimint'
import { isUniversalLink, universalToFedi } from './linking'
import { makeLog } from './log'
import { decodeFediMatrixRoomUri, decodeFediMatrixUserUri } from './matrix'
import { isValidInternetIdentifier } from './validation'
import {
    decodeLegacyDirectChatLink,
    decodeLegacyGroupInvitationLink,
} from './xmpp'

const log = makeLog('common/utils/parser')

/** List of parse types that are not usable before a user is a member of a federation */
export const BLOCKED_PARSER_TYPES_BEFORE_FEDERATION = [
    ParserDataType.Bolt11,
    ParserDataType.Bolt12,
    ParserDataType.LnurlPay,
    ParserDataType.LnurlWithdraw,
    ParserDataType.LnurlAuth,
    ParserDataType.BitcoinAddress,
    ParserDataType.Bip21,
    ParserDataType.CashuEcash,
]

/** List of parse types that are not usable before recovery is complete */
export const BLOCKED_PARSER_TYPES_DURING_RECOVERY = [
    ParserDataType.Bolt11,
    ParserDataType.LnurlPay,
    ParserDataType.LnurlWithdraw,
]

/** List of Legacy Code kinds **/
export const LEGACY_CODE_TYPES = [
    ParserDataType.LegacyFediChatGroup,
    ParserDataType.LegacyFediChatMember,
]

export type ParserFn = (
    raw: string,
    fedimint: FedimintBridge,
    t: TFunction,
    federationId: string,
) => Promise<AnyParsedData | undefined> | AnyParsedData | undefined

export type Parser = {
    name: string
    handler: ParserFn
}

/**
 * Offline parsers that don't require network access
 */
const offlineParsers: Parser[] = [
    {
        name: 'parseBitcoinAddress',
        handler: raw => parseBitcoinAddress(raw),
    },
    {
        name: 'parseBip21',
        handler: (raw, fedimint, _t, federationId) =>
            parseBip21(raw, fedimint, federationId),
    },
    {
        name: 'parseFedimintEcash',
        handler: (raw, fedimint) => parseFedimintEcash(raw, fedimint),
    },
    {
        name: 'parseCashuEcash',
        handler: raw => parseCashuEcash(raw),
    },
    {
        name: 'parseStabilityAddress',
        handler: (raw, fedimint) => parseStabilityAddress(raw, fedimint),
    },
    {
        name: 'parseFediUniversalLink',
        handler: (raw, fedimint) => parseFediUniversalLink(raw, fedimint),
    },
    {
        name: 'parseBolt12',
        handler: raw => parseBolt12(raw),
    },
    {
        name: 'parseFedimintInvite',
        handler: raw => parseFedimintInvite(raw),
    },
    {
        name: 'parseCommunityInvite',
        handler: raw => parseCommunityInvite(raw),
    },
]

/**
 * Online parsers that require network access
 */
const onlineParsers: Parser[] = [
    {
        name: 'parseBolt11',
        handler: (raw, fedimint, t) => parseBolt11(raw, fedimint, t, null),
    },

    {
        name: 'parseLnurl',
        handler: (raw, fedimint, t, federationId) =>
            parseLnurl(raw, fedimint, t, federationId),
    },
    {
        name: 'parseFediUri',
        handler: (raw, fedimint) => parseFediUri(raw, fedimint),
    },
]

/**
 * Parses any data that would the user would input via QR code, copy / paste etc.
 * Returns a structured object that identifies the type of data, and formatted
 * keys for the data where available.
 */
export async function parseUserInput<T extends TFunction>(
    raw: string,
    fedimint: FedimintBridge,
    t: T,
    federationId: string,
    isInternetUnreachable: boolean,
): Promise<AnyParsedData> {
    raw = raw.trim()

    async function tryParsers(
        parsers: Parser[],
    ): Promise<AnyParsedData | undefined> {
        for (const parser of parsers) {
            try {
                log.debug(`Running parser: ${parser.name}`)
                const result = await parser.handler(
                    raw,
                    fedimint,
                    t,
                    federationId,
                )
                if (result) {
                    log.info(`${parser.name} parser succeeded`)
                    return result
                }
            } catch (err) {
                log.error(`${parser.name} parser error`, err)
            }
        }

        return undefined
    }

    const offlineResult = await tryParsers(offlineParsers)
    if (offlineResult) return offlineResult

    if (!isInternetUnreachable) {
        const onlineResult = await tryParsers(onlineParsers)
        if (onlineResult) return onlineResult

        return {
            type: ParserDataType.Unknown,
            data: {},
        }
    }

    return {
        type: ParserDataType.OfflineError,
        data: {
            title: t('feature.omni.error-network-offline-title'),
            message: t('feature.omni.error-network-offline-message'),
        },
    }
}

/**
 * Attempts to parse a url
 * If it includes /screen? or /screen# then it's considered a deep link
 * Otherwise it will be picked up by parseFediUri
 */
export async function parseFediUniversalLink(
    raw: string,
    fedimint: FedimintBridge,
): Promise<
    | ParsedLegacyFediChatGroup
    | ParsedLegacyFediChatMember
    | ParsedFediChatUser
    | ParsedFediChatRoom
    | ParsedDeepLink
    | undefined
> {
    if (isUniversalLink(raw)) {
        // Hack to let parseFediUri logic handle user deep links
        // as we have a dedicated OmniConfirmation to show to users
        if (raw.includes('?screen=user')) {
            const deep = universalToFedi(raw) // → fedi://user/... or ''
            if (!deep) return

            // Re-use the existing Fedi-URI parser
            return parseFediUri(deep, fedimint)
        }

        return {
            type: ParserDataType.DeepLink,
            data: { url: raw },
        }
    }

    return
}

/**
 * Attempt to parse an LNURL or lightning address. Any HTTP(S) address can be
 * a valid LNURL so we will always fetch to check, but if it does not return a
 * valid LNURL response it will just be treated as a link to a website.
 * LNURL docs: https://github.com/lnurl/luds
 * Lightning address docs: https://github.com/andrerfneves/lightning-address
 */
async function parseLnurl(
    raw: string,
    fedimint: FedimintBridge,
    t: TFunction,
    federationId: string | undefined,
): Promise<
    | ParsedLnurlAuth
    | ParsedLnurlPay
    | ParsedLnurlWithdraw
    | ParsedWebsite
    | ParsedUnknownData
    | ParsedBolt11
    | undefined
> {
    const lowerCaseRaw = raw.toLowerCase()
    // Ignore Fedi deep links AND universal links — they’re parsed elsewhere.
    if (lowerCaseRaw.startsWith('fedi:') || isUniversalLink(raw)) return

    // Strip lightning/lnurl protocol for uniformity, keep track of if we were passed a full URL.
    const lnRaw = stripProtocol(lowerCaseRaw, 'lnurl', 'lightning')
    let lnurlParamPromise: ReturnType<typeof getLnurlParams> | undefined
    const isWebsiteUrl = validateWebsiteUrl(raw)
    const isValidIdentifier = isValidInternetIdentifier(lnRaw)

    // LNURLs, HTTP URLs and lightning addresses all use `getLnurlParams` and
    // are handled the same way, so get the promise separately but handle it
    // in one place.
    if (lnRaw.startsWith('lnurl') || lnRaw.startsWith('keyauth')) {
        lnurlParamPromise = getLnurlParams(lnRaw)
    } else if (isValidIdentifier) {
        const [username, domain] = lnRaw.split('@')
        if (username && domain) {
            const url = `https://${domain}/.well-known/lnurlp/${username}`
            lnurlParamPromise = getLnurlParams(url)
        }
    } else if (isWebsiteUrl) {
        // Use raw and not lnRaw for http(s) to keep original casing.
        lnurlParamPromise = getLnurlParams(raw)
    }

    // If we didn't detect an LNURL but it was a valid website URL, return that.
    // Otherwise bail out.
    if (!lnurlParamPromise) {
        if (isWebsiteUrl) {
            return {
                type: ParserDataType.Website,
                data: { url: raw },
            }
        }
        return
    }

    try {
        const params = await lnurlParamPromise
        if (!('tag' in params)) {
            // Parse certain error types for special handling.
            if (params.status === 'ERROR') {
                if (
                    params.reason.includes('Invalid URL') ||
                    params.reason.includes('invalid lnurl') ||
                    params.reason.includes('invalid JSON') ||
                    params.reason.includes('Network request failed') ||
                    // Some websites return the HTML for the 404 page
                    params.reason.includes('<!DOCTYPE html>')
                ) {
                    // If this was a website URL that just didn't return LNURL
                    // data, return it as a parsed website.
                    if (isWebsiteUrl) {
                        return {
                            type: ParserDataType.Website,
                            data: { url: raw },
                        }
                    } else if (isValidIdentifier) {
                        return {
                            type: ParserDataType.Unknown,
                            data: { message: t('errors.no-address-lnurlp') },
                        }
                    }
                    // Otherwise ignore and allow other parsers to try.
                    else {
                        return
                    }
                }
                return {
                    type: ParserDataType.Unknown,
                    // TODO: i18n?
                    data: { message: params.reason },
                }
            }
        } else if (params.tag === 'payRequest') {
            const description = params.decodedMetadata.find(
                m => m[0] === 'text/plain',
            )?.[1]
            const longDescription = params.decodedMetadata.find(
                m => m[0] === 'text/long-desc',
            )?.[1]
            const thumbnail = params.decodedMetadata.find(m =>
                m[0].startsWith('image/'),
            )?.[1]

            // If min and max are the same, then the amount is exact
            // In this case, the callback URL should be treated the same as a lightning address callback URL
            if (params.minSendable === params.maxSendable) {
                const callbackUrl = new URL(params.callback)
                callbackUrl.searchParams.set(
                    'amount',
                    params.minSendable.toString(),
                )

                // Don't use lnurlCallback, success does not have `status: 'OK'`
                const res = await fetch(callbackUrl.toString())
                    .then(r => r.json())
                    .catch(() => ({ status: 'ERROR' }))
                if (
                    !res.pr ||
                    typeof res.pr !== 'string' ||
                    res.status === 'ERROR'
                ) {
                    throw new Error(res.reason || 'errors.unknown-error')
                }

                return parseBolt11(res.pr, fedimint, t, federationId)
            }

            return {
                type: ParserDataType.LnurlPay,
                data: {
                    domain: params.domain,
                    callback: params.callback,
                    metadata: params.decodedMetadata,
                    minSendable: params.minSendable as MSats | undefined,
                    maxSendable: params.maxSendable as MSats | undefined,
                    description,
                    longDescription,
                    thumbnail,
                },
            }
        } else if (params.tag === 'withdrawRequest') {
            return {
                type: ParserDataType.LnurlWithdraw,
                data: {
                    domain: params.domain,
                    callback: params.callback,
                    k1: params.k1,
                    defaultDescription: params.defaultDescription,
                    minWithdrawable: params.minWithdrawable as
                        | MSats
                        | undefined,
                    maxWithdrawable: params.maxWithdrawable as
                        | MSats
                        | undefined,
                },
            }
        } else if (params.tag === 'login') {
            return {
                type: ParserDataType.LnurlAuth,
                data: {
                    domain: params.domain,
                    callback: params.callback,
                    k1: params.k1,
                    // TODO: https://github.com/nbd-wtf/js-lnurl/issues/9
                    // action: params.action,
                },
            }
        } else {
            log.warn('parseLnurl unsupported LNURL params', params)
            return {
                type: ParserDataType.Unknown,
                data: {
                    message: t('feature.parser.unsupported-lnurl', {
                        type: params.tag,
                    }),
                },
            }
        }
    } catch (err) {
        log.warn('parseLnurl error', err)
        /* no-op, other parsers will be attempted */
    }
}

/**
 * Attempt to parse a BOLT 11 invoice.
 * BOLT 11 docs: https://github.com/lightning/bolts/blob/master/11-payment-encoding.md
 *
 * isBolt11 can be used to avoid using the bridge to
 * do a full decoding which requires a federationId to include
 * fee details
 */
export function isBolt11(raw: string) {
    // Quick detection of BOLT 11, but ignore BOLT 12 and LNURL.
    if (
        !raw.startsWith('ln') ||
        raw.startsWith('lno') ||
        raw.startsWith('lnurl')
    ) {
        return false
    }

    const bolt11Regex = /^(?:ln(?:bc|tb|tbs|bcrt))[0-9a-zA-Z]{30,}$/
    return bolt11Regex.test(raw)
}

export async function parseBolt11(
    raw: string,
    fedimint: FedimintBridge,
    t: TFunction,
    federationId: string | null = null,
): Promise<ParsedBolt11 | ParsedUnknownData | undefined> {
    const lnRaw = stripProtocol(raw, 'lightning').toLowerCase()
    if (!isBolt11(lnRaw)) {
        return
    }

    try {
        const decoded = await fedimint.decodeInvoice(lnRaw, federationId)

        return {
            type: ParserDataType.Bolt11,
            data: decoded,
        }
    } catch (err) {
        // Attempt to parse error messages for meaningful failures
        if (err instanceof Error) {
            if (err.message.includes('Invoice missing amount')) {
                return {
                    type: ParserDataType.Unknown,
                    data: {
                        message: t(
                            'feature.parser.unsupported-bolt11-zero-amount',
                        ),
                    },
                }
            }
        }
        // Otherwise, return nothing and let other parsers try
        log.warn('parseBolt11 error', err)
    }
}

/**
 * Attempt to parse a BOLT 12 invoice. Currently not supported, so no data is
 * actually parsed from the invoice.
 * BOLT 12 docs: https://bolt12.org/
 */
function parseBolt12(raw: string): ParsedBolt12 | undefined {
    const lnRaw = stripProtocol(raw, 'lightning').toLowerCase()
    if (lnRaw.startsWith('lno1')) {
        return { type: ParserDataType.Bolt12, data: null }
    }
}

/**
 * Parse any kind of on-chain address. Only handles raw addresses, URIs are
 * handled by BIP 21.
 */
function parseBitcoinAddress(raw: string): ParsedBitcoinAddress | undefined {
    if (validateBitcoinAddress(raw)) {
        return {
            type: ParserDataType.BitcoinAddress,
            data: { address: raw },
        }
    }
}

/**
 * Parse a BIP 21 URI. Extended with unified QR code lightning support.
 * BIP 21 docs: https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki
 * Unified QR code docs: https://bitcoinqr.dev/
 */
async function parseBip21(
    raw: string,
    fedimint: FedimintBridge,
    federationId: string | undefined,
): Promise<ParsedBip21 | ParsedBolt11 | undefined> {
    // Only consider things that start with URIs, otherwise it's handled by parseBitcoinAddress.
    if (!raw.toLowerCase().startsWith('bitcoin:')) return

    // Strip protocol but don't lower case, query param values may be case sensitive
    const btcRaw = stripProtocol(raw, 'bitcoin')
    const btcAddress = btcRaw.split('?')[0]
    if (!validateBitcoinAddress(btcAddress)) {
        return
    }

    // Parse query params on BIP 21
    const queryParams = qs.parse(btcRaw.split('?')[1] || '')
    const param = (key: string): string | undefined => {
        const qp = queryParams[key]
        const value = qp ? (Array.isArray(qp) ? qp[0] : qp) : null
        return value === null ? undefined : value
    }
    const amount = param('amount')
    const label = param('label')
    const message = param('message')
    const bolt11 = param('lightning')

    // If lightning invoice is present, return this as a bolt11 rather than a bip21
    if (bolt11) {
        try {
            // TODO: allow parsing with no federation ID
            if (!federationId) return
            const invoice = await fedimint.decodeInvoice(bolt11, federationId)
            return {
                type: ParserDataType.Bolt11,
                data: {
                    fallbackAddress: btcAddress,
                    ...invoice,
                },
            }
        } catch (err) {
            /* no-op, return bip21 as-is */
        }
    }

    return {
        type: ParserDataType.Bip21,
        data: {
            address: btcAddress,
            amount: amount ? (parseFloat(amount) as Btc) : undefined,
            label,
            message,
        },
    }
}

async function parseFediUri(
    raw: string,
    fedimint: FedimintBridge,
): Promise<
    | ParsedLegacyFediChatGroup
    | ParsedLegacyFediChatMember
    | ParsedFediChatUser
    | ParsedFediChatRoom
    | undefined
> {
    if (!raw.toLowerCase().startsWith('fedi:')) {
        return
    }

    // Chat room
    try {
        const id = decodeFediMatrixRoomUri(raw)
        return {
            type: ParserDataType.FediChatRoom,
            data: { id },
        }
    } catch {
        // no-op
    }

    // Chat user
    try {
        const id = decodeFediMatrixUserUri(raw)

        // Fetch profile info for displayName
        const { data } = await fedimint.matrixUserProfile({ userId: id })

        if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
            const { displayname: displayName } = data

            // TODO: narrow return type of matrixUserProfile RPC and remove this check
            if (typeof displayName !== 'string') throw new Error()

            return {
                type: ParserDataType.FediChatUser,
                data: { id, displayName },
            }
        }
    } catch {
        // no-op
    }

    // Legacy Chat member
    try {
        const id = decodeLegacyDirectChatLink(raw)
        return {
            type: ParserDataType.LegacyFediChatMember,
            data: { id },
        }
    } catch {
        // no-op
    }

    // Legacy Chat group
    try {
        const id = decodeLegacyGroupInvitationLink(raw)
        return {
            type: ParserDataType.LegacyFediChatGroup,
            data: { id },
        }
    } catch {
        // no-op
    }
}

function parseFedimintInvite(raw: string): ParsedFederationInvite | undefined {
    // Federation invite code
    // TODO: Proper bech32 validation
    // TODO: Use future bridge method for fetching federation info https://github.com/fedibtc/fedi/issues/1380
    // TODO: Consider standard URI prefix?
    if (raw.toLowerCase().startsWith('fed1')) {
        return { type: ParserDataType.FedimintInvite, data: { invite: raw } }
    }
}

function parseCommunityInvite(raw: string): ParsedCommunityInvite | undefined {
    // Federation invite code
    // TODO: Proper validation
    // TODO: Consider standard URI prefix?
    if (raw.toLowerCase().startsWith('fedi:community')) {
        return { type: ParserDataType.CommunityInvite, data: { invite: raw } }
    }
}

async function parseFedimintEcash(
    raw: string,
    fedimint: FedimintBridge,
): Promise<ParsedFedimintEcash | undefined> {
    try {
        if (raw.startsWith('cashu')) throw new Error()
        // Since we're already calling `parseEcash`, might as well return the parsed value
        const ecash = await fedimint.parseEcash(raw)
        return {
            type: ParserDataType.FedimintEcash,
            data: { token: raw, parsed: ecash },
        }
    } catch {
        // no-op
    }
}

async function parseStabilityAddress(
    raw: string,
    fedimint: FedimintBridge,
): Promise<ParsedStabilityAddress | undefined> {
    try {
        const data = await fedimint.spv2ParsePaymentAddress(raw)
        return {
            type: ParserDataType.StabilityAddress,
            // Include the raw payment request for the confirmation screen.
            data: { ...data, address: raw },
        }
    } catch {
        // no-op
    }
}

async function parseCashuEcash(
    raw: string,
): Promise<ParsedCashuEcash | undefined> {
    try {
        await validateCashuTokens(raw)
        return { type: ParserDataType.CashuEcash, data: { token: raw } }
    } catch {
        // no-op
    }
}

/**
 * Removes the protocol from the front of a string. Supports both
 * `protocol:` and `protocol://` formats, case insensitive.
 */
function stripProtocol(raw: string, ...protocol: string[]) {
    for (const p of protocol) {
        /**
         * "^" operand matches the start of string,
         * which in this case consists of ${p} string, followed by ":" and optionally one or two forward slashes,
         * which are preceeded by a double backslash:
         * - the first backslash acts as an escape character for the following backslash within the context of the JS string;
         * - the second backslash acts as an escape character within the context of the RegExp for the forward slash;
         * - the following "?" acts as an optional modifier for the slashes,
         * so that 'protocol:', 'protocol:/' and 'protocol://' prefixes satisfy the RegExp.
         *
         * The 'i' flag makes the entire RegExp case-insensitive, because QR code standards sometimes use uppercase strings
         */
        const pattern = new RegExp(`^${p}:\\/?\\/?`, 'i')
        if (pattern.test(raw)) return raw.replace(pattern, '')
    }
    return raw
}

function validateWebsiteUrl(url: string) {
    // Only fully-qualified HTTP(S) URLs, partial ones are too ambiguous.
    // Universal links are not generic websites.
    if (isUniversalLink(url)) return false
    if (
        !url.toLowerCase().startsWith('http://') &&
        !url.toLowerCase().startsWith('https://')
    ) {
        return false
    }
    try {
        new URL(url)
        return true
    } catch {
        // no-op
    }
    return false
}
