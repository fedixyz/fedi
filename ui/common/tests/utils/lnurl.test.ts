import { rest } from 'msw'
import { setupServer } from 'msw/node'
import { errAsync, okAsync, ResultAsync } from 'neverthrow'

import { MSats } from '../../types'
import { RpcMethods } from '../../types/bindings'
import { BridgeError } from '../../utils/errors'
import {
    lnurlAuth,
    lnurlCallback,
    lnurlPay,
    lnurlWithdraw,
} from '../../utils/lnurl'
import { constructUrl } from '../../utils/neverthrow'
import { fedimint } from '../../utils/remote-bridge'

const lnurlOkCallbackUrl = 'https://lnurl-ok-callback-url.com'
const lnurlErrorCallbackUrl = 'https://lnurl-error-callback.com'
const lnurlInvalidJsonUrl = 'https://lnurl-invalid-json.com'
const lnurlInvalidHtmlUrl = 'https://lnurl-invalid-html.com'
const lnurlPayCallbackUrl = 'https://lnurl-pay-callback.com'

const lnurlOkResponse = { status: 'OK' }
const lnurlErrorResponse = { status: 'ERROR', reason: 'foo' }
const lnurlInvalidHtmlResponse = '<html>hi</html>'
const lnurlInvalidJsonResponse = { foo: 'bar' }
const lnurlPayResponse = { pr: 'lnbc123456', routes: [] }
const lnurlWithdrawInvoice = 'lnbc123456'

const testFederationId = 'fed123456'

jest.mock('../../utils/remote-bridge', () => ({
    fedimint: {
        rpcResult: function <T extends keyof RpcMethods>(
            method: T,
            _params: RpcMethods[T][0],
        ): ResultAsync<RpcMethods[T][1], BridgeError> {
            if (method === 'signLnurlMessage') {
                return okAsync({
                    signature: 'foo',
                    pubkey: 'bar',
                })
            }

            if (method === 'payInvoice') {
                return okAsync({
                    preimage: 'preimage',
                })
            }

            if (method === 'generateInvoice') {
                return okAsync(lnurlWithdrawInvoice)
            }

            return errAsync(
                new BridgeError({
                    errorCode: 'badRequest',
                    error: 'unknown',
                    detail: 'unknown',
                }),
            )
        },
    },
}))

describe('lnurl', () => {
    const server = setupServer(
        rest.get(lnurlOkCallbackUrl, (_req, res, ctx) =>
            res(
                ctx.status(200),
                ctx.set('Content-Type', 'application/json'),
                ctx.body(JSON.stringify(lnurlOkResponse)),
            ),
        ),
        rest.get(lnurlErrorCallbackUrl, (_req, res, ctx) =>
            res(
                ctx.status(500),
                ctx.set('Content-Type', 'application/json'),
                ctx.body(JSON.stringify(lnurlErrorResponse)),
            ),
        ),
        rest.get(lnurlInvalidJsonUrl, (_req, res, ctx) =>
            res(
                ctx.status(200),
                ctx.set('Content-Type', 'application/json'),
                ctx.body(JSON.stringify(lnurlInvalidJsonResponse)),
            ),
        ),
        rest.get(lnurlInvalidHtmlUrl, (_req, res, ctx) =>
            res(
                ctx.status(200),
                ctx.set('Content-Type', 'text/html'),
                ctx.body(lnurlInvalidHtmlResponse),
            ),
        ),
        rest.get(lnurlPayCallbackUrl, (_req, res, ctx) =>
            res(
                ctx.status(200),
                ctx.set('Content-Type', 'application/json'),
                ctx.body(JSON.stringify(lnurlPayResponse)),
            ),
        ),
    )

    beforeEach(() => server.listen())
    afterEach(() => server.resetHandlers())
    afterAll(() => server.close())

    describe('lnurlCallback', () => {
        it('should make a fetch request to an LNURL callback URL', async () => {
            const result =
                await constructUrl(lnurlOkCallbackUrl).asyncAndThen(
                    lnurlCallback,
                )

            expect(result.isOk()).toBe(true)
            expect(result.isErr()).toBe(false)
            expect(result._unsafeUnwrap()).toEqual(lnurlOkResponse)
        })

        it('should bubble up a NotOkHttpResponseError if the LNURL callback URL returns a non-ok response', async () => {
            const result = await constructUrl(
                lnurlErrorCallbackUrl,
            ).asyncAndThen(lnurlCallback)

            expect(result.isOk()).toBe(false)
            expect(result.isErr()).toBe(true)
            expect(result._unsafeUnwrapErr()._tag).toBe(
                'NotOkHttpResponseError',
            )
        })

        it('should bubble up a MalformedDataError if the LNURL callback URL returns a non-JSON response', async () => {
            const result =
                await constructUrl(lnurlInvalidHtmlUrl).asyncAndThen(
                    lnurlCallback,
                )

            expect(result.isOk()).toBe(false)
            expect(result.isErr()).toBe(true)
            expect(result._unsafeUnwrapErr()._tag).toEqual('MalformedDataError')
        })
    })

    describe('lnurlAuth', () => {
        it('should successfully submit an auth request to an LNURL callback URL', async () => {
            server.use(
                rest.get(lnurlOkCallbackUrl, (req, res, ctx) => {
                    expect(req.url.searchParams.get('sig')).toBe('foo')
                    expect(req.url.searchParams.get('key')).toBe('bar')

                    return res(
                        ctx.status(200),
                        ctx.set('Content-Type', 'application/json'),
                        ctx.body(JSON.stringify(lnurlOkResponse)),
                    )
                }),
            )

            const authResult = await lnurlAuth(fedimint, {
                domain: lnurlOkCallbackUrl,
                callback: lnurlOkCallbackUrl,
                k1: 'foo',
            })

            expect(authResult.isOk()).toBe(true)
            expect(authResult.isErr()).toBe(false)
            expect(authResult._unsafeUnwrap()).toEqual(lnurlOkResponse)
        })

        it('should bubble up a FetchError if the LNURL auth callback URL errors', async () => {
            server.use(
                rest.get(lnurlErrorCallbackUrl, (req, res, ctx) => {
                    expect(req.url.searchParams.get('sig')).toBe('foo')
                    expect(req.url.searchParams.get('key')).toBe('bar')

                    return res(
                        ctx.status(200),
                        ctx.set('Content-Type', 'application/json'),
                        ctx.body(JSON.stringify(lnurlErrorResponse)),
                    )
                }),
            )

            const authResult = await lnurlAuth(fedimint, {
                domain: lnurlErrorCallbackUrl,
                callback: lnurlErrorCallbackUrl,
                k1: 'foo',
            })

            expect(authResult.isOk()).toBe(false)
            expect(authResult.isErr()).toBe(true)
            expect(authResult._unsafeUnwrapErr()._tag).toEqual('FetchError')
        })

        it('should bubble up a MalformedDataError if the LNURL auth callback URL returns a non-JSON response', async () => {
            const authResult = await lnurlAuth(fedimint, {
                domain: lnurlInvalidHtmlUrl,
                callback: lnurlInvalidHtmlUrl,
                k1: 'foo',
            })

            expect(authResult.isOk()).toBe(false)
            expect(authResult.isErr()).toBe(true)
            expect(authResult._unsafeUnwrapErr()._tag).toEqual(
                'MalformedDataError',
            )
        })
    })

    describe('lnurlPay', () => {
        it('should successfully pay an invoice provided by an LNURL callback', async () => {
            const result = await lnurlPay(
                fedimint,
                testFederationId,
                {
                    domain: lnurlPayCallbackUrl,
                    callback: lnurlPayCallbackUrl,
                    metadata: [],
                },
                1000 as MSats,
            )

            expect(result.isOk()).toBe(true)
            expect(result.isErr()).toBe(false)
            expect(result._unsafeUnwrap()).toEqual({ preimage: 'preimage' })
        })

        it('should bubble up a NotOkHttpResponseError if the LNURL pay callback URL returns a non-ok response', async () => {
            const result = await lnurlPay(
                fedimint,
                testFederationId,
                {
                    domain: lnurlErrorCallbackUrl,
                    callback: lnurlErrorCallbackUrl,
                    metadata: [],
                },
                1000 as MSats,
            )

            expect(result.isOk()).toBe(false)
            expect(result.isErr()).toBe(true)
            expect(result._unsafeUnwrapErr()._tag).toBe(
                'NotOkHttpResponseError',
            )
        })

        it('should bubble up a MalformedDataError if the LNURL pay callback URL returns a non-JSON response', async () => {
            const result = await lnurlPay(
                fedimint,
                testFederationId,
                {
                    domain: lnurlInvalidHtmlUrl,
                    callback: lnurlInvalidHtmlUrl,
                    metadata: [],
                },
                1000 as MSats,
            )

            expect(result.isOk()).toBe(false)
            expect(result.isErr()).toBe(true)
            expect(result._unsafeUnwrapErr()._tag).toBe('MalformedDataError')
        })
    })

    describe('lnurlWithdraw', () => {
        it('should successfully withdraw an invoice provided by an LNURL callback', async () => {
            const result = await lnurlWithdraw(
                fedimint,
                testFederationId,
                {
                    domain: lnurlOkCallbackUrl,
                    callback: lnurlOkCallbackUrl,
                    k1: 'foo',
                },
                1000 as MSats,
            )

            expect(result.isOk()).toBe(true)
            expect(result.isErr()).toBe(false)
            expect(result._unsafeUnwrap()).toEqual(lnurlWithdrawInvoice)
        })

        it('should bubble up a NotOkHttpResponseError if the LNURL withdraw callback URL returns a non-ok response', async () => {
            const result = await lnurlWithdraw(
                fedimint,
                testFederationId,
                {
                    domain: lnurlErrorCallbackUrl,
                    callback: lnurlErrorCallbackUrl,
                    k1: 'foo',
                },
                1000 as MSats,
            )

            expect(result.isOk()).toBe(false)
            expect(result.isErr()).toBe(true)
            expect(result._unsafeUnwrapErr()._tag).toBe(
                'NotOkHttpResponseError',
            )
        })

        it('should bubble up a MalformedDataError if the LNURL withdraw callback URL returns a non-JSON response', async () => {
            const result = await lnurlWithdraw(
                fedimint,
                testFederationId,
                {
                    domain: lnurlInvalidHtmlUrl,
                    callback: lnurlInvalidHtmlUrl,
                    k1: 'foo',
                },
                1000 as MSats,
            )

            expect(result.isOk()).toBe(false)
            expect(result.isErr()).toBe(true)
            expect(result._unsafeUnwrapErr()._tag).toBe('MalformedDataError')
        })
    })
})
