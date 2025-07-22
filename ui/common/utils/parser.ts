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
    ParsedFederationInvite,
    ParsedFediChatRoom,
    ParsedFediChatUser,
    ParsedFedimintEcash,
    ParsedLegacyFediChatGroup,
    ParsedLegacyFediChatMember,
    ParsedLnurlAuth,
    ParsedLnurlPay,
    ParsedLnurlWithdraw,
    ParsedOfflineError,
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

async function parseFediUniversalLink(
    raw: string,
    fedimint: FedimintBridge,
): Promise<
    | ParsedLegacyFediChatGroup
    | ParsedLegacyFediChatMember
    | ParsedFediChatUser
    | ParsedFediChatRoom
    | undefined
> {
    if (!isUniversalLink(raw)) return

    const deep = universalToFedi(raw) // → fedi://user/... or ''
    if (!deep) return

    // Re-use the existing Fedi-URI parser
    return parseFediUri(deep, fedimint)
}

/**
 * Parses any data that would the user would input via QR code, copy / paste etc.
 * Returns a structured object that identifies the type of data, and formatted
 * keys for the data where available.
 */ export function parseUserInput<T extends TFunction>(
    raw: string,
    fedimint: FedimintBridge,
    t: T,
    federationId: string | undefined = undefined,
    isInternetUnreachable: boolean,
): Promise<AnyParsedData> {
    raw = raw.trim()

    return new Promise(resolve => {
        let resolved = false

        // Offline parsers (do not require network)
        const offlineParsers: (() => Promise<AnyParsedData | undefined>)[] = [
            async () => {
                log.debug('Running offline parser: parseBitcoinAddress')
                return Promise.resolve(parseBitcoinAddress(raw))
            },
            async () => {
                log.debug('Running offline parser: parseBip21')
                return parseBip21(raw, fedimint, federationId)
            },
            async () => {
                log.debug('Running offline parser: parseFedimintEcash')
                return parseFedimintEcash(raw, fedimint)
            },
            async () => {
                log.debug('Running offline parser: parseCashuEcash')
                return parseCashuEcash(raw)
            },
        ]

        // Online parsers (require internet access)
        const onlineParsers: (() => Promise<AnyParsedData | undefined>)[] = [
            async () => {
                log.debug('Running online parser: parseBolt11')
                return parseBolt11(raw, fedimint, t, null)
            },
            async () => {
                log.debug('Running online parser: parseBolt12')
                return Promise.resolve(parseBolt12(raw))
            },
            async () => {
                log.debug('Running online parser: parseFediUniversalLink')
                return parseFediUniversalLink(raw, fedimint)
            },
            async () => {
                log.debug('Running online parser: parseLnurl')
                return parseLnurl(raw, fedimint, t, federationId)
            },
            async () => {
                log.debug('Running online parser: parseFediUri')
                return parseFediUri(raw, fedimint)
            },
            async () => {
                log.debug('Running online parser: parseFedimintInvite')
                return Promise.resolve(parseFedimintInvite(raw))
            },
            async () => {
                log.debug('Running online parser: parseCommunityInvite')
                return Promise.resolve(parseCommunityInvite(raw))
            },
        ]

        /**
         * Runs parsers in parallel and resolves as soon as one succeeds.
         */
        const runParsers = async (
            parsers: (() => Promise<AnyParsedData | undefined>)[],
            type: 'offline' | 'online',
        ) => {
            log.info(`Running ${type} parsers...`)

            const parserPromises = parsers.map(parser =>
                parser()
                    .then(result => {
                        if (result) {
                            log.info(
                                `${type.toUpperCase()} parser succeeded! Type:`,
                                result.type,
                            )
                        } else {
                            log.info(
                                `${type.toUpperCase()} parser returned undefined.`,
                            )
                        }
                        if (result && !resolved) {
                            resolved = true
                            resolve(result)
                        }
                    })
                    .catch(err => {
                        log.error(`${type.toUpperCase()} parser error:`, err)
                    }),
            )

            // Wait for all parsers to finish
            return Promise.all(parserPromises).then(() => {
                if (!resolved) {
                    log.warn(`All ${type} parsers failed.`)
                }
            })
        }

        // Step 1: Run **offline parsers** immediately
        runParsers(offlineParsers, 'offline').then(() => {
            // Step 2: If online, run **online parsers**
            if (!isInternetUnreachable) {
                runParsers(onlineParsers, 'online').then(() => {
                    // Step 3: If still unresolved, return UNKNOWN
                    if (!resolved) {
                        log.warn('All parsers failed. Returning Unknown type.')
                        resolve({
                            type: ParserDataType.Unknown,
                            data: {},
                        })
                    }
                })
            } else if (!resolved) {
                // Step 4: If offline, return "OfflineError"
                resolve({
                    type: ParserDataType.OfflineError,
                    data: {
                        title: t('feature.omni.error-network-offline-title'),
                        message: t(
                            'feature.omni.error-network-offline-message',
                        ),
                    },
                } as ParsedOfflineError)
            }
        })
    })
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
    // Ignore Fedi URIs, they can sometimes look like URLs.
    if (raw.toLowerCase().startsWith('fedi:')) return

    // Strip lightning/lnurl protocol for uniformity, keep track of if we were passed a full URL.
    const lnRaw = stripProtocol(raw, 'lnurl', 'lightning').toLowerCase()
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
        const { displayname } = await fedimint.matrixUserProfile({ userId: id })

        // TODO: narrow return type of matrixUserProfile RPC and remove this check
        if (typeof displayname !== 'string') throw new Error()

        return {
            type: ParserDataType.FediChatUser,
            data: { id, displayName: displayname },
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
        // Since we're already calling `validateEcash`, might as well return the parsed value
        const ecash = await fedimint.validateEcash(raw)
        return {
            type: ParserDataType.FedimintEcash,
            data: { token: raw, parsed: ecash },
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
        if (raw.startsWith(p))
            return raw.replace(new RegExp(`^${p}:\\/?\\/?`, 'i'), '')
    }
    return raw
}

function validateWebsiteUrl(url: string) {
    // Only fully-qualified HTTP(S) URLs, partial ones are too ambiguous.
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
