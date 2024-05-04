import { BtcLnUri } from '../types'

// normalizes a payment request string by making sure it is always
// in standard BtcLnUri form
export const normalizePaymentRequest = (input: string): BtcLnUri => {
    // if there is no 'lightning:' or 'bitcoin:' prefix, this is not a URI
    const prefixIndex = input.indexOf(':')
    if (prefixIndex === -1) {
        return new BtcLnUri({
            type: null,
            body: input,
            paramsString: null,
        })
    }
    // if this is a URI, strip out the prefix
    const body = input.substring(prefixIndex + 1)

    // check for params
    const paramsIndex = body.indexOf('?')
    // if there are no params, return the body
    // otherwise strip out the params first
    if (paramsIndex === -1) {
        return new BtcLnUri({
            type: null,
            body: body,
            paramsString: null,
        })
    } else {
        return new BtcLnUri({
            type: null,
            body: body.substring(0, paramsIndex),
            paramsString: body.substring(paramsIndex + 1),
        })
    }
}
