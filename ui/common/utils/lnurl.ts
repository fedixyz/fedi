import {
    MSats,
    ParsedLnurlAuth,
    ParsedLnurlPay,
    ParsedLnurlWithdraw,
} from '../types'
import { FedimintBridge } from './fedimint'

/**
 * Given a federation and a set of parsed LNURL Auth data, submit an auth request.
 * Can throw with a standard `fetch` error, or an error containing the message
 * from the service.
 */
export async function lnurlAuth(
    fedimint: FedimintBridge,
    federationId: string,
    lnurlData: ParsedLnurlAuth['data'],
) {
    const { signature, pubkey } = await fedimint.signLnurlMessage(
        lnurlData.k1,
        lnurlData.domain,
        federationId,
    )
    const callbackUrl = new URL(lnurlData.callback)
    callbackUrl.searchParams.set('sig', signature)
    callbackUrl.searchParams.set('key', pubkey)

    return lnurlCallback(callbackUrl)
}

/**
 * Given a federation, parsed lnurl pay data, and an amount, pay an invoice
 * provided by an LNURL callback.
 */
export async function lnurlPay(
    fedimint: FedimintBridge,
    federationId: string,
    lnurlData: ParsedLnurlPay['data'],
    amount: MSats,
) {
    const callbackUrl = new URL(lnurlData.callback)
    callbackUrl.searchParams.set('amount', amount.toString())

    // Don't use lnurlCallback, success does not have `status: 'OK'`
    const res = await fetch(callbackUrl.toString()).then(r => r.json())
    if (!res.pr || res.status === 'ERROR') {
        throw new Error(res.reason || 'errors.unknown-error')
    }

    return fedimint.payInvoice(res.pr, federationId)
}

/**
 * Given a federation, parsed lnurl withdraw data, and an amount, generate an
 * invoice and submit a withdraw request. Promise resolves when the server
 * responds, not when the payment has been made, so you should listen for
 * the payment on the fedimint bridge side after calling this.
 */
export async function lnurlWithdraw(
    fedimint: FedimintBridge,
    federationId: string,
    lnurlData: ParsedLnurlWithdraw['data'],
    amount: MSats,
    note?: string,
) {
    const invoice = await fedimint.generateInvoice(
        amount,
        note || '',
        federationId,
    )

    const callbackUrl = new URL(lnurlData.callback)
    callbackUrl.searchParams.set('k1', lnurlData.k1)
    callbackUrl.searchParams.set('pr', invoice)

    await lnurlCallback(callbackUrl)
    return invoice
}

/**
 * Submit a fetch request to an LNURL callback. Resolves if the result is OK,
 * throws if the response is anything but that.
 */
async function lnurlCallback(callbackUrl: URL | string) {
    const res = await fetch(callbackUrl.toString()).then(r => r.json())
    const status = res.status || res['STATUS']
    if (status.toLowerCase() === 'ok') {
        return
    } else {
        throw new Error(res.reason || 'errors.unknown-error')
    }
}
