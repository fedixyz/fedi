import { ok, ResultAsync } from 'neverthrow'
import { z } from 'zod'

import {
    MSats,
    ParsedLnurlAuth,
    ParsedLnurlPay,
    ParsedLnurlWithdraw,
} from '../types'
import { RpcPayInvoiceResponse } from '../types/bindings'
import {
    FetchError,
    MalformedDataError,
    NotOkHttpResponseError,
    SchemaValidationError,
    UrlConstructError,
} from '../types/errors'
import { BridgeError, TaggedError } from './errors'
import { FedimintBridge } from './fedimint'
import {
    constructUrl,
    ensureHttpResponseOk,
    fetchResult,
    thenJson,
    throughZodSchema,
} from './neverthrow'

// Matches the typical LNURL Error response object. See:
// LNURL Pay: https://github.com/lnurl/luds/blob/luds/06.md
// LNURL Withdraw: https://github.com/lnurl/luds/blob/luds/03.md
const lnurlErrorResponseSchema = z.object({
    status: z.literal('ERROR'),
    reason: z.string().nullish(),
})

// Matches the response object from the LNURL Pay spec
// https://github.com/lnurl/luds/blob/luds/06.md
const lnurlPayResponseSchema = z.object({
    pr: z.string(),
    routes: z.array(z.never()).optional(),
})

// Matches the typical LNURL OK response object. See:
// https://github.com/lnurl/luds/blob/luds/03.md
const lnurlOkResponseSchema = z.object({
    status: z.literal('OK'),
})

/**
 * Bubbles up a `FetchError` if the response matches the LNURL error response schema
 */
const lnurlNonError = (data: unknown) =>
    throughZodSchema(lnurlErrorResponseSchema)(data).match(
        res =>
            new TaggedError('FetchError')
                .withMessage(res.reason || 'errors.unknown-error')
                .intoErr(),
        () => ok(data),
    )

/**
 * Submit a fetch request to an LNURL callback
 * Bubbles up a `FetchError` if the response is of status `ERROR`
 */
export function lnurlCallback(
    callbackUrl: URL,
): ResultAsync<
    z.infer<typeof lnurlOkResponseSchema>,
    | UrlConstructError
    | FetchError
    | MalformedDataError
    | SchemaValidationError
    | NotOkHttpResponseError
> {
    return fetchResult(callbackUrl.toString())
        .andThen(ensureHttpResponseOk)
        .andThen(thenJson)
        .andThrough(lnurlNonError)
        .andThen(throughZodSchema(lnurlOkResponseSchema))
}

/**
 * Given a federation and a set of parsed LNURL Auth data, submit an auth request.
 */
export function lnurlAuth(
    fedimint: FedimintBridge,
    lnurlData: ParsedLnurlAuth['data'],
): ResultAsync<
    z.infer<typeof lnurlOkResponseSchema>,
    | BridgeError
    | UrlConstructError
    | MalformedDataError
    | SchemaValidationError
    | FetchError
    | NotOkHttpResponseError
> {
    return fedimint
        .rpcResult('signLnurlMessage', {
            domain: lnurlData.domain,
            message: lnurlData.k1,
        })
        .andThen(({ signature, pubkey }) =>
            constructUrl(lnurlData.callback).map(url => {
                url.searchParams.set('sig', signature)
                url.searchParams.set('key', pubkey)

                return url
            }),
        )
        .andThen(lnurlCallback)
}

/**
 * Given a federation, parsed lnurl pay data, and an amount, pay an invoice
 * provided by an LNURL callback.
 */
export function lnurlPay(
    fedimint: FedimintBridge,
    federationId: string,
    lnurlData: ParsedLnurlPay['data'],
    amount: MSats,
    notes?: string,
): ResultAsync<
    RpcPayInvoiceResponse,
    | UrlConstructError
    | MalformedDataError
    | SchemaValidationError
    | FetchError
    | BridgeError
    | NotOkHttpResponseError
> {
    return constructUrl(lnurlData.callback)
        .map(url => {
            url.searchParams.set('amount', amount.toString())

            return url.toString()
        })
        .asyncAndThen(fetchResult)
        .andThen(ensureHttpResponseOk)
        .andThen(thenJson)
        .andThrough(lnurlNonError)
        .andThen(throughZodSchema(lnurlPayResponseSchema))
        .andThen(res =>
            fedimint.rpcResult('payInvoice', {
                invoice: res.pr,
                federationId,
                frontendMetadata: {
                    initialNotes: notes || null,
                    recipientMatrixId: null,
                    senderMatrixId: null,
                },
            }),
        )
}

/**
 * Given a federation, parsed lnurl withdraw data, and an amount, generate an
 * invoice and submit a withdraw request. Promise resolves when the server
 * responds, not when the payment has been made, so you should listen for
 * the payment on the fedimint bridge side after calling this.
 */
export function lnurlWithdraw(
    fedimint: FedimintBridge,
    federationId: string,
    lnurlData: ParsedLnurlWithdraw['data'],
    amount: MSats,
    note?: string,
): ResultAsync<
    string,
    | UrlConstructError
    | FetchError
    | MalformedDataError
    | SchemaValidationError
    | BridgeError
    | NotOkHttpResponseError
> {
    return constructUrl(lnurlData.callback)
        .asyncAndThen(url =>
            fedimint
                .rpcResult('generateInvoice', {
                    federationId,
                    amount,
                    description: note ?? '',
                    expiry: null,
                    frontendMetadata: {
                        initialNotes: note ?? '',
                        recipientMatrixId: null,
                        senderMatrixId: null,
                    },
                })
                .map(invoice => ({ url, invoice })),
        )
        .map(({ url, invoice }) => {
            url.searchParams.set('k1', lnurlData.k1)
            url.searchParams.set('pr', invoice)

            return { url, invoice }
        })
        .andThen(({ url, invoice }) => lnurlCallback(url).map(() => invoice))
}
