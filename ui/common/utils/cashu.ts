import { MSats, Sats } from '@fedi/common/types'

import amountUtils from './AmountUtils'
import {
    ResultObject,
    ResultValue,
    decodeCBOR,
    isValidResultType,
} from './cbor'
import { FedimintBridge } from './fedimint'
import { makeLog } from './log'

const log = makeLog('common/utils/cashu')

type PayloadProof = {
    amount: number
    secret: string
    C: string
    id: string
}

type PayloadToken = {
    proofs: PayloadProof[]
}

type Payload = {
    token: PayloadToken[]
    mint: string
}

type Proof = {
    amount: number
    secret: string
    C: string
}

type Token = {
    proofs: Proof[]
    id: string
}

export type ParsedToken = {
    token: Token[]
    unit?: string
    mint: string
    memo?: string
}

type MeltQuoteResponse = {
    quote: string // Id of the cashu quote
    amount: Sats
    fee_reserve: Sats
}

type MeltPayload = {
    quote: string
    inputs: Array<Proof>
}

type MeltQuote = {
    mintHost: string
    meltPayload: MeltPayload
    amountMsats: MSats
    feesMsats: MSats
}

export type MeltSummary = {
    quotes: MeltQuote[]
    totalFees: MSats
    totalAmount: MSats
}

export type MeltResult = {
    mSats: MSats
}

type CashuV4Proof = {
    a: number
    s: string
    c: Uint8Array
    d: ResultObject | undefined
    w: string | undefined
}

export type CashuV4Token = {
    i: Uint8Array
    p: Array<CashuV4Proof>
}

type ValidCashuV4Token = {
    m: string
    u: string
    d: string | undefined
    t: Array<CashuV4Token>
}

// TODO: Add complete validation
export function validateCashuTokens(raw: string) {
    let token = raw
    const uriPrefixes = ['web+cashu://', 'cashu://', 'cashu:']
    uriPrefixes.forEach(prefix => {
        if (token.startsWith(prefix)) {
            token = token.slice(prefix.length)
        }
    })
    if (!token.startsWith('cashuA') && !token.startsWith('cashuB')) {
        throw new Error('Invalid cashu token')
    }
    return token
}
const bufferFromBase64Url = (str: string) => {
    return Buffer.from(str.replace('-', '+').replace('_', '/'), 'base64')
}

const decodeCashuTokenLegacy = (token: string): Payload => {
    const rawToken = token.replace('cashuA', '')
    const parsedTokenBuffer = JSON.parse(
        bufferFromBase64Url(rawToken).toString(),
    )
    // check if v3
    if (
        'token' in parsedTokenBuffer &&
        Array.isArray(parsedTokenBuffer.token)
    ) {
        // TODO... coerce with zod
        const mint = parsedTokenBuffer.token[0].mint
        const proofs = parsedTokenBuffer.token[0].proofs
        return {
            mint,
            token: [{ proofs }],
        }
    }
    // if v2 token return v3 format
    // TODO... coerce with zod
    if (
        'proofs' in parsedTokenBuffer &&
        'mints' in parsedTokenBuffer &&
        parsedTokenBuffer.mints.length > 0 &&
        parsedTokenBuffer.mints[0].url
    ) {
        const mint = parsedTokenBuffer.token[0].mint
        const proofs = parsedTokenBuffer.token[0].proofs
        return {
            mint,
            token: [{ proofs }],
        }
    }
    // check if v1
    // TODO... coerce with zod
    if (Array.isArray(parsedTokenBuffer)) {
        throw new Error('v1 cashu tokens are not supported')
    }
    throw new Error('No valid ecash proofs found')
}

const isValidCashuV4Token = (
    decodedToken: ResultValue,
): decodedToken is ValidCashuV4Token => {
    if (!isValidResultType(decodedToken)) return false
    if (typeof decodedToken.m !== 'string') return false
    if (typeof decodedToken.u !== 'string') return false
    if (typeof decodedToken.d !== 'string' && decodedToken.d !== undefined)
        return false
    if (!Array.isArray(decodedToken.t)) return false

    for (const token of decodedToken.t) {
        if (!isValidResultType(token)) return false
        if (!('i' in token) || !('p' in token)) return false
        if (!(token.i instanceof Uint8Array)) return false
        if (!Array.isArray(token.p)) return false

        for (const proof of token.p) {
            if (!isValidResultType(proof)) return false
            if (typeof proof.a !== 'number') return false
            if (typeof proof.s !== 'string') return false
            if (!(proof.c instanceof Uint8Array)) return false
            if (proof.d !== undefined && typeof proof.d !== 'object')
                return false
            if (proof.w !== undefined && typeof proof.w !== 'string')
                return false
        }
    }
    return true
}

const parseSingleCashuV4Token = (token: CashuV4Token): PayloadToken => {
    return {
        proofs: token.p.map(proof => ({
            id: Buffer.from(token.i).toString('hex'),
            amount: proof.a,
            secret: proof.s,
            C: Buffer.from(proof.c).toString('hex'),
        })),
    }
}

const coerceCashuV4TokensArray = (tokens: CashuV4Token[]): PayloadToken[] => {
    return tokens.map(parseSingleCashuV4Token)
}

const decodeCashuTokenV4 = (token: string): Payload => {
    const rawToken = token.replace('cashuB', '')
    const parsedToken = decodeCBOR(bufferFromBase64Url(rawToken))
    if (!isValidResultType(parsedToken)) {
        throw new Error('Invalid cashu token')
    }
    if (!isValidCashuV4Token(parsedToken)) {
        throw new Error('Invalid cashu token')
    }

    return {
        mint: parsedToken.m,
        token: coerceCashuV4TokensArray(parsedToken.t),
    }
}

// Takes cashu note, parses it into individual tokens for each mint
// Then, we melt for each mint (convert to lightning invoices and pay self)
export function decodeCashuTokens(raw: string): Payload {
    // remove prefixes
    const token = validateCashuTokens(raw)
    return token.startsWith('cashuA')
        ? decodeCashuTokenLegacy(token)
        : decodeCashuTokenV4(token)
}

// Given a lightning invoice, the cashu mint responds with a quoted
// amount of cashu ecash tokens to pay.
// Need to call this for each parsed token that belongs to a different mint
async function getMeltQuote(
    mintHost: string,
    invoice: string,
): Promise<MeltQuoteResponse> {
    log.debug('getMeltQuote mintHost, invoice', mintHost, invoice)
    const feeResponse = await fetch(`${mintHost}/v1/melt/quote/bolt11`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ request: invoice, unit: 'sat' }),
    })
    const json = await feeResponse.json()
    log.debug('getMeltQuote json', json)

    return json
}

// Pays the invoice
/**
 * @param mintHost URL of the cashu mint
 * @param payload contains quoteId and ecash to pay the quote
 * @returns the result after paying the invoice from the cashu mint
 */
async function meltTokens(mintHost: string, payload: MeltPayload) {
    const response = await fetch(`${mintHost}/v1/melt/bolt11`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    })

    return await response.json()
}

async function buildMeltPayload(
    meltQuoteId: string,
    proofs: Proof[],
): Promise<MeltPayload> {
    const meltPayload: MeltPayload = {
        quote: meltQuoteId,
        inputs: proofs,
    }
    return meltPayload
}

// Tries to create an invoice
async function getInvoiceFee(
    amountMsats: MSats,
    federationId: string,
    mintHost: string,
    fedimint: FedimintBridge,
) {
    const invoice = await fedimint.generateInvoice(
        amountMsats,
        'cashu melt',
        federationId,
    )
    const meltQuote = await getMeltQuote(mintHost, invoice)
    const { fee_reserve } = meltQuote
    return amountUtils.satToMsat(fee_reserve)
}

// After we have a quote for melting ecash,
// we need to an "updated" quote that includes the new fees
async function getUpdatedMeltQuote(
    totalTokensSats: Sats,
    federationId: string,
    mintHost: string,
    fedimint: FedimintBridge,
): Promise<{
    amountMsats: MSats
    meltQuoteId: string
    quoteFeeReserveMsats: MSats
}> {
    const amountMsats = amountUtils.satToMsat(totalTokensSats) // Total amount to send
    // Start with max fee to ensure at least 1 melt quote attempt
    // If the fees are <= fee reserve it continues with the melt otherwise it makes another invoice using the new fees
    const targetFee = await getInvoiceFee(
        amountMsats,
        federationId,
        mintHost,
        fedimint,
    )

    // TODO: Add retrying
    const candidateAmount = (amountMsats - targetFee) as MSats
    const candidateInvoice = await fedimint.generateInvoice(
        candidateAmount,
        'cashu melt',
        federationId,
    )
    const quote = await getMeltQuote(mintHost, candidateInvoice)
    const quotedAmount = amountUtils.satToMsat(quote.amount)
    const quotedFees = amountUtils.satToMsat(quote.fee_reserve)
    log.debug('meltQuote?.quote', quote?.quote)

    return {
        amountMsats: quotedAmount, // Amount you get paid (with fees deducted)
        meltQuoteId: quote.quote,
        quoteFeeReserveMsats: quotedFees,
    }
}

/**
 *  After a cashu note is scanned, we want to convert the ecash tokens into fedimint.
 *  We do this by generating lightning invoices from the user's fedimint wallet for each cashu token
 *  and then paying the invoices from the cashu mint.
 *
 * @param tokens Cashu Tokens to melt (ecash --> lightning receive into fedimint)
 * @param fedimint Bridge
 * @param federationId federationId of the destination for melted ecash tokens
 * @returns
 */
export async function getMeltQuotes(
    tokens: Payload,
    fedimint: FedimintBridge,
    federationId: string | undefined,
): Promise<MeltSummary> {
    if (!federationId) throw new Error('No federation id')
    const quotes: MeltQuote[] = []

    // Iterate over each token
    for (const token of tokens.token) {
        const mintHost = tokens.mint
        const proofs = token.proofs
        log.debug('token.proofs', token.proofs)

        // Check if we have enough tokens
        const totalTokensSats = proofs.reduce(
            (sum, proof) => sum + proof.amount,
            0,
        ) as Sats

        // amountMsats is the amount you get paid (with fees deducted)
        const { amountMsats, meltQuoteId, quoteFeeReserveMsats } =
            await getUpdatedMeltQuote(
                totalTokensSats,
                federationId,
                mintHost,
                fedimint,
            )

        // Build the melt payload
        const meltPayload = await buildMeltPayload(meltQuoteId, proofs)
        log.debug('meltPayload', meltPayload)

        quotes.push({
            mintHost,
            meltPayload,
            amountMsats,
            feesMsats: quoteFeeReserveMsats,
        })
    }
    const totalFees = quotes.reduce(
        (sum, quote) => sum + quote.feesMsats,
        0,
    ) as MSats
    const totalAmount = quotes.reduce(
        (sum, quote) => sum + quote.amountMsats,
        0,
    ) as MSats
    // calculate total values/fees by summing quotes
    return {
        quotes,
        totalFees,
        totalAmount,
    }
}

/**
 *
 * Takes a list of melt quotes and executes them
 *
 * @param quotes List of melt quotes
 * @returns MeltResult
 */
export async function executeMelts(
    meltSummary: MeltSummary,
): Promise<MeltResult> {
    let totalMelted: MSats = 0 as MSats
    for (const quote of meltSummary.quotes) {
        const { mintHost, meltPayload, amountMsats } = quote
        const meltData = await meltTokens(mintHost, meltPayload)
        log.debug('meltData', meltData)
        if (!meltData.paid) {
            throw new Error('Payment failed')
        }
        // Add the amount melted for this token to the total
        totalMelted = (totalMelted + amountMsats) as MSats
    }

    log.debug('totalMelted', totalMelted)
    return { mSats: totalMelted }
}
